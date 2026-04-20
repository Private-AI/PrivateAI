"""Remote VM software setup via SSH — Azure implementation.

Installs NVIDIA drivers, Ollama, and pulls models over SSH.
Also provides live model management helpers (list / pull / delete).
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

import paramiko

from app.models.deployment import StepProgress
from app.providers.base import SetupResult

logger = logging.getLogger(__name__)

_MODEL_TAG_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")

SETUP_STEPS = [
    ("connect", "Connecting via SSH"),
    ("update_system", "Updating system packages"),
    ("mount_disk", "Mounting model storage"),
    ("nvidia_driver", "Installing NVIDIA driver"),
    ("install_ollama", "Installing and configuring Ollama"),
    ("pull_models", "Pulling AI models"),
]


# ── SSH helpers ───────────────────────────────────────────────────────


def _run_ssh(
    client: paramiko.SSHClient,
    command: str,
    timeout: int = 300,
) -> tuple[int, str, str]:
    """Run a command over SSH — reads output before exit status to avoid
    the Paramiko buffer deadlock.
    """
    _, stdout_ch, stderr_ch = client.exec_command(command, timeout=timeout)
    stdout = stdout_ch.read().decode("utf-8", errors="replace")
    stderr = stderr_ch.read().decode("utf-8", errors="replace")
    exit_code = stdout_ch.channel.recv_exit_status()
    return exit_code, stdout, stderr


def _make_step(step_id: str, label: str, status: str = "pending") -> StepProgress:
    return StepProgress(step=step_id, label=label, status=status)


def _ssh_connect(
    ip: str,
    username: str,
    ssh_key_path: str,
    retries: int = 12,
    delay: float = 5.0,
) -> paramiko.SSHClient | None:
    """Try to connect via SSH up to ``retries`` times. Returns client or None."""
    from pathlib import Path

    key_path = Path(ssh_key_path).expanduser()
    if key_path.suffix == ".pub":
        key_path = key_path.with_suffix("")
    if not key_path.exists():
        logger.error("SSH private key not found: %s", key_path)
        return None

    try:
        pkey: Any = paramiko.Ed25519Key.from_private_key_file(str(key_path))
    except paramiko.SSHException:
        pkey = paramiko.RSAKey.from_private_key_file(str(key_path))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    for attempt in range(retries):
        try:
            client.connect(
                hostname=ip,
                username=username,
                pkey=pkey,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
            )
            return client
        except Exception:
            if attempt < retries - 1:
                time.sleep(delay)

    client.close()
    return None


# ── Main setup function ───────────────────────────────────────────────


def setup_vm_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
    models: list[str] | None = None,
    has_data_disk: bool = True,
    has_gpu: bool = False,
    progress_callback: Any | None = None,
) -> SetupResult:
    """Install NVIDIA drivers, Ollama, and pull models over SSH.

    Args:
        ip: Public IP of the VM.
        username: SSH user.
        ssh_key_path: Path to SSH private key.
        models: Ollama model tags to pull.
        has_data_disk: Whether a separate data disk was attached.
        progress_callback: Optional ``(step, current, total, msg)`` callback.
    """
    if models is None:
        models = ["gemma3:4b"]

    steps = [_make_step(s_id, s_label) for s_id, s_label in SETUP_STEPS]
    total = len(steps)
    result = SetupResult(success=False, steps=steps)

    def _progress(idx: int, status: str, detail: str = "") -> None:
        steps[idx].status = status
        now = datetime.now(timezone.utc)
        if status == "in_progress":
            steps[idx].started_at = now
        elif status in ("completed", "failed"):
            steps[idx].completed_at = now
        steps[idx].detail = detail
        if progress_callback:
            progress_callback(steps[idx].step, status, idx + 1, total, detail)

    # ── 1. Connect ───────────────────────────────────────────
    _progress(0, "in_progress")
    client = _ssh_connect(ip, username, ssh_key_path)
    if not client:
        result.error = f"Could not connect to {ip} after 60 seconds"
        _progress(0, "failed", result.error)
        return result
    _progress(0, "completed", f"connected to {username}@{ip}")

    try:
        # ── 2. Update system ─────────────────────────────────
        _progress(1, "in_progress")
        ec, out, err = _run_ssh(
            client,
            "sudo apt-get update -qq && sudo apt-get upgrade -y -qq",
            timeout=600,
        )
        if ec != 0:
            detail = err.strip() or out.strip()
            logger.error("apt upgrade stdout: %s", out[-500:])
            logger.error("apt upgrade stderr: %s", err[-500:])
            result.error = f"System update failed: {detail[-400:]}"
            _progress(1, "failed", result.error)
            return result
        _progress(1, "completed")

        # ── 3. Mount / prepare model storage ─────────────────
        _progress(2, "in_progress")
        if has_data_disk:
            mount_script = r"""
