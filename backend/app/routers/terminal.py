"""WebSocket terminal endpoint — bridges browser to VM SSH via Paramiko.

The frontend connects a WebSocket here and gets an interactive SSH
session. Data flows:

    browser (xterm.js) <--WS--> FastAPI <--Paramiko--> VM (sshd)

In test mode, a mock shell echoes input back with a fake prompt.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.providers.registry import is_test_mode
from app.services.orchestrator import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/deployments", tags=["terminal"])


# ── Mock terminal for test mode ──────────────────────────────────────


class MockTerminal:
    """Fake SSH session that echoes input with a prompt."""

    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, data: str) -> str:
        """Process input characters, return output to send to the client."""
        out = ""
        for ch in data:
            if ch == "\r" or ch == "\n":
                # Echo the newline, fake process the command, show new prompt
                cmd = self._buffer.strip()
                out += "\r\n"
                if cmd == "":
                    pass
                elif cmd == "exit":
                    out += "logout\r\n"
                elif cmd == "whoami":
                    out += "azureuser\r\n"
                elif cmd == "hostname":
                    out += "privateai-vm\r\n"
                elif cmd == "uname -a":
                    out += (
                        "Linux privateai-vm 5.15.0-1064-azure #73-Ubuntu SMP x86_64 GNU/Linux\r\n"
                    )
                elif cmd.startswith("nvidia-smi"):
                    out += (
                        "+-----------------------------------------------------------------------------+\r\n"
                        "| NVIDIA-SMI 535.129.03   Driver Version: 535.129.03   CUDA Version: 12.2     |\r\n"
                        "|-------------------------------+----------------------+----------------------+\r\n"
                        "| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |\r\n"
                        "| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |\r\n"
                        "|===============================+======================+======================|\r\n"
                        "|   0  NVIDIA H100 80GB    On   | 00000001:00:00.0 Off |                    0 |\r\n"
                        "| N/A   31C    P0    72W / 700W |    256MiB / 81559MiB |      0%      Default |\r\n"
                        "+-------------------------------+----------------------+----------------------+\r\n"
                    )
                elif cmd == "ollama list":
                    out += (
                        "NAME              ID              SIZE      MODIFIED\r\n"
                        "gemma3:4b         a2af6cc3eb7f    3.3 GB    2 hours ago\r\n"
                    )
                elif cmd == "df -h /models":
                    out += (
                        "Filesystem      Size  Used Avail Use% Mounted on\r\n"
                        "/dev/sdc1       1007G   14G  942G   2% /models\r\n"
                    )
                elif cmd == "free -h":
                    out += (
                        "               total        used        free      shared  buff/cache   available\r\n"
                        "Mem:           315Gi        12Gi       290Gi       0.0Ki        13Gi       300Gi\r\n"
                        "Swap:            0B          0B          0B\r\n"
                    )
                elif cmd == "ls /models/ollama":
                    out += "blobs  manifests\r\n"
                elif cmd == "uptime":
                    out += (
                        " 14:32:07 up 2 days,  3:14,  1 user,  load average: 0.08, 0.03, 0.01\r\n"
                    )
                elif cmd == "help":
                    out += (
                        "Mock SSH terminal (test mode)\r\n"
                        "Available commands: whoami, hostname, uname -a, nvidia-smi,\r\n"
                        "  ollama list, df -h /models, free -h, uptime, ls, help, exit\r\n"
                    )
                else:
                    out += f"-bash: {cmd}: command not found\r\n"
                self._buffer = ""
                out += "\x1b[32mazureuser@privateai-vm\x1b[0m:\x1b[34m~\x1b[0m$ "
            elif ch == "\x7f" or ch == "\b":
                # Backspace
                if self._buffer:
                    self._buffer = self._buffer[:-1]
                    out += "\b \b"
            elif ch == "\x03":
                # Ctrl+C
                self._buffer = ""
                out += "^C\r\n\x1b[32mazureuser@privateai-vm\x1b[0m:\x1b[34m~\x1b[0m$ "
            else:
                self._buffer += ch
                out += ch
        return out

    def banner(self) -> str:
        return (
            "\x1b[2J\x1b[H"  # clear screen
            "Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-1064-azure x86_64)\r\n"
            "\r\n"
            " * Documentation:  https://help.ubuntu.com\r\n"
            " * Management:     https://landscape.canonical.com\r\n"
            "\r\n"
            "Last login: Mon Apr 14 11:18:02 2025 from 203.0.113.42\r\n"
            "\x1b[32mazureuser@privateai-vm\x1b[0m:\x1b[34m~\x1b[0m$ "
        )


# ── Real SSH terminal via Paramiko ───────────────────────────────────


def _run_ssh_bridge(
    ws_send: asyncio.Queue[str],
    ws_recv: asyncio.Queue[str],
    host: str,
    username: str,
    key_path: str,
    stop_event: threading.Event,
) -> None:
    """Run a Paramiko SSH channel in a background thread.

    Reads from ``ws_recv`` (keystrokes from the browser) and writes to
    ``ws_send`` (terminal output back to the browser).
    """
    import paramiko

    try:
        key_file = Path(key_path).expanduser()
        if key_file.suffix == ".pub":
            key_file = key_file.with_suffix("")

        pkey = paramiko.Ed25519Key.from_private_key_file(str(key_file))

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=host,
            username=username,
            pkey=pkey,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )

        channel = client.get_transport().open_session()  # type: ignore[union-attr]
        channel.get_pty(term="xterm-256color", width=120, height=40)
        channel.invoke_shell()
        channel.settimeout(0.1)

        while not stop_event.is_set():
            # Read from SSH channel -> send to browser
            try:
                if channel.recv_ready():
                    data = channel.recv(4096).decode("utf-8", errors="replace")
                    ws_send.put_nowait(data)
            except Exception:
                pass

            # Read from browser -> send to SSH channel
            try:
                data = ws_recv.get_nowait()
                channel.sendall(data.encode("utf-8"))
            except Exception:
                pass

            if channel.exit_status_ready():
                break

            stop_event.wait(0.02)

        channel.close()
        client.close()

    except Exception as e:
        logger.error("SSH bridge error: %s", e)
        ws_send.put_nowait(f"\r\n\x1b[31mSSH connection failed: {e}\x1b[0m\r\n")


# ── WebSocket endpoint ───────────────────────────────────────────────


@router.websocket("/{deployment_id}/terminal")
async def terminal_ws(websocket: WebSocket, deployment_id: str):
    """Interactive SSH terminal over WebSocket.

    The frontend sends raw keystrokes; the backend relays them to the
    VM via Paramiko and streams output back.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record or not record.public_ip:
        await websocket.close(code=4004, reason="Deployment not found or no IP")
        return

    await websocket.accept()

    if is_test_mode():
        # Mock terminal — no real SSH
        mock = MockTerminal()
        await websocket.send_text(mock.banner())
        try:
            while True:
                data = await websocket.receive_text()
                response = mock.feed(data)
                if response:
                    await websocket.send_text(response)
                if "logout" in response:
                    await websocket.close()
                    return
        except WebSocketDisconnect:
            return

    # Real SSH bridge
    ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
    vm_user = record.provider_metadata.get("vm_user", "azureuser")
    host = record.public_ip

    send_queue: asyncio.Queue[str] = asyncio.Queue()
    recv_queue: asyncio.Queue[str] = asyncio.Queue()
    stop_event = threading.Event()

    # Start SSH bridge thread
    bridge_thread = threading.Thread(
        target=_run_ssh_bridge,
        args=(send_queue, recv_queue, host, vm_user, ssh_key, stop_event),
        daemon=True,
    )
    bridge_thread.start()

    try:
        while True:
            # Relay from SSH -> browser
            while not send_queue.empty():
                data = send_queue.get_nowait()
                await websocket.send_text(data)

            # Relay from browser -> SSH (non-blocking)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.05)
                recv_queue.put_nowait(data)
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        pass
    finally:
        stop_event.set()
        bridge_thread.join(timeout=3)
