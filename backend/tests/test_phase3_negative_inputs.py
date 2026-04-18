"""Extended Phase 3: negative-path tests for Azure provisioning inputs."""

from __future__ import annotations

from secrets import token_hex

import pytest

from app.models.credentials import AzureCredentials
from app.providers.azure.provider import AzureProvider
from tests.live_test_utils import (
    build_d2s_config,
    get_event_loop,
    get_live_credentials,
    live_enabled,
)

pytestmark = [
    pytest.mark.phase3,
    pytest.mark.skipif(not live_enabled(), reason="Set AZURE_TEST_LIVE=true for live tests"),
]


class TestNegativeInputs:
    def test_invalid_credentials_are_rejected(self) -> None:
        real = get_live_credentials()
        provider = AzureProvider()
        bad = AzureCredentials(
            subscription_id=real.subscription_id,
            tenant_id=real.tenant_id,
            client_id=real.client_id,
            client_secret=f"invalid-secret-{token_hex(6)}",
        )

        loop = get_event_loop()
        valid, message = loop.run_until_complete(provider.validate_credentials(bad))
        assert not valid
        assert message

    def test_invalid_region_fails_provision_cleanly(self) -> None:
        provider = AzureProvider()
        credentials = get_live_credentials()
        config = build_d2s_config(name_prefix="privateai-neg-region")
        config.region = "moonbase-1"

        loop = get_event_loop()
        result = loop.run_until_complete(provider.provision(config, credentials))
        assert not result.success
        assert result.error

    def test_invalid_vm_size_fails_provision_cleanly(self) -> None:
        provider = AzureProvider()
        credentials = get_live_credentials()
        config = build_d2s_config(name_prefix="privateai-neg-sku")
        config.vm_size = "Standard_NOT_A_REAL_SKU"

        loop = get_event_loop()
        result = loop.run_until_complete(provider.provision(config, credentials))
        assert not result.success
        assert result.error

    def test_invalid_model_tag_does_not_crash_setup(self) -> None:
        provider = AzureProvider()
        credentials = get_live_credentials()
        config = build_d2s_config(
            name_prefix="privateai-neg-model",
            models=["bad;rm -rf /", "gemma3:4b"],
        )

        loop = get_event_loop()
        provision = loop.run_until_complete(provider.provision(config, credentials))
        assert provision.success, f"Provisioning failed unexpectedly: {provision.error}"
        assert provision.public_ip

        try:
            setup = loop.run_until_complete(
                provider.setup_vm(config, credentials, provision.public_ip, "~/.ssh/id_ed25519")
            )
            assert setup.success, f"Setup failed unexpectedly: {setup.error}"
            assert "bad;rm -rf /" not in setup.models_installed
        finally:
            loop.run_until_complete(provider.destroy(config, credentials))
