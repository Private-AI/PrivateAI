"""Remote VM software setup via SSH — Azure implementation.

Refactored from the original ``azure_setup.vm_setup`` module.
Installs NVIDIA drivers, Ollama, pulls models, and optionally deploys
Open WebUI via Docker.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

import paramiko

from app.models.deployment import StepProgress
from app.providers.base import SetupResult

logger = logging.getLogger(__name__)

# Allowed characters in an Ollama model tag.
_MODEL_TAG_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")

# Step definitions for VM setup
SETUP_STEPS = [
    ("connect", "Connecting via SSH"),
    ("update_system", "Updating system packages"),
    ("mount_disk", "Mounting data disk at /models"),
    ("nvidia_driver", "Installing NVIDIA driver"),
    ("install_ollama", "Installing and configuring Ollama"),
    ("pull_models", "Pulling AI models"),
    ("install_open_webui", "Installing Open WebUI"),
]


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


def setup_vm_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
    models: list[str] | None = None,
    deploy_open_webui: bool = False,
    open_webui_port: int = 3000,
    progress_callback: Any | None = None,
) -> SetupResult:
    """Install NVIDIA drivers, Ollama, models, and optionally Open WebUI.

    This is a synchronous function — the provider wraps it in
    ``asyncio.to_thread()``.

    Args:
        ip: Public IP address of the VM.
        username: SSH username.
        ssh_key_path: Path to the SSH *private* key.
        models: Ollama model tags to pull.
        deploy_open_webui: Whether to install Open WebUI.
        open_webui_port: Port for Open WebUI container.
        progress_callback: Optional ``(step, current, total, msg)`` callback.

    Returns:
        SetupResult with status and installed models.
    """
    from pathlib import Path

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
            progress_callback(steps[idx].step, idx + 1, total, detail)

    key_path = Path(ssh_key_path).expanduser()
    if key_path.suffix == ".pub":
        key_path = key_path.with_suffix("")
    if not key_path.exists():
        alt = key_path.with_suffix("")
        if alt.exists():
            key_path = alt
        else:
            result.error = f"SSH private key not found: {key_path}"
            return result

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        # ── 1. Connect ───────────────────────────────────────
        _progress(0, "in_progress")
        pkey = paramiko.Ed25519Key.from_private_key_file(str(key_path))
        connected = False
        for attempt in range(12):
            try:
                client.connect(
                    hostname=ip,
                    username=username,
                    pkey=pkey,
                    timeout=10,
                    look_for_keys=False,
                    allow_agent=False,
                )
                connected = True
                break
            except Exception:
                if attempt < 11:
                    time.sleep(5)
        if not connected:
            result.error = f"Could not connect to {ip} after 60 seconds"
            _progress(0, "failed", result.error)
            return result
        _progress(0, "completed", f"connected to {username}@{ip}")

        # ── 2. Update system ─────────────────────────────────
        _progress(1, "in_progress")
        exit_code, stdout, stderr = _run_ssh(
            client,
            "sudo apt-get update -qq && sudo apt-get upgrade -y -qq",
            timeout=600,
        )
        if exit_code != 0:
            result.error = f"System update failed: {stderr[:500]}"
            _progress(1, "failed", result.error)
            return result
        _progress(1, "completed")

        # ── 3. Mount data disk ───────────────────────────────
        _progress(2, "in_progress")
        mount_script = r"""
set -euo pipefail
if mountpoint -q /models 2>/dev/null; then
    echo "ALREADY_MOUNTED"
    exit 0
fi

DATA_DISK=""
for dev in $(lsblk -dno NAME,HCTL 2>/dev/null | awk '$2 ~ /^1:/ {print "/dev/"$1}'); do
    if [ -b "$dev" ] && ! lsblk -n "$dev" | grep -q part; then
        DATA_DISK="$dev"
        break
    fi
done

