"""Phase 3: Cheap VM integration test — deploys a real D2s_v5 VM.

Cost: ~$0.10/hour. Creates real Azure resources.
MUST be torn down after testing.

Run: AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

Teardown only:
    AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -k teardown -v -s

NOTE: Tests are numbered (test_01_, test_02_, ...) and must run in order.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

import pytest

from app.models.credentials import AzureCredentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    SecurityLevel,
    SetupConfig,
)
from app.providers.azure.provider import AzureProvider

STATE_FILE = Path("/tmp/privateai-test-state.json")

# Skip all tests if AZURE_TEST_LIVE is not set
pytestmark = [
    pytest.mark.phase3,
    pytest.mark.skipif(
        os.environ.get("AZURE_TEST_LIVE", "").lower() != "true",
        reason="Set AZURE_TEST_LIVE=true to run live integration tests",
    ),
]


def _get_live_credentials() -> AzureCredentials:
    """Build credentials from environment variables for live tests."""
    return AzureCredentials(
        subscription_id=os.environ["AZURE_SUBSCRIPTION_ID"],
        tenant_id=os.environ["AZURE_TENANT_ID"],
        client_id=os.environ["AZURE_CLIENT_ID"],
        client_secret=os.environ["AZURE_CLIENT_SECRET"],
    )


def _get_test_config() -> DeploymentConfig:
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
        setup=SetupConfig(models=["gemma3:4b"], deploy_open_webui=False),
    )


def _save_state(data: dict) -> None:  # type: ignore[type-arg]
    STATE_FILE.write_text(json.dumps(data, indent=2))


def _load_state() -> dict:  # type: ignore[type-arg]
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


class TestCheapVMDeploy:
    """Deploy a cheap test VM and validate the provisioning pipeline."""

    def test_01_deploy(self) -> None:
        """Deploy the cheap test VM."""
        provider = AzureProvider()
        config = _get_test_config()
        credentials = _get_live_credentials()

        result = asyncio.get_event_loop().run_until_complete(
            provider.provision(config, credentials)
        )

        assert result.success, f"Deploy failed: {result.error}"
        assert result.public_ip, "No public IP assigned"

        _save_state(
            {
                "resource_group": config.resource_group,
                "vm_name": config.vm_name,
                "public_ip": result.public_ip,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )

    def test_02_vm_status(self) -> None:
        """Check VM is running after deploy."""
        state = _load_state()
        if not state:
            pytest.skip("No state file — run test_01_deploy first")

        provider = AzureProvider()
        config = _get_test_config()
        credentials = _get_live_credentials()

        status = asyncio.get_event_loop().run_until_complete(
            provider.get_vm_status(config, credentials)
        )

        assert "running" in status.power_state.lower(), (
            f"VM state: {status.power_state}"
        )
        assert status.resource_count >= 5

    def test_03_ssh_connectivity(self) -> None:
        """SSH into the VM and verify basic connectivity."""
        state = _load_state()
        if not state:
            pytest.skip("No state file — run test_01_deploy first")

        import paramiko

        ip = state["public_ip"]
        key_path = Path("~/.ssh/id_ed25519").expanduser()
        if not key_path.exists():
            pytest.skip(f"SSH key not found at {key_path}")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            pkey = paramiko.Ed25519Key.from_private_key_file(str(key_path))
            connected = False
            for _ in range(12):
                try:
                    client.connect(
                        hostname=ip,
                        username="azureuser",
                        pkey=pkey,
                        timeout=10,
                        look_for_keys=False,
                        allow_agent=False,
                    )
                    connected = True
                    break
                except Exception:
                    time.sleep(5)

            assert connected, f"Could not SSH to {ip} after 60 seconds"

            _, stdout, _ = client.exec_command("hostname")
            hostname = stdout.read().decode().strip()
            assert hostname, "Empty hostname from SSH"
        finally:
            client.close()

    def test_04_validate_remote(self) -> None:
        """Run full validation suite on the test VM."""
        state = _load_state()
        if not state:
            pytest.skip("No state file — run test_01_deploy first")

        provider = AzureProvider()
        config = _get_test_config()
        credentials = _get_live_credentials()

        result = asyncio.get_event_loop().run_until_complete(
            provider.validate(
                config,
                credentials,
                state["public_ip"],
                "~/.ssh/id_ed25519",
                check_gpu=False,
            )
        )

        ssh_check = next(
            (c for c in result.checks if c.name == "SSH connectivity"), None
        )
        assert ssh_check is not None and ssh_check.passed, "SSH check failed"

    def test_05_stop_and_start(self) -> None:
        """Test VM deallocate and restart cycle."""
        state = _load_state()
        if not state:
            pytest.skip("No state file — run test_01_deploy first")

        provider = AzureProvider()
        config = _get_test_config()
        credentials = _get_live_credentials()
        loop = asyncio.get_event_loop()

        # Stop
        loop.run_until_complete(provider.stop_vm(config, credentials))
        status = loop.run_until_complete(provider.get_vm_status(config, credentials))
        assert "deallocated" in status.power_state.lower(), (
            f"After stop: {status.power_state}"
        )

        # Start
        ip = loop.run_until_complete(provider.start_vm(config, credentials))
        assert ip, "No IP after restart"
        status = loop.run_until_complete(provider.get_vm_status(config, credentials))
        assert "running" in status.power_state.lower(), (
            f"After start: {status.power_state}"
        )

    def test_99_teardown(self) -> None:
        """Tear down all test resources. Run this last."""
        state = _load_state()
        if not state:
            pytest.skip("No state file — nothing to tear down")

        provider = AzureProvider()
        config = _get_test_config()
        credentials = _get_live_credentials()

        deleted = asyncio.get_event_loop().run_until_complete(
            provider.destroy(config, credentials)
        )
        assert deleted, "Teardown returned False"

        STATE_FILE.unlink(missing_ok=True)
