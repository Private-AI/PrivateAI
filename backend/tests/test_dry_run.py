"""Phase 2: Dry-run validation — test config translation and model logic.

Zero cost. Verifies correct Azure parameter generation, config defaults,
image parsing, and provider-agnostic model behaviour without making
any cloud API calls.

Run: pytest tests/test_dry_run.py -m phase2 -v
"""

from __future__ import annotations

import pytest

from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    DeploymentRecord,
    DeploymentStatus,
    SecurityLevel,
    ServiceEndpoints,
    SetupConfig,
)
from app.providers.azure.config import (
    AZURE_GPU_REGIONS,
    AZURE_VM_PROFILES,
    build_azure_params,
    parse_image_reference,
)
from app.providers.azure.provider import AzureProvider


@pytest.mark.phase2
class TestAzureConfigTranslation:
    """Test that DeploymentConfig translates correctly to Azure params."""

    def test_confidential_vm_params(self, production_config: DeploymentConfig) -> None:
        """Confidential security level should produce ConfidentialVM params."""
        params = build_azure_params(production_config)
        assert params["security_type"] == "ConfidentialVM"
        assert params["secure_boot"] is True
        assert params["vtpm"] is True
        assert params["disk_encryption"] == "VMGuestStateOnly"
        assert "confidential" in params["image"]

    def test_standard_vm_params(self, test_config: DeploymentConfig) -> None:
        """Standard security level should produce TrustedLaunch params."""
        params = build_azure_params(test_config)
        assert params["security_type"] == "TrustedLaunch"
        assert params["disk_encryption"] == ""
        assert "ubuntu-22.04" == params["image"]

    def test_location_propagates(self, production_config: DeploymentConfig) -> None:
        params = build_azure_params(production_config)
        assert params["location"] == "eastus"

    def test_custom_location(self) -> None:
        config = DeploymentConfig(provider="azure", region="westus3", vm_size="Standard_D2s_v5")
        params = build_azure_params(config)
        assert params["location"] == "westus3"

    def test_resource_group_propagates(self, production_config: DeploymentConfig) -> None:
        params = build_azure_params(production_config)
        assert params["resource_group"] == "h100-conf-rg"

    def test_derived_names(self, production_config: DeploymentConfig) -> None:
        params = build_azure_params(production_config)
        assert params["nsg_name"] == "h100-conf-rg-nsg"
        assert params["vnet_name"] == "h100-conf-rg-vnet"
        assert params["subnet_name"] == "default"
        assert params["pip_name"] == "h100-ollama-pip"
        assert params["nic_name"] == "h100-ollama-nic"
        assert params["data_disk_name"] == "h100-ollama-models-disk"

    def test_disk_sizes_propagate(self, production_config: DeploymentConfig) -> None:
        params = build_azure_params(production_config)
        assert params["os_disk_size_gb"] == 256
        assert params["data_disk_size_gb"] == 1024

    def test_cheap_vm_uses_standard_disks(self, test_config: DeploymentConfig) -> None:
        """D2s_v5 should default to Standard_LRS disks."""
        params = build_azure_params(test_config)
        assert params["os_disk_type"] == "Standard_LRS"
        assert params["data_disk_type"] == "Standard_LRS"

    def test_production_uses_premium_disks(self, production_config: DeploymentConfig) -> None:
        params = build_azure_params(production_config)
        assert params["os_disk_type"] == "Premium_LRS"
        assert params["data_disk_type"] == "Premium_LRS"

    def test_nsg_sources_from_allowed_ips(self) -> None:
        config = DeploymentConfig(
            provider="azure",
            region="eastus",
            vm_size="Standard_D2s_v5",
            allowed_ssh_sources=["1.2.3.4/32"],
            allowed_api_sources=["5.6.7.8/32"],
        )
        params = build_azure_params(config)
        assert params["nsg_ssh_source"] == "1.2.3.4/32"
        assert params["nsg_ollama_source"] == "5.6.7.8/32"

    def test_disk_encryption_override(self) -> None:
        config = DeploymentConfig(
            provider="azure",
            region="eastus",
            vm_size="Standard_NCC40ads_H100_v5",
            security_level=SecurityLevel.CONFIDENTIAL,
            provider_options={"disk_encryption": "DiskWithVMGuestState"},
        )
        params = build_azure_params(config)
        assert params["disk_encryption"] == "DiskWithVMGuestState"


