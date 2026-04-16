"""Phase 4: Remote VM validation tests.

Tests the validator module against a running VM.
Requires a VM IP passed via AZURE_TEST_VM_IP environment variable.

Run: AZURE_TEST_VM_IP=20.x.x.x pytest tests/test_validate_remote.py -m phase4 -v -s
"""

from __future__ import annotations

import os

import pytest

from app.models.credentials import AzureCredentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    SecurityLevel,
)
from app.providers.azure.provider import AzureProvider
from app.providers.base import ValidationResult
from tests.live_test_utils import get_event_loop

pytestmark = [
    pytest.mark.phase4,
    pytest.mark.skipif(
        not os.environ.get("AZURE_TEST_VM_IP"),
        reason="Set AZURE_TEST_VM_IP=<ip> to run remote validation tests",
    ),
]

VM_IP = os.environ.get("AZURE_TEST_VM_IP", "")
CHECK_GPU = os.environ.get("AZURE_TEST_GPU", "").lower() == "true"


def _get_live_credentials() -> AzureCredentials:
    return AzureCredentials(
        subscription_id=os.environ["AZURE_SUBSCRIPTION_ID"],
        tenant_id=os.environ["AZURE_TENANT_ID"],
        client_id=os.environ["AZURE_CLIENT_ID"],
        client_secret=os.environ["AZURE_CLIENT_SECRET"],
    )


def _get_config() -> DeploymentConfig:
    return DeploymentConfig(
        provider=CloudProvider.AZURE,
        region="eastus",
        vm_name="test-vm",
        resource_group="test-rg",
        vm_size="Standard_D2s_v5",
        gpu_enabled=False,
        security_level=SecurityLevel.STANDARD,
    )


@pytest.fixture(scope="module")
def validation_result() -> ValidationResult:
    provider = AzureProvider()
    return get_event_loop().run_until_complete(
        provider.validate(
            _get_config(),
            _get_live_credentials(),
            VM_IP,
            "~/.ssh/id_ed25519",
            check_gpu=CHECK_GPU,
        )
    )


class TestRemoteValidation:
    """Validate a running VM deployment."""

    def test_full_validation(self, validation_result: ValidationResult) -> None:
        """Run the complete validation suite."""
        ssh_check = next((c for c in validation_result.checks if c.name == "SSH connectivity"), None)
        assert ssh_check is not None, "SSH check not found"
        assert ssh_check.passed, f"SSH failed: {ssh_check.message}"

    def test_ssh_connectivity(self, validation_result: ValidationResult) -> None:
        ssh_check = next((c for c in validation_result.checks if c.name == "SSH connectivity"), None)
        assert ssh_check is not None and ssh_check.passed

    def test_system_info(self, validation_result: ValidationResult) -> None:
        assert validation_result.system_info.get("os"), "No OS info"
        assert int(validation_result.system_info.get("cpus", "0")) > 0

    def test_data_disk(self, validation_result: ValidationResult) -> None:
        disk_check = next((c for c in validation_result.checks if c.name == "Data disk mount"), None)
        assert disk_check is not None, "Data disk check not found"
        assert disk_check.passed, f"Data disk: {disk_check.message}"

    @pytest.mark.skipif(not CHECK_GPU, reason="Set AZURE_TEST_GPU=true for GPU checks")
    def test_gpu(self, validation_result: ValidationResult) -> None:
        gpu_check = next((c for c in validation_result.checks if c.name == "NVIDIA GPU"), None)
        assert gpu_check is not None and gpu_check.passed

    def test_ollama_service(self, validation_result: ValidationResult) -> None:
        svc_check = next((c for c in validation_result.checks if c.name == "Ollama service"), None)
        if svc_check and not svc_check.passed:
            pytest.skip("Ollama service not running — run setup first")

    def test_ollama_api_remote(self, validation_result: ValidationResult) -> None:
        api_check = next((c for c in validation_result.checks if c.name == "Ollama API (remote)"), None)
        if api_check and not api_check.passed:
            svc_check = next((c for c in validation_result.checks if c.name == "Ollama service"), None)
            if svc_check and not svc_check.passed:
                pytest.skip("Ollama not running — remote API check not applicable")
            else:
                pytest.fail(f"Ollama running but API not reachable: {api_check.message}")
