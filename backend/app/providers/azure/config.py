"""Azure-specific configuration and deployment profiles.

Translates the provider-agnostic ``DeploymentConfig`` into Azure SDK
parameters.  Also contains the predefined VM profiles that the
frontend presents to the user.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.deployment import DeploymentConfig, SecurityLevel


# ── Predefined VM profiles (shown in frontend dropdown) ──────────────


@dataclass(frozen=True)
class AzureVMProfile:
    """A pre-configured VM size with display metadata."""

    id: str
    display_name: str
    vm_size: str
    gpus: int
    gpu_model: str
    vcpus: int
    memory_gb: int
    confidential: bool
    description: str


# These are the profiles the frontend will offer.
AZURE_VM_PROFILES: list[AzureVMProfile] = [
    AzureVMProfile(
        id="h100-confidential",
        display_name="NVIDIA H100 (Confidential)",
        vm_size="Standard_NCC40ads_H100_v5",
        gpus=1,
        gpu_model="H100 80GB",
        vcpus=40,
        memory_gb=320,
        confidential=True,
        description="H100 GPU with AMD SEV-SNP confidential computing. Best for privacy-sensitive AI workloads.",
    ),
    AzureVMProfile(
        id="a100-standard",
        display_name="NVIDIA A100",
        vm_size="Standard_NC24ads_A100_v4",
        gpus=1,
        gpu_model="A100 80GB",
        vcpus=24,
        memory_gb=220,
        confidential=False,
        description="A100 GPU for large model inference. Good balance of cost and performance.",
    ),
    AzureVMProfile(
        id="t4-standard",
        display_name="NVIDIA T4 (Budget)",
        vm_size="Standard_NC4as_T4_v3",
        gpus=1,
        gpu_model="T4 16GB",
        vcpus=4,
        memory_gb=28,
        confidential=False,
        description="T4 GPU for smaller models. Most cost-effective option.",
    ),
    AzureVMProfile(
        id="test-no-gpu",
        display_name="Test VM (No GPU)",
        vm_size="Standard_D2s_v5",
        gpus=0,
        gpu_model="None",
        vcpus=2,
        memory_gb=8,
        confidential=False,
        description="Cheap VM for testing the provisioning pipeline (~$0.10/hr).",
    ),
]


# ── Azure regions with GPU availability ──────────────────────────────

AZURE_GPU_REGIONS: list[dict[str, str]] = [
    {"id": "eastus", "name": "East US"},
    {"id": "eastus2", "name": "East US 2"},
    {"id": "westus2", "name": "West US 2"},
    {"id": "westus3", "name": "West US 3"},
    {"id": "centralus", "name": "Central US"},
    {"id": "northcentralus", "name": "North Central US"},
    {"id": "southcentralus", "name": "South Central US"},
    {"id": "westeurope", "name": "West Europe"},
    {"id": "northeurope", "name": "North Europe"},
    {"id": "uksouth", "name": "UK South"},
    {"id": "southeastasia", "name": "Southeast Asia"},
    {"id": "australiaeast", "name": "Australia East"},
    {"id": "japaneast", "name": "Japan East"},
]


# ── OS image mapping ────────────────────────────────────────────────

AZURE_IMAGES: dict[str, dict[str, str]] = {
    "ubuntu-confidential-22.04": {
        "publisher": "Canonical",
        "offer": "0001-com-ubuntu-confidential-vm-jammy",
        "sku": "22_04-lts-cvm",
        "version": "latest",
    },
    "ubuntu-22.04": {
        "publisher": "Canonical",
        "offer": "0001-com-ubuntu-server-jammy",
        "sku": "22_04-lts-gen2",
        "version": "latest",
    },
}


def parse_image_reference(image: str) -> dict[str, str]:
    """Parse an image URN (publisher:offer:sku:version) or known alias."""
    if image in AZURE_IMAGES:
        return AZURE_IMAGES[image]

    parts = image.split(":")
    if len(parts) == 4:
        return {
            "publisher": parts[0],
            "offer": parts[1],
            "sku": parts[2],
            "version": parts[3],
        }

    msg = (
        f"Invalid image reference '{image}'. "
        f"Expected a known alias or 'publisher:offer:sku:version'."
    )
    raise ValueError(msg)


# ── Config translation ──────────────────────────────────────────────


def build_azure_params(config: DeploymentConfig) -> dict[str, Any]:
    """Translate a provider-agnostic DeploymentConfig into Azure-specific
    parameters used by the AzureProvider.

    Returns a flat dict consumed by the provisioning methods.
    """
    # Determine image and security settings based on security level
    if config.security_level == SecurityLevel.CONFIDENTIAL:
        image = "ubuntu-confidential-22.04"
        security_type = "ConfidentialVM"
        disk_encryption = config.provider_options.get(
            "disk_encryption", "VMGuestStateOnly"
        )
    else:
        image = "ubuntu-22.04"
        security_type = "TrustedLaunch"
        disk_encryption = ""

    # Allow provider_options to override defaults
    opts = config.provider_options

    # Determine disk types
    os_disk_type = opts.get("os_disk_type", "Premium_LRS")
    data_disk_type = opts.get("data_disk_type", "Premium_LRS")

    # For non-GPU test VMs, default to cheaper disks
    if "Standard_D" in config.vm_size or "Standard_B" in config.vm_size:
        os_disk_type = opts.get("os_disk_type", "Standard_LRS")
        data_disk_type = opts.get("data_disk_type", "Standard_LRS")

    return {
        "location": config.region,
        "resource_group": config.resource_group,
        "vm_name": config.vm_name,
        "vm_size": config.vm_size,
        "vm_user": opts.get("vm_user", "azureuser"),
        "image": opts.get("image", image),
        "security_type": opts.get("security_type", security_type),
        "secure_boot": opts.get("secure_boot", True),
        "vtpm": opts.get("vtpm", True),
        "disk_encryption": disk_encryption,
        "os_disk_size_gb": config.os_disk_size_gb,
        "data_disk_size_gb": config.data_disk_size_gb,
        "os_disk_type": os_disk_type,
        "data_disk_type": data_disk_type,
        "ssh_key_path": opts.get("ssh_key_path", "~/.ssh/id_ed25519.pub"),
        "nsg_ssh_source": config.allowed_ssh_sources[0]
        if config.allowed_ssh_sources
        else "*",
        "nsg_ollama_source": config.allowed_api_sources[0]
        if config.allowed_api_sources
        else "*",
        # Derived names
        "nsg_name": f"{config.resource_group}-nsg",
        "vnet_name": f"{config.resource_group}-vnet",
        "subnet_name": "default",
        "pip_name": f"{config.vm_name}-pip",
        "nic_name": f"{config.vm_name}-nic",
        "data_disk_name": f"{config.vm_name}-models-disk",
    }