@pytest.mark.phase2
class TestImageParsing:
    """Test image URN parsing logic."""

    def test_parse_confidential_alias(self) -> None:
        ref = parse_image_reference("ubuntu-confidential-22.04")
        assert ref["publisher"] == "Canonical"
        assert "confidential" in ref["offer"]
        assert ref["version"] == "latest"

    def test_parse_standard_alias(self) -> None:
        ref = parse_image_reference("ubuntu-22.04")
        assert ref["publisher"] == "Canonical"
        assert "server" in ref["offer"]

    def test_parse_full_urn(self) -> None:
        urn = "Canonical:0001-com-ubuntu-confidential-vm-jammy:22_04-lts-cvm:latest"
        ref = parse_image_reference(urn)
        assert ref["publisher"] == "Canonical"
        assert ref["offer"] == "0001-com-ubuntu-confidential-vm-jammy"
        assert ref["sku"] == "22_04-lts-cvm"
        assert ref["version"] == "latest"

    def test_invalid_image_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid image reference"):
            parse_image_reference("not-a-valid-ref")


@pytest.mark.phase2
class TestDeploymentConfig:
    """Test provider-agnostic config defaults and behaviour."""

    def test_production_defaults(self, production_config: DeploymentConfig) -> None:
        assert production_config.provider == CloudProvider.AZURE
        assert production_config.region == "eastus"
        assert production_config.security_level == SecurityLevel.CONFIDENTIAL
        assert production_config.gpu_enabled is True

    def test_test_defaults(self, test_config: DeploymentConfig) -> None:
        assert test_config.vm_size == "Standard_D2s_v5"
        assert test_config.security_level == SecurityLevel.STANDARD
        assert test_config.gpu_enabled is False

    def test_setup_config_defaults(self) -> None:
        setup = SetupConfig()
        assert setup.models == ["gemma3:4b"]

    def test_deployment_record_creation(self, production_config: DeploymentConfig) -> None:
        record = DeploymentRecord(config=production_config)
        assert record.id  # UUID generated
        assert record.status == DeploymentStatus.PENDING
        assert record.public_ip == ""
        assert record.error == ""

    def test_vm_name_validation(self) -> None:
        """VM names must match [a-zA-Z0-9][a-zA-Z0-9-]{0,62}."""
        # Valid
        DeploymentConfig(provider="azure", region="eastus", vm_size="x", vm_name="my-vm-1")
        # Invalid — starts with hyphen
        with pytest.raises(Exception):
            DeploymentConfig(provider="azure", region="eastus", vm_size="x", vm_name="-invalid")


@pytest.mark.phase2
class TestAzureProvider:
    """Test AzureProvider metadata methods (no cloud calls)."""

    def test_regions(self) -> None:
        provider = AzureProvider()
        regions = provider.list_regions()
        assert len(regions) >= 5
        ids = [r["id"] for r in regions]
        assert "eastus" in ids
        assert "westeurope" in ids

    def test_vm_sizes(self) -> None:
        provider = AzureProvider()
        sizes = provider.list_vm_sizes("eastus")
        assert len(sizes) >= 3
        ids = [s["id"] for s in sizes]
        assert "h100-confidential" in ids
        assert "test-no-gpu" in ids

    def test_service_endpoints(self, production_config: DeploymentConfig) -> None:
        provider = AzureProvider()
        endpoints = provider.get_service_endpoints(production_config, "10.0.0.1")
        assert "azureuser@10.0.0.1" in endpoints.ssh
        assert endpoints.ollama_api == "http://10.0.0.1:11434"

    def test_service_endpoints_no_ip(self, production_config: DeploymentConfig) -> None:
        provider = AzureProvider()
        endpoints = provider.get_service_endpoints(production_config, "")
        assert endpoints.ssh == ""
        assert endpoints.ollama_api == ""


@pytest.mark.phase2
class TestVMProfiles:
    """Test predefined VM profiles."""

    def test_profiles_have_required_fields(self) -> None:
        for p in AZURE_VM_PROFILES:
            assert p.id
            assert p.display_name
            assert p.vm_size
            assert p.vcpus > 0
            assert p.memory_gb > 0

    def test_h100_is_confidential(self) -> None:
        h100 = next(p for p in AZURE_VM_PROFILES if p.id == "h100-confidential")
        assert h100.confidential is True
        assert h100.gpus >= 1

    def test_test_vm_has_no_gpu(self) -> None:
        test = next(p for p in AZURE_VM_PROFILES if p.id == "test-no-gpu")
        assert test.gpus == 0
        assert test.confidential is False
