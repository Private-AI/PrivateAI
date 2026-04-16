"""Teardown utility — destroy test and/or production resources.

Run:
    AZURE_TEST_LIVE=true pytest tests/test_teardown.py -m phase3 -v -s

To also destroy production resources:
    AZURE_TEST_LIVE=true AZURE_NUKE_PROD=true pytest tests/test_teardown.py -v -s
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from app.models.credentials import AzureCredentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    SecurityLevel,
)
from app.providers.azure.provider import AzureProvider
from tests.live_test_utils import get_azure_clients

STATE_FILE = Path("/tmp/privateai-test-state.json")

pytestmark = pytest.mark.skipif(
    os.environ.get("AZURE_TEST_LIVE", "").lower() != "true",
    reason="Set AZURE_TEST_LIVE=true to run teardown",
)


def _get_live_credentials() -> AzureCredentials:
    return AzureCredentials(
        subscription_id=os.environ["AZURE_SUBSCRIPTION_ID"],
        tenant_id=os.environ["AZURE_TENANT_ID"],
        client_id=os.environ["AZURE_CLIENT_ID"],
        client_secret=os.environ["AZURE_CLIENT_SECRET"],
    )


def _iter_tagged_test_resource_groups(credentials: AzureCredentials) -> list[str]:
    """Find dynamic test RGs created by phase3 suites.

    Safeguards:
    - Must include known test tags.
    - Must match one of allowed prefixes.
    - Must not match explicit protected RG names.
    """
    prefixes = tuple(
        p.strip()
        for p in os.environ.get("AZURE_TEST_RG_PREFIXES", "privateai-,trustgpt-").split(",")
        if p.strip()
    )
    protected = {
        p.strip() for p in os.environ.get("AZURE_PROTECTED_RGS", "h100-conf-rg").split(",") if p.strip()
    }

    resource_client, _, _ = get_azure_clients(credentials)
    found: list[str] = []

    for rg in resource_client.resource_groups.list():
        name = rg.name or ""
        if not name or name in protected or not name.startswith(prefixes):
            continue

        tags = rg.tags or {}
        if tags.get("project") != "privateai":
            continue
        if tags.get("created-by") != "privateai-backend":
            continue

        found.append(name)

    return found


class TestTeardownTest:
    """Tear down test resources."""

    @pytest.mark.phase3
    def test_teardown_fixed_test_rg(self) -> None:
        """Delete legacy fixed-name test RG used by older scripts."""
        provider = AzureProvider()
        config = DeploymentConfig(
            provider=CloudProvider.AZURE,
            region="eastus",
            vm_name="trustgpt-test-vm",
            resource_group="trustgpt-test-rg",
            vm_size="Standard_D2s_v5",
            security_level=SecurityLevel.STANDARD,
        )
        credentials = _get_live_credentials()

        asyncio.get_event_loop().run_until_complete(provider.destroy(config, credentials))

    @pytest.mark.phase3
    def test_teardown_tagged_dynamic_test_rgs(self) -> None:
        """Delete dynamic phase3 test RGs created with unique names."""
        credentials = _get_live_credentials()
        resource_client, _, _ = get_azure_clients(credentials)

        targets = _iter_tagged_test_resource_groups(credentials)
        for rg_name in targets:
            delete_poller = resource_client.resource_groups.begin_delete(rg_name)
            delete_poller.wait()

        # Non-strict: it's valid to have nothing to delete.
        assert True


class TestTeardownProd:
    """Tear down production resources. Requires explicit opt-in."""

    @pytest.mark.skipif(
        os.environ.get("AZURE_NUKE_PROD", "").lower() != "true",
        reason="Set AZURE_NUKE_PROD=true to destroy production resources",
    )
    @pytest.mark.phase5
    def test_teardown_prod_rg(self) -> None:
        """Delete the production resource group."""
        provider = AzureProvider()
        config = DeploymentConfig(
            provider=CloudProvider.AZURE,
            region="eastus",
            vm_name="h100-ollama",
            resource_group="h100-conf-rg",
            vm_size="Standard_NCC40ads_H100_v5",
            security_level=SecurityLevel.CONFIDENTIAL,
        )
        credentials = _get_live_credentials()

        asyncio.get_event_loop().run_until_complete(provider.destroy(config, credentials))


class TestTeardownCleanup:
    """Clean up local state files."""

    def test_cleanup_state_files(self) -> None:
        """Remove all local state files."""
        files = [
            STATE_FILE,
            Path("/tmp/h100-ip.txt"),
            Path("/tmp/azure-h100-public-ip.txt"),
        ]
        for f in files:
            if f.exists():
                f.unlink()
