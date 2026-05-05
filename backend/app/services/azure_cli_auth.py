"""Azure CLI device-code authentication and service-principal provisioning.

Drives the ``az`` CLI (installed system-wide in the container) to:
  1. Start an interactive device-code login in the background.
  2. Expose the device code + verification URL to the frontend.
  3. Poll for login completion without blocking HTTP requests.
  4. After the user authenticates, run ``az ad sp create-for-rbac`` to
     produce a Service Principal the rest of PrivateAI can use.

Each login flow is tracked by a session id so concurrent requests from the
frontend never clobber each other.  Each session gets its own isolated
``AZURE_CONFIG_DIR`` so PrivateAI never reads from or writes to the host
user's personal ``~/.azure/`` configuration.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Timeouts ────────────────────────────────────────────────────────────
DEVICE_CODE_EMIT_TIMEOUT = 30       # seconds waiting for CLI to print the code
DEVICE_CODE_LOGIN_TIMEOUT = 900     # seconds (15 min) for user to authenticate
AZ_COMMAND_TIMEOUT = 120            # seconds for normal az commands
SESSION_IDLE_TIMEOUT = 1800         # 30 min — abandoned sessions get GC'd

# ── Regex ───────────────────────────────────────────────────────────────
_DEVICE_CODE_RE = re.compile(r"code\s+([A-Z0-9]+)\s+to\s+authenticate")
_DEVICE_URL_RE = re.compile(r"(https://\S*(?:devicelogin|/device)\S*)")
_TENANT_WARNING_RE = re.compile(r"WARNING:\s+([0-9a-fA-F-]{36})\s+'[^']+'")
_MFA_LOCATION_RETRY_MARKERS = (
    "must use multi-factor authentication",
    "because you moved to a new location",
    "No subscriptions found",
)


@dataclass
class DeviceCodeInfo:
    url: str
    code: str
    message: str


@dataclass
class AccountInfo:
    subscription_id: str
    subscription_name: str
    tenant_id: str
    user_name: str


@dataclass
class ServicePrincipalCredentials:
    client_id: str
    client_secret: str
    tenant_id: str
    subscription_id: str
    display_name: str


class AuthStatus:
    """Enumeration of session statuses (kept as string constants for JSON)."""

    PENDING = "pending"            # subprocess running, awaiting user
    AUTHENTICATED = "authenticated"  # user completed login
    FAILED = "failed"              # login exited with non-zero / cancelled
    PROVISIONED = "provisioned"    # SP has been created
    EXPIRED = "expired"            # session timed out


# ── Helpers (pure functions, easy to unit-test) ─────────────────────────


def _parse_device_code(text: str) -> DeviceCodeInfo | None:
    """Extract URL + code from ``az login --use-device-code`` output."""
    code_match = _DEVICE_CODE_RE.search(text)
    if not code_match:
        return None
    url_match = _DEVICE_URL_RE.search(text)
    url = url_match.group(1).rstrip(".") if url_match else "https://microsoft.com/devicelogin"
    return DeviceCodeInfo(url=url, code=code_match.group(1), message=text.strip())


def _extract_retry_tenant(text: str) -> str | None:
    """Extract the tenant Azure CLI recommends retrying against."""
    match = _TENANT_WARNING_RE.search(text)
    return match.group(1) if match else None


def _should_retry_with_tenant(text: str) -> bool:
    """Return True when CLI output matches the MFA + wrong-tenant failure mode."""
    return all(marker in text for marker in _MFA_LOCATION_RETRY_MARKERS)


# ── Session ─────────────────────────────────────────────────────────────


@dataclass
class _AzureCliSession:
    """One in-flight device-code authentication flow."""

    id: str
    config_dir: Path
    proc: subprocess.Popen[str] | None = None
    stderr_buffer: list[str] = field(default_factory=list)
    stdout_buffer: list[str] = field(default_factory=list)
    device_code: DeviceCodeInfo | None = None
    status: str = AuthStatus.PENDING
    account: AccountInfo | None = None
    sp_credentials: ServicePrincipalCredentials | None = None
    error: str = ""
    created_at: float = field(default_factory=time.time)
    last_accessed_at: float = field(default_factory=time.time)
    retry_count: int = 0
    retry_tenant_id: str = ""
    _drain_threads: list[threading.Thread] = field(default_factory=list)
    _lock: threading.RLock = field(default_factory=threading.RLock)

    # ---- Process env ---------------------------------------------------
    def env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["AZURE_CONFIG_DIR"] = str(self.config_dir)
        env["AZURE_CORE_DISABLE_PROMPTS"] = "true"
        env["PYTHONUNBUFFERED"] = "1"
        return env

    # ---- Subprocess helpers --------------------------------------------
    def _run_az(
        self,
        args: list[str],
        check: bool = True,
        timeout: int = AZ_COMMAND_TIMEOUT,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["az", *args],
            capture_output=True,
            text=True,
            check=check,
            timeout=timeout,
            env=self.env(),
        )

    # ---- Lifecycle -----------------------------------------------------
    def _spawn_login_process(self, tenant_id: str | None = None) -> subprocess.Popen[str]:
        args = ["az", "login", "--use-device-code"]
        if tenant_id:
            args.extend(["--tenant", tenant_id])
        return subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=self.env(),
        )

    def start_login(self, tenant_id: str | None = None) -> DeviceCodeInfo:
        """Spawn ``az login --use-device-code`` and return the device code.

        The subprocess stays alive in the background until the user finishes
        authentication or ``cancel()`` is called.  Blocks for up to
        ``DEVICE_CODE_EMIT_TIMEOUT`` seconds while waiting for the device
        code line to appear.
        """
        with self._lock:
            if self.proc is not None and self.proc.poll() is None:
                raise RuntimeError("Login already in progress for this session")

            self.config_dir.mkdir(parents=True, exist_ok=True)
            self.stderr_buffer = []
            self.stdout_buffer = []
            self.device_code = None
            self.error = ""
            proc = self._spawn_login_process(tenant_id)
            self.proc = proc
            self.status = AuthStatus.PENDING
            self.retry_tenant_id = tenant_id or ""

            def _drain(pipe: Any, buffer: list[str]) -> None:
                try:
                    for line in iter(pipe.readline, ""):
                        buffer.append(line)
                finally:
                    try:
                        pipe.close()
                    except Exception:
                        pass

            t_err = threading.Thread(
                target=_drain, args=(proc.stderr, self.stderr_buffer), daemon=True
            )
            t_out = threading.Thread(
                target=_drain, args=(proc.stdout, self.stdout_buffer), daemon=True
            )
            t_err.start()
            t_out.start()
            self._drain_threads = [t_err, t_out]

        # Poll the buffers until the code appears (outside the lock so we
        # don't block the drain threads).
        deadline = time.time() + DEVICE_CODE_EMIT_TIMEOUT
        code_info: DeviceCodeInfo | None = None
        while time.time() < deadline:
            combined = "".join(self.stderr_buffer) + "".join(self.stdout_buffer)
            code_info = _parse_device_code(combined)
            if code_info is not None:
                break
            if proc.poll() is not None:
                # Process exited before emitting a code
                break
            time.sleep(0.25)

        if code_info is None:
            # Kill and surface whatever output we have
            stderr_snapshot = "".join(self.stderr_buffer)
            stdout_snapshot = "".join(self.stdout_buffer)
            self.cancel()
            self.status = AuthStatus.FAILED
            self.error = (
                f"Azure CLI did not emit a device code within "
                f"{DEVICE_CODE_EMIT_TIMEOUT}s. "
                f"stderr={stderr_snapshot!r} stdout={stdout_snapshot!r}"
            )
            raise RuntimeError(self.error)

        with self._lock:
            self.device_code = code_info
            self.touch()
        logger.info(
            "Azure device-code login started (session=%s, code=%s)",
            self.id,
            code_info.code,
        )
        return code_info

    def _restart_login_with_tenant(self, tenant_id: str) -> str:
        """Retry login against a specific tenant after a wrong-tenant MFA failure."""
        self._run_az(["logout"], check=False, timeout=30)
        self.retry_count += 1
        self.start_login(tenant_id=tenant_id)
        self.error = (
            "Azure required MFA in a different tenant. "
            "PrivateAI restarted device-code login automatically."
        )
        return AuthStatus.PENDING

    def poll_status(self) -> str:
        """Non-blocking check of login progress.

        Returns one of the ``AuthStatus`` string constants.
        """
        with self._lock:
            self.touch()
            if self.status in (AuthStatus.PROVISIONED, AuthStatus.FAILED, AuthStatus.EXPIRED):
                return self.status

            proc = self.proc
            if proc is None:
                # Not started yet
                return self.status

            ret = proc.poll()
            if ret is None:
                # Still awaiting user
                return AuthStatus.PENDING

            if ret != 0:
                stderr = "".join(self.stderr_buffer)
                retry_tenant = _extract_retry_tenant(stderr)
                if (
                    self.retry_count == 0
                    and retry_tenant
                    and _should_retry_with_tenant(stderr)
                ):
                    logger.info(
                        "Retrying Azure device-code login against tenant %s for session %s",
                        retry_tenant,
                        self.id,
                    )
                    return self._restart_login_with_tenant(retry_tenant)

                self.status = AuthStatus.FAILED
                self.error = (
                    f"az login exited with code {ret}. "
                    f"stderr={stderr[-1000:]!r}"
                )
                return self.status

            # Exit code 0 → login succeeded. Fetch the active account.
            try:
                result = self._run_az(
                    ["account", "show", "--output", "json"], check=True, timeout=30
                )
                data = json.loads(result.stdout)
                self.account = AccountInfo(
                    subscription_id=data["id"],
                    subscription_name=data.get("name", ""),
                    tenant_id=data["tenantId"],
                    user_name=data.get("user", {}).get("name", ""),
                )
                self.status = AuthStatus.AUTHENTICATED
                return self.status
            except Exception as e:
                self.status = AuthStatus.FAILED
                self.error = f"Could not read account after login: {e}"
                return self.status

    def create_service_principal(
        self,
        name: str = "PrivateAI-Provisioner",
        role: str = "Contributor",
    ) -> ServicePrincipalCredentials:
        """Run ``az ad sp create-for-rbac`` scoped to the current subscription."""
        with self._lock:
            self.touch()
            if self.status != AuthStatus.AUTHENTICATED:
                raise RuntimeError(
                    f"Cannot create SP from session in status '{self.status}'. "
                    "Complete device-code login first."
                )
            account = self.account
            if account is None:
                raise RuntimeError("No account information available")

        scope = f"/subscriptions/{account.subscription_id}"
        result = self._run_az(
            [
                "ad", "sp", "create-for-rbac",
                "--name", name,
                "--role", role,
                "--scopes", scope,
                "--output", "json",
            ],
            check=True,
            timeout=180,
        )
        sp_data = json.loads(result.stdout)
        creds = ServicePrincipalCredentials(
            client_id=sp_data["appId"],
            client_secret=sp_data["password"],
            tenant_id=sp_data["tenant"],
            subscription_id=account.subscription_id,
            display_name=sp_data.get("displayName", name),
        )

        with self._lock:
            self.sp_credentials = creds
            self.status = AuthStatus.PROVISIONED
            self.touch()

        logger.info(
            "Service principal created (session=%s, name=%s, appId=%s)",
            self.id,
            name,
            creds.client_id,
        )
        return creds

    # ---- Cleanup -------------------------------------------------------
    def cancel(self) -> None:
        """Kill the az login subprocess (if running)."""
        proc = self.proc
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)
            except Exception as e:
                logger.warning("Could not terminate az login: %s", e)

    def cleanup(self) -> None:
        """Cancel and wipe the isolated config directory."""
        self.cancel()
        try:
            if self.config_dir.exists():
                shutil.rmtree(self.config_dir, ignore_errors=True)
        except Exception as e:
            logger.warning("Could not remove config dir %s: %s", self.config_dir, e)

    def touch(self) -> None:
        self.last_accessed_at = time.time()


# ── Manager ─────────────────────────────────────────────────────────────


class AzureCliAuthManager:
    """Process-wide registry of active device-code login sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, _AzureCliSession] = {}
        self._lock = threading.Lock()
        self._base_dir = Path(tempfile.gettempdir()) / "privateai-azure-sessions"
        self._base_dir.mkdir(parents=True, exist_ok=True)

    # ---- Session lifecycle --------------------------------------------
    def create_session(self) -> _AzureCliSession:
        """Create a new session with its own isolated AZURE_CONFIG_DIR."""
        self.gc_expired()
        session_id = uuid.uuid4().hex
        config_dir = self._base_dir / session_id
        session = _AzureCliSession(id=session_id, config_dir=config_dir)
        with self._lock:
            self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> _AzureCliSession:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise KeyError(f"Session '{session_id}' not found or expired")
        session.touch()
        return session

    def drop_session(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is not None:
            session.cleanup()

    def gc_expired(self) -> None:
        """Clean up sessions that have been idle longer than the threshold."""
        cutoff = time.time() - SESSION_IDLE_TIMEOUT
        expired: list[_AzureCliSession] = []
        with self._lock:
            for sid, session in list(self._sessions.items()):
                if session.last_accessed_at < cutoff:
                    expired.append(session)
                    del self._sessions[sid]
        for session in expired:
            logger.info("GC'ing idle Azure CLI session %s", session.id)
            session.status = AuthStatus.EXPIRED
            session.cleanup()

    def shutdown(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.cleanup()


# ── Module-level singleton ──────────────────────────────────────────────

_manager_instance: AzureCliAuthManager | None = None
_manager_lock = threading.Lock()


def get_cli_auth_manager() -> AzureCliAuthManager:
    """Return the process-wide AzureCliAuthManager singleton."""
    global _manager_instance
    with _manager_lock:
        if _manager_instance is None:
            _manager_instance = AzureCliAuthManager()
        return _manager_instance


def is_az_available() -> bool:
    """Return True if the ``az`` binary is on PATH."""
    return shutil.which("az") is not None
