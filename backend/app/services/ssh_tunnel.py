"""SSH port-forward tunnel manager using paramiko.

Creates local TCP listeners that forward connections to Ollama
on remote VMs over SSH, so port 11434 never needs to be open
in the NSG — all Ollama traffic is encrypted inside SSH.
"""

from __future__ import annotations

import logging
import select
import socket
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import paramiko

logger = logging.getLogger(__name__)


@dataclass
class TunnelState:
    local_port: int
    vm_ip: str
    transport: paramiko.Transport
    server_sock: socket.socket
    serve_thread: threading.Thread
    stop_event: threading.Event = field(default_factory=threading.Event)

    @property
    def is_alive(self) -> bool:
        return self.transport.is_active() and not self.stop_event.is_set()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.local_port}"


def _forward_channel(transport: paramiko.Transport, local_sock: socket.socket, remote_port: int) -> None:
    """Bidirectionally forward one TCP connection via SSH channel."""
    try:
        chan = transport.open_channel(
            "direct-tcpip",
            ("127.0.0.1", remote_port),
            local_sock.getpeername(),
        )
    except Exception as e:
        logger.debug("SSH channel open failed: %s", e)
        local_sock.close()
        return

    try:
        while True:
            r, _, x = select.select([local_sock, chan], [], [local_sock, chan], 5.0)
            if x:
                break
            if local_sock in r:
                data = local_sock.recv(65536)
                if not data:
                    break
                chan.sendall(data)
            if chan in r:
                data = chan.recv(65536)
                if not data:
                    break
                local_sock.sendall(data)
    except Exception:
        pass
    finally:
        try:
            chan.close()
        except Exception:
            pass
        try:
            local_sock.close()
        except Exception:
            pass


def _serve(state: TunnelState, remote_port: int) -> None:
    """Accept loop — runs in a daemon thread."""
    state.server_sock.settimeout(1.0)
    while not state.stop_event.is_set():
        try:
            client, _ = state.server_sock.accept()
        except socket.timeout:
            continue
        except OSError:
            break
        t = threading.Thread(
            target=_forward_channel,
            args=(state.transport, client, remote_port),
            daemon=True,
        )
        t.start()


class SSHTunnelManager:
    """Manages SSH port-forward tunnels to cloud VMs.

    Each active deployment gets one tunnel; calls to ``start_tunnel``
    for the same deployment_id replace the previous tunnel.
    """

    def __init__(self) -> None:
        self._tunnels: dict[str, TunnelState] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _free_port() -> int:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    def start_tunnel(
        self,
        deployment_id: str,
        vm_ip: str,
        ssh_key_path: str,
        vm_user: str = "azureuser",
        remote_port: int = 11434,
    ) -> str:
        """Open (or re-open) an SSH tunnel. Returns the local Ollama URL."""
        with self._lock:
            self._stop_locked(deployment_id)

            key_path = str(Path(ssh_key_path).expanduser())
            if key_path.endswith(".pub"):
                key_path = key_path[:-4]

            transport = paramiko.Transport((vm_ip, 22))
            transport.set_keepalive(30)

            try:
                pkey: Any = paramiko.Ed25519Key.from_private_key_file(key_path)
            except paramiko.SSHException:
                pkey = paramiko.RSAKey.from_private_key_file(key_path)

            transport.connect(username=vm_user, pkey=pkey)

            local_port = self._free_port()
            server_sock = socket.socket()
            server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_sock.bind(("127.0.0.1", local_port))
            server_sock.listen(10)

            stop_event = threading.Event()
            state = TunnelState(
                local_port=local_port,
                vm_ip=vm_ip,
                transport=transport,
                server_sock=server_sock,
                serve_thread=threading.Thread(
                    target=_serve,
                    args=(None, remote_port),  # placeholder — overwritten below
                    daemon=True,
                ),
                stop_event=stop_event,
            )
            # Replace placeholder thread with real one that has state
            state.serve_thread = threading.Thread(
                target=_serve,
                args=(state, remote_port),
                daemon=True,
            )
            state.serve_thread.start()

            self._tunnels[deployment_id] = state
            logger.info(
                "SSH tunnel started for %s: 127.0.0.1:%d → %s:%d",
                deployment_id[:8],
                local_port,
                vm_ip,
                remote_port,
            )
            return state.url

    def get_url(self, deployment_id: str) -> str | None:
        """Return the local URL if the tunnel is alive, else None."""
        with self._lock:
            state = self._tunnels.get(deployment_id)
            if state and state.is_alive:
                return state.url
            return None

    def stop_tunnel(self, deployment_id: str) -> None:
        with self._lock:
            self._stop_locked(deployment_id)

    def _stop_locked(self, deployment_id: str) -> None:
        state = self._tunnels.pop(deployment_id, None)
        if not state:
            return
        state.stop_event.set()
        try:
            state.server_sock.close()
        except Exception:
            pass
        try:
            state.transport.close()
        except Exception:
            pass
        logger.info("SSH tunnel stopped for %s", deployment_id[:8])

    def stop_all(self) -> None:
        with self._lock:
            for dep_id in list(self._tunnels):
                self._stop_locked(dep_id)


_tunnel_manager: SSHTunnelManager | None = None
_tm_lock = threading.Lock()


def get_tunnel_manager() -> SSHTunnelManager:
    global _tunnel_manager
    if _tunnel_manager is None:
        with _tm_lock:
            if _tunnel_manager is None:
                _tunnel_manager = SSHTunnelManager()
    return _tunnel_manager
