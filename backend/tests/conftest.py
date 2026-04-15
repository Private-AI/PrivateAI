"""Shared fixtures for all test phases."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.models.credentials import AzureCredentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    SecurityLevel,
    SetupConfig,
)


# ── Deployment configs ───────────────────────────────────────────────


@pytest.fixture
def production_config() -> DeploymentConfig:
    """Standard H100 Confidential VM production config."""
    return DeploymentConfig(
        provider=CloudProvider.AZURE,
        region="eastus",
        vm_name="h100-ollama",
        resource_group="h100-conf-rg",
        vm_size="Standard_NCC40ads_H100_v5",
        gpu_enabled=True,
        security_level=SecurityLevel.CONFIDENTIAL,
        os_disk_size_gb=256,
        data_disk_size_gb=1024,
        setup=SetupConfig(
            models=["gemma3:27b-fp16", "gemma3:4b"],
        ),
    )


@pytest.fixture
def test_config() -> DeploymentConfig:
    """Cheap D2s_v5 test VM config — no GPU, ~$0.10/hr."""
    return DeploymentConfig(
        provider=CloudProvider.AZURE,
        region="eastus",
        vm_name="trustgpt-test-vm",
        resource_group="trustgpt-test-rg",
        vm_size="Standard_D2s_v5",
        gpu_enabled=False,
        security_level=SecurityLevel.STANDARD,
        os_disk_size_gb=64,
        data_disk_size_gb=32,
        setup=SetupConfig(
            models=["gemma3:4b"],
        ),
    )


# ── Credentials ──────────────────────────────────────────────────────


@pytest.fixture
def mock_azure_credentials() -> AzureCredentials:
    """Fake Azure credentials for unit tests."""
    return AzureCredentials(
        subscription_id="00000000-0000-0000-0000-000000000000",
        tenant_id="00000000-0000-0000-0000-000000000000",
        client_id="00000000-0000-0000-0000-000000000000",
        client_secret="fake-test-secret",
    )


@pytest.fixture
def mock_credential() -> MagicMock:
    """Mocked Azure SDK credential object."""
    cred = MagicMock()
    cred.get_token.return_value = MagicMock(token="fake-token")
    return cred


@pytest.fixture
def mock_subscription_id() -> str:
    return "00000000-0000-0000-0000-000000000000"
