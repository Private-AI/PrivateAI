"""Local Open WebUI process manager.

Manages the Open WebUI subprocess lifecycle within the same container.
The backend starts, stops, health-checks, and reconfigures Open WebUI
by controlling environment variables and the process itself.

Open WebUI runs from an isolated uv venv at /opt/open-webui-env
(built into the Docker image at build time).
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

import httpx

from app.models.open_webui import (
    OpenWebuiEnvConfig,
    OpenWebuiState,
    OpenWebuiStatus,
)

logger = logging.getLogger(__name__)

# How often the health-check loop pings Open WebUI (seconds)
HEALTH_CHECK_INTERVAL = 10

# Max seconds to wait for the process to become healthy after start
STARTUP_TIMEOUT = 240


class OpenWebuiManager:
    """Singleton that owns the Open WebUI subprocess."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen[bytes] | None = None
        self._config = OpenWebuiEnvConfig()
        self._status = OpenWebuiStatus.STOPPED
        self._error = ""
        self._started_at: float = 0.0
        self._health_task: asyncio.Task[None] | None = None
        self._running = False

        # Track which deployment we're currently connected to
        self._connected_deployment_id: str = ""
        self._connected_deployment_name: str = ""

        # Detect venv path from environment or default
        self._venv_path = os.environ.get(
            "OPEN_WEBUI_VENV",
            "/opt/open-webui-env",
        )

        # Apply env overrides from docker-compose
        data_dir = os.environ.get("OPEN_WEBUI_DATA_DIR", "")
        if data_dir:
            self._config.data_dir = data_dir
        port = os.environ.get("OPEN_WEBUI_PORT", "")
        if port:
            self._config.port = int(port)

    # ── Properties ───────────────────────────────────────────

    @property
    def installed(self) -> bool:
        """Check if the open-webui binary exists in the venv."""
        binary = Path(self._venv_path) / "bin" / "open-webui"
        return binary.is_file()

    def get_state(self) -> OpenWebuiState:
        """Build a snapshot of the current state."""
        with self._lock:
            uptime = 0.0
            if self._status == OpenWebuiStatus.RUNNING and self._started_at > 0:
                uptime = time.time() - self._started_at

            return OpenWebuiState(
                status=self._status,
                pid=self._process.pid if self._process else None,
                url=f"http://localhost:{self._config.port}"
                if self._status == OpenWebuiStatus.RUNNING
                else "",
                config=self._config.model_copy(),
                error=self._error,
                uptime_seconds=round(uptime, 1),
                venv_path=self._venv_path,
                installed=self.installed,
                connected_deployment_id=self._connected_deployment_id,
                connected_deployment_name=self._connected_deployment_name,
            )

    def get_config(self) -> OpenWebuiEnvConfig:
        with self._lock:
            return self._config.model_copy()

    def set_config(self, config: OpenWebuiEnvConfig) -> None:
        with self._lock:
            self._config = config

    # ── Process lifecycle ────────────────────────────────────

    async def start(self, config: OpenWebuiEnvConfig | None = None) -> OpenWebuiState:
        """Start the Open WebUI subprocess.

        If config is provided, it replaces the current configuration.
        If the process is already running, this is a no-op.
        """
        with self._lock:
            if self._status == OpenWebuiStatus.RUNNING and self._process:
                return self.get_state()

            if not self.installed:
                self._status = OpenWebuiStatus.NOT_INSTALLED
                self._error = f"open-webui not found in {self._venv_path}"
                return self.get_state()

            if config:
                self._config = config

            self._status = OpenWebuiStatus.STARTING
            self._error = ""

        env = self._build_env()
        binary = str(Path(self._venv_path) / "bin" / "open-webui")

        try:
            proc = subprocess.Popen(
                [binary, "serve"],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid,
            )

            with self._lock:
                self._process = proc
                self._started_at = time.time()

            # Start log reader in background
            asyncio.get_running_loop().run_in_executor(
                None,
                self._read_output,
                proc,
            )

            # Wait for it to become healthy
            healthy = await self._wait_for_healthy()

            with self._lock:
                if healthy:
                    self._status = OpenWebuiStatus.RUNNING
                    logger.info(
                        "Open WebUI started (pid=%d, port=%d)",
                        proc.pid,
                        self._config.port,
                    )
                else:
                    self._status = OpenWebuiStatus.ERROR
                    self._error = "Open WebUI did not become healthy within timeout"
                    logger.warning("Open WebUI startup timeout")

        except Exception as e:
            with self._lock:
                self._status = OpenWebuiStatus.ERROR
                self._error = str(e)
            logger.exception("Failed to start Open WebUI")

        return self.get_state()

    async def stop(self) -> None:
        """Stop the Open WebUI subprocess gracefully."""
        with self._lock:
            proc = self._process
            if not proc or self._status in (
                OpenWebuiStatus.STOPPED,
                OpenWebuiStatus.NOT_INSTALLED,
            ):
                self._status = OpenWebuiStatus.STOPPED
                return

            self._status = OpenWebuiStatus.STOPPING

        logger.info("Stopping Open WebUI (pid=%d)...", proc.pid)

        try:
            # Send SIGTERM to the process group
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)

            # Wait up to 10 seconds for graceful shutdown
            for _ in range(20):
                if proc.poll() is not None:
                    break
                await asyncio.sleep(0.5)
            else:
                # Force kill if still running
                logger.warning("Open WebUI did not stop gracefully, sending SIGKILL")
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                proc.wait(timeout=5)

        except ProcessLookupError:
            pass  # Already dead
        except Exception:
            logger.exception("Error stopping Open WebUI")

        with self._lock:
            self._process = None
            self._status = OpenWebuiStatus.STOPPED
            self._started_at = 0.0

        logger.info("Open WebUI stopped")

    async def restart(self, config: OpenWebuiEnvConfig | None = None) -> OpenWebuiState:
        """Stop and re-start with optional new configuration."""
        await self.stop()
        await asyncio.sleep(1)
        return await self.start(config)

    async def connect_to_deployment(
        self,
        deployment_id: str,
        deployment_name: str,
        ollama_url: str,
    ) -> OpenWebuiState:
        """Connect Open WebUI to a specific deployment's Ollama server.

        If Open WebUI is already running and connected to a *different*
        deployment, it is automatically restarted with the new URL.
        If it's already connected to this deployment, return the current state.
        If it's stopped, start it with the deployment's URL.
        """
        with self._lock:
            already_connected = (
                self._status == OpenWebuiStatus.RUNNING
                and self._connected_deployment_id == deployment_id
                and self._config.ollama_base_urls == ollama_url
            )
            if already_connected:
                return self.get_state()

            # Update the Ollama URL in config
            self._config.ollama_base_urls = ollama_url
            self._connected_deployment_id = deployment_id
            self._connected_deployment_name = deployment_name

        logger.info(
            "Connecting Open WebUI to deployment %s (%s) at %s",
            deployment_id[:8],
            deployment_name,
            ollama_url,
        )

        # If running, restart with the new URL; if stopped, start fresh
        with self._lock:
            is_running = self._status == OpenWebuiStatus.RUNNING

        if is_running:
            return await self.restart()
        else:
            return await self.start()

    # ── Health checking ──────────────────────────────────────

    async def _wait_for_healthy(self) -> bool:
        """Poll the Open WebUI health endpoint until it responds."""
        url = f"http://localhost:{self._config.port}/"
        deadline = time.time() + STARTUP_TIMEOUT

        async with httpx.AsyncClient() as client:
            while time.time() < deadline:
                # Check if the process died
                with self._lock:
                    if self._process and self._process.poll() is not None:
                        self._error = f"Process exited with code {self._process.returncode}"
                        return False

                try:
                    resp = await client.get(url, timeout=3)
                    if resp.status_code < 500:
                        return True
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout):
                    pass

                await asyncio.sleep(2)

        return False

    async def health_check(self) -> bool:
        """Single health check — returns True if Open WebUI is responsive."""
        with self._lock:
            if self._status != OpenWebuiStatus.RUNNING:
                return False
            port = self._config.port

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:{port}/",
                    timeout=5,
                )
                return resp.status_code < 500
        except Exception:
            return False

    def start_health_loop(self) -> None:
        """Start background health-check loop (called at app startup)."""
        if self._running:
            return
        self._running = True
        self._health_task = asyncio.create_task(self._health_loop())

    def stop_health_loop(self) -> None:
        """Stop background health loop."""
        self._running = False
        if self._health_task:
            self._health_task.cancel()
            self._health_task = None

    async def _health_loop(self) -> None:
        """Periodically verify the Open WebUI process is alive."""
        while self._running:
            try:
                await asyncio.sleep(HEALTH_CHECK_INTERVAL)

                with self._lock:
                    if self._status != OpenWebuiStatus.RUNNING:
                        continue
                    proc = self._process

                if proc and proc.poll() is not None:
                    with self._lock:
                        self._status = OpenWebuiStatus.ERROR
                        self._error = f"Process exited unexpectedly (code {proc.returncode})"
                        self._process = None
                    logger.warning("Open WebUI process died: %s", self._error)

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in Open WebUI health loop")

    # ── Internals ────────────────────────────────────────────

    def _build_env(self) -> dict[str, str]:
        """Build the environment dict for the subprocess."""
        env = os.environ.copy()

        cfg = self._config

        # Core Open WebUI environment variables
        if cfg.ollama_base_urls:
            env["OLLAMA_BASE_URLS"] = cfg.ollama_base_urls
        else:
            # Remove any inherited value so Open WebUI uses its default
            env.pop("OLLAMA_BASE_URLS", None)

        env["PORT"] = str(cfg.port)
        env["DATA_DIR"] = cfg.data_dir
        env["WEBUI_NAME"] = cfg.webui_name
        env["WEBUI_SECRET_KEY"] = cfg.webui_secret_key
        env["WEBUI_AUTH"] = str(cfg.webui_auth)
        env["ENABLE_SIGNUP"] = str(cfg.enable_signup).lower()

        if cfg.default_models:
            env["DEFAULT_MODELS"] = cfg.default_models

        if not cfg.enable_rag:
            env["DOCS_DIR"] = ""  # Effectively disables RAG

        # Ensure the venv's bin is on PATH
        venv_bin = str(Path(self._venv_path) / "bin")
        env["PATH"] = f"{venv_bin}:{env.get('PATH', '')}"
        env["VIRTUAL_ENV"] = self._venv_path

        return env

    def _read_output(self, proc: subprocess.Popen[bytes]) -> None:
        """Read subprocess stdout/stderr and log it (runs in thread)."""
        try:
            if proc.stdout:
                for line in iter(proc.stdout.readline, b""):
                    text = line.decode("utf-8", errors="replace").rstrip()
                    if text:
                        logger.info("[open-webui] %s", text)
        except Exception:
            pass  # Process ended


# ── Singleton ────────────────────────────────────────────────────────

_manager: OpenWebuiManager | None = None
_manager_lock = threading.Lock()


def get_open_webui_manager() -> OpenWebuiManager:
    """Get the singleton Open WebUI manager instance."""
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = OpenWebuiManager()
    return _manager