set -euo pipefail
if mountpoint -q /models 2>/dev/null; then
    echo "ALREADY_MOUNTED"
    exit 0
fi
DATA_DISK=""
for dev in $(lsblk -dno NAME,HCTL 2>/dev/null | awk '$2 ~ /^1:/ {print "/dev/"$1}'); do
    if [ -b "$dev" ] && ! lsblk -n "$dev" | grep -q part; then
        DATA_DISK="$dev"; break
    fi
done
if [ -z "$DATA_DISK" ]; then
    for disk in /dev/sd{b,c,d,e}; do
        if [ -b "$disk" ] && ! lsblk -n "$disk" | grep -q part \
            && ! lsblk -n -o MOUNTPOINT "$disk" | grep -q '/'; then
            DATA_DISK="$disk"; break
        fi
    done
fi
if [ -z "$DATA_DISK" ]; then
    echo "NO_DISK_FOUND"
    sudo mkdir -p /models
    exit 0
fi
echo "FORMATTING=$DATA_DISK"
sudo parted "$DATA_DISK" --script mklabel gpt
sudo parted "$DATA_DISK" --script mkpart primary ext4 0% 100%
sleep 2
PART="${DATA_DISK}1"
sudo mkfs.ext4 -F "$PART"
sudo mkdir -p /models
sudo mount "$PART" /models
UUID=$(sudo blkid -s UUID -o value "$PART")
echo "UUID=$UUID /models ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
echo "MOUNTED=$PART"
"""
            ec, out, err = _run_ssh(client, mount_script, timeout=120)
            if ec != 0:
                result.error = f"Disk mount failed: {err[:500]}"
                _progress(2, "failed", result.error)
                return result
            mount_info = out.strip().split("\n")[-1]
            _progress(2, "completed", mount_info)
        else:
            # No separate data disk — use a directory on the OS disk
            ec, _, err = _run_ssh(client, "sudo mkdir -p /models", timeout=30)
            if ec != 0:
                result.error = f"Failed to create /models directory: {err[:300]}"
                _progress(2, "failed", result.error)
                return result
            _progress(2, "completed", "using OS disk for model storage")

        ec, _, err = _run_ssh(
            client,
            "sudo mkdir -p /models/ollama",
            timeout=30,
        )
        if ec != 0:
            result.error = f"Failed to prepare model storage: {err[:300]}"
            _progress(2, "failed", result.error)
            return result

        # ── 4. NVIDIA driver ──────────────────────────────────
        _progress(3, "in_progress")
        if not has_gpu:
            _progress(3, "completed", "skipped (CPU-only VM)")
        else:
            nvidia_script = r"""
set -euo pipefail
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
    echo "DRIVER_OK"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
    exit 0
fi
sudo apt-get install -y ubuntu-drivers-common
sudo ubuntu-drivers install --gpgpu || true
if ! dpkg -l | grep -q nvidia-driver; then
    sudo apt-get install -y nvidia-driver-535-server || true
fi
sudo modprobe nvidia 2>/dev/null || true
if nvidia-smi &>/dev/null; then
    echo "DRIVER_INSTALLED"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
else
    echo "REBOOT_REQUIRED"
    exit 100
