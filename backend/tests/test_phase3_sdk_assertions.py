"""Extended Phase 3: Azure SDK resource assertions on Standard_D2s_v5."""

from __future__ import annotations

import asyncio

import pytest

from app.providers.azure.provider import AzureProvider
from tests.live_test_utils import (
    build_d2s_config,
    get_azure_clients,
    get_live_credentials,
    live_enabled,
)

pytestmark = [
    pytest.mark.phase3,
    pytest.mark.skipif(not live_enabled(), reason="Set AZURE_TEST_LIVE=true for live tests"),
]


@pytest.fixture(scope="module")
def deployed_d2s() -> dict[str, object]:
    provider = AzureProvider()
    credentials = get_live_credentials()
    config = build_d2s_config(name_prefix="privateai-sdk", deploy_open_webui=False)

    loop = asyncio.get_event_loop()
    provision_result = loop.run_until_complete(provider.provision(config, credentials))
    assert provision_result.success, f"Provisioning failed: {provision_result.error}"
    assert provision_result.public_ip, "Provisioning completed without public IP"

    yield {
        "provider": provider,
        "credentials": credentials,
        "config": config,
        "public_ip": provision_result.public_ip,
    }

    loop.run_until_complete(provider.destroy(config, credentials))


class TestAzureSDKAssertions:
    def test_resource_group_exists_and_has_tags(self, deployed_d2s: dict[str, object]) -> None:
        credentials = deployed_d2s["credentials"]
        config = deployed_d2s["config"]
        assert credentials is not None and config is not None

        resource_client, _, _ = get_azure_clients(credentials)  # type: ignore[arg-type]
        rg = resource_client.resource_groups.get(config.resource_group)  # type: ignore[union-attr]

        assert rg.name == config.resource_group  # type: ignore[union-attr]
        assert rg.location is not None
        assert rg.tags is not None
        assert rg.tags.get("project") == "privateai"
        assert rg.tags.get("created-by") == "privateai-backend"

    def test_nsg_contains_expected_rules(self, deployed_d2s: dict[str, object]) -> None:
        credentials = deployed_d2s["credentials"]
        config = deployed_d2s["config"]
        assert credentials is not None and config is not None

        _, network_client, _ = get_azure_clients(credentials)  # type: ignore[arg-type]
        nsg_name = f"{config.resource_group}-nsg"  # type: ignore[union-attr]
        nsg = network_client.network_security_groups.get(  # type: ignore[union-attr]
            config.resource_group,
            nsg_name,
        )

        assert nsg.security_rules is not None
        port_to_rule = {
            str(rule.destination_port_range): rule
            for rule in nsg.security_rules
            if rule.destination_port_range
        }

        assert "22" in port_to_rule
        assert "11434" in port_to_rule
        assert "3000" not in port_to_rule

    def test_public_ip_and_nic(self, deployed_d2s: dict[str, object]) -> None:
        credentials = deployed_d2s["credentials"]
        config = deployed_d2s["config"]
        assert credentials is not None and config is not None

        _, network_client, _ = get_azure_clients(credentials)  # type: ignore[arg-type]
        pip_name = f"{config.vm_name}-pip"  # type: ignore[union-attr]
        nic_name = f"{config.vm_name}-nic"  # type: ignore[union-attr]

        pip = network_client.public_ip_addresses.get(  # type: ignore[union-attr]
            config.resource_group,
            pip_name,
        )
        nic = network_client.network_interfaces.get(  # type: ignore[union-attr]
            config.resource_group,
            nic_name,
        )

        assert pip.ip_address
        assert pip.sku is not None
        assert pip.sku.name == "Standard"
        assert str(pip.public_ip_allocation_method).lower() == "static"

        assert nic.ip_configurations is not None
        assert len(nic.ip_configurations) >= 1

    def test_vm_profile_and_data_disk(self, deployed_d2s: dict[str, object]) -> None:
        credentials = deployed_d2s["credentials"]
        config = deployed_d2s["config"]
        assert credentials is not None and config is not None

        _, _, compute_client = get_azure_clients(credentials)  # type: ignore[arg-type]
        vm = compute_client.virtual_machines.get(  # type: ignore[union-attr]
            config.resource_group,
            config.vm_name,
        )

        assert vm.hardware_profile is not None
        assert vm.hardware_profile.vm_size == "Standard_D2s_v5"

        assert vm.security_profile is not None
        assert vm.security_profile.security_type == "TrustedLaunch"

        assert vm.storage_profile is not None
        assert vm.storage_profile.data_disks is not None
        assert len(vm.storage_profile.data_disks) >= 1
        data_disk = vm.storage_profile.data_disks[0]
        assert data_disk.disk_size_gb == 32
