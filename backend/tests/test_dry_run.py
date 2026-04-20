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
    recommend_vm_for_model,
)
from app.providers.azure.provider import AzureProvider


@pytest.mark.phase2
class TestAzureConfigTranslation:
    """Test that DeploymentConfig translates correctly to Azure params."""

    def test_always_trusted_launch(self, production_config: DeploymentConfig) -> None:
        """All VMs now use TrustedLaunch — no ConfidentialVM."""
        params = build_azure_params(production_config)
        assert params["security_type"] == "TrustedLaunch"
        assert params["disk_encryption"] == ""
        assert params["image"] == "ubuntu-22.04"

    def test_standard_vm_params(self, test_config: DeploymentConfig) -> None:
        """Standard security level should produce TrustedLaunch params."""
        params = build_azure_params(test_config)
        assert params["security_type"] == "TrustedLaunch"
        assert params["disk_encryption"] == ""
        assert params["image"] == "ubuntu-22.04"

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

    def test_gpu_vm_uses_premium_disks(self) -> None:
        config = DeploymentConfig(
            provider="azure", region="eastus", vm_size="Standard_NC4as_T4_v3"
        )
        params = build_azure_params(config)
        assert params["os_disk_type"] == "Premium_LRS"
        assert params["data_disk_type"] == "Premium_LRS"

    def test_nsg_ssh_source_from_allowed_ips(self) -> None:
        config = DeploymentConfig(
            provider="azure",
            region="eastus",
            vm_size="Standard_D2s_v5",
            allowed_ssh_sources=["1.2.3.4/32"],
        )
        params = build_azure_params(config)
        assert params["nsg_ssh_source"] == "1.2.3.4/32"

    def test_no_ollama_nsg_source(self) -> None:
        """Ollama port is never exposed in the NSG — only SSH (tunnel)."""
        config = DeploymentConfig(
            provider="azure",
            region="eastus",
            vm_size="Standard_D2s_v5",
        )
        params = build_azure_params(config)
        assert "nsg_ollama_source" not in params


@pytest.mark.phase2
class TestImageParsing:
    """Test image URN parsing logic."""

    def test_parse_standard_alias(self) -> None:
        ref = parse_image_reference("ubuntu-22.04")
        assert ref["publisher"] == "Canonical"
        assert "server" in ref["offer"]
        assert ref["version"] == "latest"

    def test_parse_full_urn(self) -> None:
        urn = "Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest"
        ref = parse_image_reference(urn)
        assert ref["publisher"] == "Canonical"
        assert ref["offer"] == "0001-com-ubuntu-server-jammy"
        assert ref["sku"] == "22_04-lts-gen2"
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
        assert production_config.gpu_enabled is True
        assert production_config.security_level == SecurityLevel.STANDARD

    def test_test_defaults(self, test_config: DeploymentConfig) -> None:
        assert test_config.vm_size == "Standard_D2s_v5"
        assert test_config.security_level == SecurityLevel.STANDARD
        assert test_config.gpu_enabled is False

    def test_setup_config_defaults(self) -> None:
        setup = SetupConfig()
        assert setup.models == ["gemma3:4b"]

    def test_deployment_record_creation(self, production_config: DeploymentConfig) -> None:
        record = DeploymentRecord(config=production_config)
        assert record.id
        assert record.status == DeploymentStatus.PENDING
        assert record.public_ip == ""
        assert record.error == ""

    def test_vm_name_validation(self) -> None:
        DeploymentConfig(provider="azure", region="eastus", vm_size="x", vm_name="my-vm-1")
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

    def test_vm_sizes_contains_cheap_options(self) -> None:
        provider = AzureProvider()
        sizes = provider.list_vm_sizes("eastus")
        assert len(sizes) >= 4
        ids = [s["id"] for s in sizes]
        assert "micro-cpu" in ids
        assert "test-no-gpu" in ids
        assert "small-cpu" in ids
        assert "t4-gpu" in ids

    def test_vm_sizes_no_confidential(self) -> None:
        """No confidential VMs should be in the profile list."""
        provider = AzureProvider()
        sizes = provider.list_vm_sizes("eastus")
        assert all(not s["confidential"] for s in sizes)

    def test_vm_sizes_ordered_by_cost(self) -> None:
        """Cheapest VM should be first."""
        provider = AzureProvider()
        sizes = provider.list_vm_sizes("eastus")
        costs = [s["cost_per_hour"] for s in sizes]
        assert costs == sorted(costs)

    def test_service_endpoints_ssh(self, production_config: DeploymentConfig) -> None:
        provider = AzureProvider()
        endpoints = provider.get_service_endpoints(production_config, "10.0.0.1")
        assert "azureuser@10.0.0.1" in endpoints.ssh
        # Ollama API is empty — only reachable via SSH tunnel
        assert endpoints.ollama_api == ""

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

    def test_no_confidential_profiles(self) -> None:
        """All profiles use TrustedLaunch — no TEE profiles."""
        assert all(not p.confidential for p in AZURE_VM_PROFILES)

    def test_test_vm_has_no_gpu(self) -> None:
        test = next(p for p in AZURE_VM_PROFILES if p.id == "test-no-gpu")
        assert test.gpus == 0
        assert test.cost_per_hour < 0.15

    def test_micro_is_cheapest(self) -> None:
        micro = next(p for p in AZURE_VM_PROFILES if p.id == "micro-cpu")
        assert micro.cost_per_hour == min(p.cost_per_hour for p in AZURE_VM_PROFILES)


@pytest.mark.phase2
class TestVMRecommendation:
    """Test model→VM recommendation logic."""

    def test_tiny_model_gets_micro(self) -> None:
        assert recommend_vm_for_model("tinyllama:1.1b") == "micro-cpu"

    def test_small_model_gets_small_cpu(self) -> None:
        assert recommend_vm_for_model("llama3:8b") == "small-cpu"

    def test_medium_model_gets_medium_cpu(self) -> None:
        assert recommend_vm_for_model("llama3:13b") == "medium-cpu"

    def test_large_model_gets_gpu(self) -> None:
        vm = recommend_vm_for_model("llama3:70b")
        assert vm in ("t4-gpu", "a100-gpu")

    def test_default_model_gets_reasonable_vm(self) -> None:
        vm = recommend_vm_for_model("gemma3:4b")
        # 4B is small → micro or small
        assert vm in ("micro-cpu", "test-no-gpu", "small-cpu")