fi
"""
            ec, out, err = _run_ssh(client, nvidia_script, timeout=600)

            if ec == 100 or "REBOOT_REQUIRED" in out:
                result.reboot_required = True
                result.error = "VM needs a reboot for NVIDIA drivers. Reboot and re-run setup."
                _progress(3, "failed", "reboot required")
                return result
            elif ec != 0:
                _progress(3, "completed", "skipped (no GPU detected)")
            else:
                gpu_lines = [ln for ln in out.strip().split("\n") if ln and "DRIVER" not in ln]
                result.gpu_info = "; ".join(gpu_lines)
                _progress(3, "completed", result.gpu_info or "GPU ready")

        # ── 5. Install Ollama ─────────────────────────────────
        _progress(4, "in_progress")
        ollama_script = r"""
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh 2>&1
fi
sudo mkdir -p /etc/systemd/system/ollama.service.d
cat << 'SVCCONF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
[Service]
Environment="OLLAMA_MODELS=/models/ollama"
Environment="OLLAMA_HOST=127.0.0.1:11434"
SVCCONF
sudo mkdir -p /models/ollama
sudo chown -R ollama:ollama /models/ollama
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        echo "OLLAMA_READY"
        ollama --version 2>/dev/null || echo "version unknown"
        exit 0
    fi
    sleep 2
done
echo "OLLAMA_TIMEOUT"
exit 1
"""
        ec, out, err = _run_ssh(client, ollama_script, timeout=600)
        if ec != 0:
            detail = err.strip() or out.strip()
            logger.error("Ollama install stdout: %s", out[-1000:])
            logger.error("Ollama install stderr: %s", err[-500:])
            result.error = f"Ollama install failed: {detail[-400:]}"
            _progress(4, "failed", result.error)
            return result
        _progress(4, "completed")

        # ── 6. Pull models ────────────────────────────────────
        _progress(5, "in_progress", f"{len(models)} model(s)")
        for model in models:
            if not _MODEL_TAG_RE.match(model):
                logger.warning("Skipping invalid model tag: %s", model)
                continue
            ec, _, err = _run_ssh(
                client,
                f"OLLAMA_MODELS=/models/ollama ollama pull '{model}'",
                timeout=1800,
            )
            if ec == 0:
                result.models_installed.append(model)
            else:
                logger.warning("Failed to pull model %s: %s", model, err[:200])

        _progress(5, "completed", f"{len(result.models_installed)}/{len(models)} pulled")

        result.success = True
        logger.info("VM setup complete: gpu=%s models=%s", result.gpu_info, result.models_installed)
        return result

    except Exception as e:
        result.error = str(e)
        logger.error("VM setup failed: %s", e, exc_info=True)
        return result

    finally:
        client.close()


# ── Live model management ─────────────────────────────────────────────


def list_models_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
) -> list[dict[str, Any]]:
    """Return installed Ollama models via SSH."""
    client = _ssh_connect(ip, username, ssh_key_path, retries=3, delay=2.0)
    if not client:
        raise RuntimeError(f"Cannot connect to {ip}")
    try:
        ec, out, err = _run_ssh(
            client,
            "curl -sf http://127.0.0.1:11434/api/tags",
            timeout=15,
        )
        if ec != 0:
            raise RuntimeError(f"Ollama not responding: {err[:200]}")
        data = json.loads(out)
        return data.get("models", [])
    finally:
        client.close()


def pull_model_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
    model: str,
) -> dict[str, Any]:
    """Pull an Ollama model on the VM via SSH."""
    if not _MODEL_TAG_RE.match(model):
        raise ValueError(f"Invalid model tag: {model!r}")

    client = _ssh_connect(ip, username, ssh_key_path, retries=3, delay=2.0)
    if not client:
        raise RuntimeError(f"Cannot connect to {ip}")
    try:
        ec, out, err = _run_ssh(
            client,
            f"OLLAMA_MODELS=/models/ollama ollama pull '{model}'",
            timeout=1800,
        )
        if ec != 0:
            return {"success": False, "model": model, "error": err[:500]}
        return {"success": True, "model": model}
    finally:
        client.close()


def delete_model_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
    model: str,
) -> dict[str, Any]:
    """Delete an Ollama model from the VM via SSH."""
    if not _MODEL_TAG_RE.match(model):
        raise ValueError(f"Invalid model tag: {model!r}")

    client = _ssh_connect(ip, username, ssh_key_path, retries=3, delay=2.0)
    if not client:
        raise RuntimeError(f"Cannot connect to {ip}")
    try:
        ec, out, err = _run_ssh(
            client,
            f"OLLAMA_MODELS=/models/ollama ollama rm '{model}'",
            timeout=60,
        )
        if ec != 0:
            return {"success": False, "model": model, "error": err[:500]}
        return {"success": True, "model": model}
    finally:
        client.close()
