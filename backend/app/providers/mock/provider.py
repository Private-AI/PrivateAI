"""Mock cloud provider — returns dummy data for UI development.

Activated by setting the environment variable PRIVATEAI_TEST_MODE=true.
All operations complete instantly with realistic fake data so the
frontend can be developed and tested without Azure credentials.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any

from app.models.credentials import Credentials
from app.models.deployment import (
    DeploymentConfig,
    ServiceEndpoints,
    StepProgress,
)
from app.providers.base import (
    CloudProvider as CloudProviderBase,
    ProvisionResult,
    SetupResult,
    ValidationCheck,
    ValidationResult,
    VMStatusResult,
)

logger = logging.getLogger(__name__)

MOCK_IP = "20.42.83.157"

PROVISION_STEPS = [
    ("resource_group", "Creating resource group"),
    ("nsg", "Creating network security group"),
    ("vnet", "Creating virtual network"),
    ("public_ip", "Creating public IP address"),
    ("nic", "Creating network interface"),
    ("vm", "Creating virtual machine"),
    ("data_disk", "Attaching data disk"),
]

SETUP_STEPS = [
    ("connect", "Connecting via SSH"),
    ("update_system", "Updating system packages"),
    ("mount_disk", "Mounting data disk at /models"),
    ("nvidia_driver", "Installing NVIDIA driver"),
    ("install_ollama", "Installing and configuring Ollama"),
    ("pull_models", "Pulling AI models"),
]


class MockProvider(CloudProviderBase):
    """Mock provider that simulates all cloud operations with fake data."""

    @property
    def name(self) -> str:
        return "azure"

    @property
    def display_name(self) -> str:
        return "Microsoft Azure (Test Mode)"

    def list_regions(self) -> list[dict[str, str]]:
        return [
            {"id": "eastus", "name": "East US"},
            {"id": "westus2", "name": "West US 2"},
            {"id": "westeurope", "name": "West Europe"},
            {"id": "uksouth", "name": "UK South"},
            {"id": "southeastasia", "name": "Southeast Asia"},
        ]

    def list_vm_sizes(self, region: str) -> list[dict[str, Any]]:
        return [
            {
                "id": "h100-confidential",
                "display_name": "NVIDIA H100 (Confidential)",
                "vm_size": "Standard_NCC40ads_H100_v5",
                "gpus": 1,
                "gpu_model": "H100 80GB",
                "vcpus": 40,
                "memory_gb": 320,
                "confidential": True,
                "description": "H100 GPU with AMD SEV-SNP confidential computing.",
                "cost_per_hour": 35.00,
                "available": True,
                "availability_reason": None,
            },
            {
                "id": "a100-standard",
                "display_name": "NVIDIA A100",
                "vm_size": "Standard_NC24ads_A100_v4",
                "gpus": 1,
                "gpu_model": "A100 80GB",
                "vcpus": 24,
                "memory_gb": 220,
                "confidential": False,
                "description": "A100 GPU for large model inference.",
                "cost_per_hour": 3.67,
                "available": True,
                "availability_reason": None,
            },
            {
                "id": "t4-standard",
                "display_name": "NVIDIA T4 (Budget)",
                "vm_size": "Standard_NC4as_T4_v3",
                "gpus": 1,
                "gpu_model": "T4 16GB",
                "vcpus": 4,
                "memory_gb": 28,
                "confidential": False,
                "description": "T4 GPU for smaller models.",
                "cost_per_hour": 0.53,
                "available": True,
                "availability_reason": None,
            },
            {
                "id": "test-no-gpu",
                "display_name": "Test VM (No GPU)",
                "vm_size": "Standard_D2s_v5",
                "gpus": 0,
                "gpu_model": "None",
                "vcpus": 2,
                "memory_gb": 8,
                "confidential": False,
                "description": "Cheap VM for testing (~$0.10/hr).",
                "cost_per_hour": 0.10,
                "available": True,
                "availability_reason": None,
            },
        ]

    async def validate_credentials(self, credentials: Credentials) -> tuple[bool, str]:
        await asyncio.sleep(0.5)
        return True, "Test mode: credentials accepted. 3 resource group(s) visible."

    async def provision(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        progress_callback: Any | None = None,
    ) -> ProvisionResult:
        steps: list[StepProgress] = []
        total = len(PROVISION_STEPS)

        for i, (step_id, label) in enumerate(PROVISION_STEPS):
            now = datetime.now(timezone.utc)
            step = StepProgress(step=step_id, label=label, status="in_progress", started_at=now)
            steps.append(step)
            if progress_callback:
                progress_callback(step_id, i + 1, total, f"Creating {label}...")
            # Simulate real-world timing
            delay = 1.5 if step_id == "vm" else 0.5
            await asyncio.sleep(delay)
            step.status = "completed"
            step.completed_at = datetime.now(timezone.utc)

        return ProvisionResult(
            success=True,
            public_ip=MOCK_IP,
            vm_id=f"/subscriptions/mock-sub/resourceGroups/{config.resource_group}/providers/Microsoft.Compute/virtualMachines/{config.vm_name}",
            steps=steps,
            provider_metadata={
                "subscription_id": "mock-subscription-id",
                "resource_group": config.resource_group,
                "vm_name": config.vm_name,
                "vm_user": "azureuser",
                "ssh_key_path": "~/.ssh/id_ed25519.pub",
                "location": config.region,
            },
        )

    async def check_quota(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> tuple[bool, int, int]:
        return True, 40, 40

    async def setup_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        progress_callback: Any | None = None,
    ) -> SetupResult:
        steps: list[StepProgress] = []
        total = len(SETUP_STEPS)

        for i, (step_id, label) in enumerate(SETUP_STEPS):
            now = datetime.now(timezone.utc)
            step = StepProgress(step=step_id, label=label, status="in_progress", started_at=now)
            steps.append(step)
            if progress_callback:
                progress_callback(step_id, i + 1, total, label)
            delay = 1.0 if step_id == "pull_models" else 0.4
            await asyncio.sleep(delay)
            step.status = "completed"
            step.completed_at = datetime.now(timezone.utc)

        return SetupResult(
            success=True,
            gpu_info="NVIDIA H100 80GB HBM3, 535.129.03",
            models_installed=config.setup.models,
            steps=steps,
        )

    async def get_vm_status(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> VMStatusResult:
        await asyncio.sleep(0.3)
        return VMStatusResult(
            power_state="VM running",
            vm_size=config.vm_size,
            public_ip=MOCK_IP,
            provisioning_state="Succeeded",
            resource_count=7,
        )

    async def start_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> str:
        await asyncio.sleep(1.0)
        return MOCK_IP

    async def stop_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> None:
        await asyncio.sleep(1.0)

    async def set_auto_shutdown(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        time_utc: str = "1800",
    ) -> None:
        await asyncio.sleep(0.3)

    async def destroy(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> bool:
        await asyncio.sleep(1.0)
        return True

    async def validate(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        check_gpu: bool = False,
    ) -> ValidationResult:
        await asyncio.sleep(0.5)
        checks = [
            ValidationCheck("SSH connectivity", True, f"Connected to {public_ip}"),
            ValidationCheck("System info", True, "Ubuntu 22.04, 40 CPUs, 320 GB RAM"),
            ValidationCheck("Data disk mount", True, "/models mounted (1007G)"),
            ValidationCheck("fstab persistence", True, "in /etc/fstab"),
            ValidationCheck("NVIDIA GPU", True, "NVIDIA H100 80GB HBM3, 535.129.03"),
            ValidationCheck("Ollama installed", True, "ollama version 0.6.2"),
            ValidationCheck("Ollama service", True, "active"),
            ValidationCheck("Ollama API (local)", True, "responding on :11434"),
            ValidationCheck("Ollama API (remote)", True, f"http://{public_ip}:11434 reachable"),
        ]
        return ValidationResult(
            checks=checks,
            system_info={"os": "Ubuntu 22.04.4 LTS", "cpus": "40", "memory_gb": "320"},
        )

    def get_service_endpoints(
        self,
        config: DeploymentConfig,
        public_ip: str,
    ) -> ServiceEndpoints:
        ssh = f"ssh azureuser@{public_ip}" if public_ip else ""
        ollama = f"http://{public_ip}:11434" if public_ip else ""
        return ServiceEndpoints(ssh=ssh, ollama_api=ollama)