if [ -z "$DATA_DISK" ]; then
    for disk in /dev/sd{b,c,d,e}; do
        if [ -b "$disk" ] \
            && ! lsblk -n "$disk" | grep -q part \
            && ! lsblk -n -o MOUNTPOINT "$disk" | grep -q '/'; then
            DATA_DISK="$disk"
            break
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
        exit_code, stdout, stderr = _run_ssh(client, mount_script, timeout=120)
        if exit_code != 0:
            result.error = f"Disk mount failed: {stderr[:500]}"
            _progress(2, "failed", result.error)
            return result

        _run_ssh(
            client,
            f"sudo mkdir -p /models/ollama && sudo chown -R '{username}' /models/ollama",
        )
        mount_info = stdout.strip().split("\n")[-1]
        _progress(2, "completed", mount_info)

        # ── 4. NVIDIA driver ─────────────────────────────────
        _progress(3, "in_progress")
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
        exit_code, stdout, stderr = _run_ssh(client, nvidia_script, timeout=600)

        if exit_code == 100 or "REBOOT_REQUIRED" in stdout:
            result.reboot_required = True
            result.error = (
                "VM needs a reboot for NVIDIA drivers. Reboot and re-run setup."
            )
            _progress(3, "failed", "reboot required")
            return result
        elif exit_code != 0:
            _progress(3, "completed", "skipped (no GPU detected)")
        else:
            gpu_lines = [
                line
                for line in stdout.strip().split("\n")
                if line and "DRIVER" not in line
            ]
            result.gpu_info = "; ".join(gpu_lines)
            _progress(3, "completed", result.gpu_info)

        # ── 5. Install Ollama ────────────────────────────────
        _progress(4, "in_progress")
        ollama_script = r"""
set -euo pipefail
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

sudo mkdir -p /etc/systemd/system/ollama.service.d
cat << 'SVCCONF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
[Service]
Environment="OLLAMA_MODELS=/models/ollama"
Environment="OLLAMA_HOST=0.0.0.0:11434"
SVCCONF

sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama

for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
        echo "OLLAMA_READY"
        ollama --version 2>/dev/null || echo "version unknown"
        exit 0
    fi
    sleep 1
done
echo "OLLAMA_TIMEOUT"
exit 1
"""
        exit_code, stdout, stderr = _run_ssh(client, ollama_script, timeout=300)
        if exit_code != 0:
            result.error = f"Ollama install failed: {stderr[:500]}"
            _progress(4, "failed", result.error)
            return result
        _progress(4, "completed")

        # ── 6. Pull models ───────────────────────────────────
        _progress(5, "in_progress", f"{len(models)} model(s)")
        for model in models:
            if not _MODEL_TAG_RE.match(model):
                logger.warning("Skipping invalid model tag: %s", model)
                continue
            exit_code, stdout, stderr = _run_ssh(
                client,
                f"OLLAMA_MODELS=/models/ollama ollama pull '{model}'",
                timeout=1800,
            )
            if exit_code == 0:
                result.models_installed.append(model)
            else:
                logger.warning("Failed to pull model %s: %s", model, stderr[:200])

        _progress(
            5,
            "completed",
            f"{len(result.models_installed)}/{len(models)} pulled",
        )

        # ── 7. Open WebUI (optional) ─────────────────────────
        if deploy_open_webui:
            _progress(6, "in_progress")
            open_webui_script = f"""
set -euo pipefail

# Install Docker if not present
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker {username}
fi

# Stop existing Open WebUI container if running
sudo docker stop open-webui 2>/dev/null || true
sudo docker rm open-webui 2>/dev/null || true

# Run Open WebUI container
sudo docker run -d \
    --name open-webui \
    --restart unless-stopped \
    -p {open_webui_port}:8080 \
    -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
    --add-host=host.docker.internal:host-gateway \
    -v open-webui-data:/app/backend/data \
    ghcr.io/open-webui/open-webui:main

# Wait for it to be healthy
for i in $(seq 1 60); do
    if curl -sf http://localhost:{open_webui_port} &>/dev/null; then
        echo "OPEN_WEBUI_READY"
        exit 0
    fi
    sleep 2
done
echo "OPEN_WEBUI_TIMEOUT"
exit 1
"""
            exit_code, stdout, stderr = _run_ssh(client, open_webui_script, timeout=600)
            if exit_code != 0:
                logger.warning("Open WebUI install failed: %s", stderr[:500])
                _progress(6, "failed", f"Open WebUI failed: {stderr[:200]}")
            else:
                _progress(6, "completed")
        else:
            _progress(6, "completed", "skipped (not requested)")

        # ── Done ─────────────────────────────────────────────
        result.success = True
        logger.info(
            "VM setup complete: gpu=%s models=%s",
            result.gpu_info,
            result.models_installed,
        )
        return result

    except Exception as e:
        result.error = str(e)
        logger.error("VM setup failed: %s", e, exc_info=True)
        return result

    finally:
        client.close()
