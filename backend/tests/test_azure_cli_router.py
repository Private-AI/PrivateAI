"""Tests for Azure CLI API orchestration helpers."""

from __future__ import annotations

import anyio

from app.models.credentials import AzureCredentials
from app.routers import azure_cli


def test_validate_provisioned_credentials_retries_until_valid(monkeypatch) -> None:
    credentials = AzureCredentials(
        subscription_id="00000000-0000-0000-0000-000000000000",
        tenant_id="00000000-0000-0000-0000-000000000000",
        client_id="00000000-0000-0000-0000-000000000000",
        client_secret="fresh-secret",
    )
    calls = 0

    async def fake_validate(_credentials: AzureCredentials) -> tuple[bool, str]:
        nonlocal calls
        calls += 1
        if calls < 3:
            return False, "AADSTS7000215: Invalid client secret provided."
        return True, "Authenticated."

    monkeypatch.setattr(azure_cli, "_validate_provisioned_credentials", fake_validate)

    async def run_validation() -> tuple[bool, str]:
        return await azure_cli._validate_provisioned_credentials_with_retry(
            credentials,
            timeout=1,
            interval=0,
        )

    valid, message = anyio.run(run_validation)

    assert valid is True
    assert message == "Authenticated."
    assert calls == 3


def test_validate_provisioned_credentials_returns_last_error(monkeypatch) -> None:
    credentials = AzureCredentials(
        subscription_id="00000000-0000-0000-0000-000000000000",
        tenant_id="00000000-0000-0000-0000-000000000000",
        client_id="00000000-0000-0000-0000-000000000000",
        client_secret="fresh-secret",
    )

    async def fake_validate(_credentials: AzureCredentials) -> tuple[bool, str]:
        return False, "still not propagated"

    monkeypatch.setattr(azure_cli, "_validate_provisioned_credentials", fake_validate)

    async def run_validation() -> tuple[bool, str]:
        return await azure_cli._validate_provisioned_credentials_with_retry(
            credentials,
            timeout=0,
            interval=0,
        )

    valid, message = anyio.run(run_validation)

    assert valid is False
    assert message == "still not propagated"
