"""Remote VM validation checks — Azure implementation.

Refactored from the original ``azure_setup.validator`` module.
Runs health checks over SSH to verify the deployment is operational.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from pathlib import Path
from typing import Any

import paramiko

from app.providers.base import ValidationCheck, ValidationResult

logger = logging.getLogger(__name__)


def _run_ssh(
    client: paramiko.SSHClient,
    command: str,
    timeout: int = 30,
) -> tuple[int, str, str]:
    """Run SSH command, reading output before exit status to prevent deadlock."""
    _, stdout_ch, stderr_ch = client.exec_command(command, timeout=timeout)
    stdout = stdout_ch.read().decode("utf-8", errors="replace").strip()
    stderr = stderr_ch.read().decode("utf-8", errors="replace").strip()
    exit_code = stdout_ch.channel.recv_exit_status()
    return exit_code, stdout, stderr


def validate_vm_remote(
    *,
    ip: str,
    username: str = "azureuser",
    ssh_key_path: str = "~/.ssh/id_ed25519",
    check_gpu: bool = False,
) -> ValidationResult:
    """Run all validation checks on a remote VM.

    This is a synchronous function — the provider wraps it in
    ``asyncio.to_thread()``.

    Checks:
        1. SSH connectivity
        2. OS info (distro, CPUs, RAM)
        3. Data disk mount at /models
        4. fstab persistence
        5. NVIDIA GPU (optional)
        6. Ollama binary installed
        7. Ollama systemd service active + correct config
        8. Ollama API (local via SSH curl + remote via urllib)
    """
    result = ValidationResult()

    key_path = Path(ssh_key_path).expanduser()
    if key_path.suffix == ".pub":
        key_path = key_path.with_suffix("")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        # ── Check 1: SSH connectivity ────────────────────────
        try:
            pkey = paramiko.Ed25519Key.from_private_key_file(str(key_path))
            client.connect(
                hostname=ip,
                username=username,
                pkey=pkey,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
            )
            result.checks.append(
                ValidationCheck("SSH connectivity", True, f"Connected to {ip}")
            )
        except Exception as e:
            result.checks.append(ValidationCheck("SSH connectivity", False, str(e)))
            return result  # Cannot continue without SSH

        # ── Check 2: OS info ─────────────────────────────────
        os_cmd = (
            "lsb_release -ds 2>/dev/null"
            " || grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'"
        )
        _, os_info, _ = _run_ssh(client, os_cmd)
        _, cpu_count, _ = _run_ssh(client, "nproc")
        _, mem_gb, _ = _run_ssh(client, "free -g | awk '/Mem:/{print $2}'")
        result.system_info = {"os": os_info, "cpus": cpu_count, "memory_gb": mem_gb}
        result.checks.append(
            ValidationCheck(
                "System info",
                True,
                f"{os_info}, {cpu_count} CPUs, {mem_gb} GB RAM",
            )
        )

        # ── Check 3: Data disk ───────────────────────────────
        exit_code, _, _ = _run_ssh(client, "mountpoint -q /models")
        if exit_code == 0:
            _, disk_size, _ = _run_ssh(client, "df -h /models | awk 'NR==2{print $2}'")
            result.checks.append(
                ValidationCheck(
                    "Data disk mount",
                    True,
                    f"/models mounted ({disk_size})",
                )
            )
        else:
            _, dir_exists, _ = _run_ssh(
                client, "test -d /models && echo yes || echo no"
            )
            result.checks.append(
                ValidationCheck(
                    "Data disk mount",
                    dir_exists == "yes",
                    "/models exists" if dir_exists == "yes" else "/models not found",
                )
            )

        # ── Check 4: fstab ───────────────────────────────────
        exit_code, _, _ = _run_ssh(client, "grep -q /models /etc/fstab")
        result.checks.append(
            ValidationCheck(
                "fstab persistence",
                exit_code == 0,
                "in /etc/fstab" if exit_code == 0 else "not in /etc/fstab",
            )
        )

        # ── Check 5: NVIDIA GPU ──────────────────────────────
        if check_gpu:
            exit_code, gpu_output, _ = _run_ssh(
                client,
                "nvidia-smi --query-gpu=name,driver_version,memory.total "
                "--format=csv,noheader",
            )
            result.checks.append(
                ValidationCheck(
                    "NVIDIA GPU",
                    exit_code == 0 and bool(gpu_output),
                    gpu_output if gpu_output else "nvidia-smi failed",
                    detail=gpu_output,
                )
            )
        else:
            result.checks.append(
                ValidationCheck("NVIDIA GPU", True, "skipped (GPU check not requested)")
            )

        # ── Check 6: Ollama binary ───────────────────────────
        exit_code, ollama_ver, _ = _run_ssh(client, "ollama --version 2>/dev/null")
        result.checks.append(
            ValidationCheck(
                "Ollama installed",
                exit_code == 0,
                ollama_ver if exit_code == 0 else "ollama binary not found",
            )
        )

        # ── Check 7: Ollama service ──────────────────────────
        _, svc_status, _ = _run_ssh(client, "systemctl is-active ollama 2>/dev/null")
        result.checks.append(
            ValidationCheck("Ollama service", svc_status == "active", svc_status)
        )

        if svc_status == "active":
            _, env_output, _ = _run_ssh(
                client,
                "systemctl show ollama --property=Environment 2>/dev/null",
            )
            bound = "OLLAMA_HOST=0.0.0.0" in env_output
            result.checks.append(
                ValidationCheck(
                    "Ollama bound to 0.0.0.0",
                    bound,
                    "accessible remotely" if bound else "may only be on localhost",
                )
            )
            models_dir = "OLLAMA_MODELS=/models" in env_output
            result.checks.append(
                ValidationCheck(
                    "Ollama model dir",
                    models_dir,
                    "/models" if models_dir else "default location",
                )
            )

        # ── Check 8: Ollama API (local) ──────────────────────
        exit_code, api_output, _ = _run_ssh(
            client, "curl -sf http://localhost:11434/api/tags"
        )
        if exit_code == 0 and api_output:
            result.checks.append(
                ValidationCheck("Ollama API (local)", True, "responding on :11434")
            )
            try:
                data: dict[str, Any] = json.loads(api_output)
                model_list = data.get("models", [])
                model_names = [m.get("name", "?") for m in model_list]
                result.checks.append(
                    ValidationCheck(
                        "Models available",
                        len(model_list) > 0,
                        f"{len(model_list)} model(s): {', '.join(model_names)}"
                        if model_list
                        else "none",
                    )
                )
            except (json.JSONDecodeError, KeyError):
                pass
        else:
            result.checks.append(
                ValidationCheck("Ollama API (local)", False, "not responding")
            )

        # ── Check 9: Remote API access ───────────────────────
        try:
            req = urllib.request.Request(f"http://{ip}:11434/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                result.checks.append(
                    ValidationCheck(
                        "Ollama API (remote)",
                        resp.status == 200,
                        f"http://{ip}:11434 reachable"
                        if resp.status == 200
                        else f"HTTP {resp.status}",
                    )
                )
        except Exception as e:
            if svc_status == "active":
                result.checks.append(
                    ValidationCheck("Ollama API (remote)", False, f"not reachable: {e}")
                )
            else:
                result.checks.append(
                    ValidationCheck(
                        "Ollama API (remote)",
                        True,
                        "skipped (service not running)",
                    )
                )

        # ── Check 10: Open WebUI (if docker container exists) ─
        exit_code, webui_status, _ = _run_ssh(
            client,
            "sudo docker inspect --format='{{.State.Status}}' open-webui 2>/dev/null",
        )
        if exit_code == 0:
            result.checks.append(
                ValidationCheck(
                    "Open WebUI container",
                    webui_status.strip() == "running",
                    f"container status: {webui_status.strip()}",
                )
            )

        return result

    finally:
        client.close()
