from __future__ import annotations

import tempfile
from pathlib import Path

from app.services.azure_cli_auth import (
    AuthStatus,
    DeviceCodeInfo,
    _AzureCliSession,
    _extract_retry_tenant,
    _should_retry_with_tenant,
)


class _FakeProc:
    def __init__(self, returncode: int | None) -> None:
        self.returncode = returncode

    def poll(self) -> int | None:
        return self.returncode


def test_extract_retry_tenant_from_cli_warning() -> None:
    stderr = (
        "WARNING: If you need to access subscriptions in the following tenants, "
        "please use `az login --tenant TENANT_ID`.\n"
        "WARNING: ab761d12-41b9-4be5-ad84-1f1b7613f0d0 'Default Directory'\n"
    )
    assert _extract_retry_tenant(stderr) == "ab761d12-41b9-4be5-ad84-1f1b7613f0d0"


def test_should_retry_with_tenant_for_mfa_new_location_no_subscription() -> None:
    stderr = (
        "Due to a configuration change made by your administrator, or because you moved "
        "to a new location, you must use multi-factor authentication to access "
        "'797f4846-ba00-4fd7-ba43-dac1f8f63013'.\n"
        "ERROR: No subscriptions found for shabbirkamal@outlook.com.\n"
    )
    assert _should_retry_with_tenant(stderr) is True


def test_poll_status_restarts_login_with_tenant_on_retryable_failure(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        session = _AzureCliSession(id="sess-1", config_dir=Path(tmp))
        session.proc = _FakeProc(1)  # type: ignore[assignment]
        session.stderr_buffer = [
            "Due to a configuration change made by your administrator, or because you moved "
            "to a new location, you must use multi-factor authentication to access "
            "'797f4846-ba00-4fd7-ba43-dac1f8f63013'.\n",
            "WARNING: If you need to access subscriptions in the following tenants, "
            "please use `az login --tenant TENANT_ID`.\n",
            "WARNING: ab761d12-41b9-4be5-ad84-1f1b7613f0d0 'Default Directory'\n",
            "ERROR: No subscriptions found for shabbirkamal@outlook.com.\n",
        ]

        calls: dict[str, object] = {}

        def fake_run_az(args: list[str], check: bool = True, timeout: int = 0):
            calls["logout_args"] = args
            calls["logout_check"] = check
            calls["logout_timeout"] = timeout
            return None

        def fake_start_login(tenant_id: str | None = None):
            calls["tenant_id"] = tenant_id
            session.proc = _FakeProc(None)  # type: ignore[assignment]
            session.device_code = DeviceCodeInfo(
                url="https://microsoft.com/devicelogin",
                code="RETRY123",
                message="retry message",
            )
            session.status = AuthStatus.PENDING
            session.retry_tenant_id = tenant_id or ""
            return session.device_code

        monkeypatch.setattr(session, "_run_az", fake_run_az)
        monkeypatch.setattr(session, "start_login", fake_start_login)

        status = session.poll_status()

        assert status == AuthStatus.PENDING
        assert session.retry_count == 1
        assert calls["tenant_id"] == "ab761d12-41b9-4be5-ad84-1f1b7613f0d0"
        assert calls["logout_args"] == ["logout"]
        assert session.device_code is not None
        assert session.device_code.code == "RETRY123"
