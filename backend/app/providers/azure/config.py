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
    cost_per_hour: float = 0.0  # Estimated USD/hr for cost tracking
    # Minimum model size this VM can comfortably handle (in billions of params)
    min_model_b: float = 0.0
    max_model_b: float = 999.0
    # Alternative SKUs tried in order when primary is capacity-constrained
    fallback_vm_sizes: tuple[str, ...] = ()


# Profiles ordered cheapest → most expensive.
# No confidential/TEE profiles — use TrustedLaunch throughout.
AZURE_VM_PROFILES: list[AzureVMProfile] = [
    AzureVMProfile(
        id="micro-cpu",
        display_name="Micro CPU (B2ms) — $0.08/hr",
        vm_size="Standard_B2ms",
        gpus=0,
        gpu_model="None",
        vcpus=2,
        memory_gb=8,
        confidential=False,
        description="Burstable 2 vCPU / 8 GB. Cheapest option — good for testing with tiny models.",
        cost_per_hour=0.083,
        min_model_b=0.0,
        max_model_b=3.0,
        fallback_vm_sizes=("Standard_D2as_v5", "Standard_D2s_v5", "Standard_D2ds_v5", "Standard_D2as_v7", "Standard_D2ds_v4", "Standard_D2s_v4", "Standard_D2s_v3"),
    ),
    AzureVMProfile(
        id="test-no-gpu",
        display_name="Test CPU (D2s_v5) — $0.10/hr",
        vm_size="Standard_D2s_v5",
        gpus=0,
        gpu_model="None",
        vcpus=2,
        memory_gb=8,
        confidential=False,
        description="2 vCPU / 8 GB. Stable general-purpose VM for pipeline testing.",
        cost_per_hour=0.096,
        min_model_b=0.0,
        max_model_b=3.0,
        fallback_vm_sizes=("Standard_D2as_v5", "Standard_D2ds_v5", "Standard_D2as_v7", "Standard_D2ds_v4", "Standard_D2s_v4", "Standard_D2s_v3"),
    ),
    AzureVMProfile(
        id="small-cpu",
        display_name="Small CPU (D4as_v5) — $0.19/hr",
        vm_size="Standard_D4as_v5",
        gpus=0,
        gpu_model="None",
        vcpus=4,
        memory_gb=16,
        confidential=False,
        description="4 vCPU / 16 GB AMD. Recommended for 7–8B models (Llama 3 8B, Mistral 7B, Gemma 7B) at CPU inference.",
        cost_per_hour=0.192,
        min_model_b=3.0,
        max_model_b=9.0,
        fallback_vm_sizes=("Standard_D4s_v5", "Standard_D4ds_v5", "Standard_D4s_v4"),
    ),
    AzureVMProfile(
        id="medium-cpu",
        display_name="Medium CPU (D8as_v5) — $0.38/hr",
        vm_size="Standard_D8as_v5",
        gpus=0,
        gpu_model="None",
        vcpus=8,
        memory_gb=32,
        confidential=False,
        description="8 vCPU / 32 GB AMD. Handles 13B models (Llama 3 13B, Code Llama 13B) comfortably.",
        cost_per_hour=0.384,
        min_model_b=9.0,
        max_model_b=20.0,
        fallback_vm_sizes=("Standard_D8s_v5", "Standard_D8ds_v5", "Standard_D8s_v4"),
    ),
    AzureVMProfile(
        id="t4-gpu",
        display_name="NVIDIA T4 GPU (NC4as_T4_v3) — $0.53/hr",
        vm_size="Standard_NC4as_T4_v3",
        gpus=1,
        gpu_model="T4 16GB",
        vcpus=4,
        memory_gb=28,
        confidential=False,
        description="T4 GPU (16 GB VRAM). Fast inference for 7–13B models; can run 34B with quantization.",
        cost_per_hour=0.526,
        min_model_b=0.0,
        max_model_b=34.0,
    ),
    AzureVMProfile(
        id="a100-gpu",
        display_name="NVIDIA A100 GPU (NC24ads_A100_v4) — $3.67/hr",
        vm_size="Standard_NC24ads_A100_v4",
        gpus=1,
        gpu_model="A100 80GB",
        vcpus=24,
        memory_gb=220,
        confidential=False,
        description="A100 80 GB GPU. Runs 70B models in full precision; best performance.",
        cost_per_hour=3.67,
        min_model_b=34.0,
        max_model_b=999.0,
    ),
]


# ── Model → VM recommendation ─────────────────────────────────────────


def recommend_vm_for_model(model: str) -> str:
    """Return the cheapest suitable VM profile id for a given model tag.

    Uses the parameter count in the model name (3b, 8b, 13b, 70b …) to
    pick the smallest VM that can comfortably run the model in 4-bit
    quantization on CPU, or the T4/A100 for GPU-class sizes.
    """
    lower = model.lower()

    # Extract explicit size hints like 70b, 13b, 8b, 7b, 4b, 3b, 1b …
    import re
    m = re.search(r"(\d+\.?\d*)b", lower)
    param_b = float(m.group(1)) if m else 7.0  # default assumption: ~7B

    # Large models (≥34B) genuinely need a GPU
    if param_b >= 34:
        return "a100-gpu"
    if param_b >= 20:
        return "t4-gpu"

    # CPU inference — pick smallest VM that fits
    for profile in AZURE_VM_PROFILES:
        if profile.gpus == 0 and profile.min_model_b <= param_b <= profile.max_model_b:
            return profile.id

    return "small-cpu"


# ── Cost-per-hour lookup by VM size ──────────────────────────────────


def get_fallback_vm_sizes(vm_size: str) -> list[str]:
    """Return ordered fallback SKUs to try when primary is capacity-constrained."""
    for profile in AZURE_VM_PROFILES:
        if profile.vm_size == vm_size:
            return list(profile.fallback_vm_sizes)
    return []


def get_cost_per_hour(vm_size: str) -> float:
    """Return the estimated cost/hr for a VM size, or 0.0 if unknown."""
    for profile in AZURE_VM_PROFILES:
        if profile.vm_size == vm_size:
            return profile.cost_per_hour
    return 0.0


# ── Disk defaults by VM type ─────────────────────────────────────────


def default_disk_sizes(vm_size: str) -> tuple[int, int]:
    """Return (os_disk_gb, data_disk_gb) defaults for a VM size.

    Cheap CPU VMs get a small OS disk and a modest data disk.
    GPU VMs get bigger disks for large models.
    """
    if any(vm_size.startswith(p) for p in ("Standard_B", "Standard_D2", "Standard_D4")):
        return 32, 64   # OS: 32 GB, data: 64 GB
    if vm_size.startswith("Standard_D8"):
        return 64, 128
    # GPU VMs — keep existing large defaults
    return 128, 256


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
    Security is always TrustedLaunch — no ConfidentialVM / TEE.
    """
    opts = config.provider_options

    # Always use standard Ubuntu + TrustedLaunch (no TEE)
    image = opts.get("image", "ubuntu-22.04")
    security_type = "TrustedLaunch"
    disk_encryption = ""

    # Disk type: Standard_LRS for CPU VMs, Premium_LRS for GPU/NC VMs
    is_cpu_vm = any(config.vm_size.startswith(p) for p in ("Standard_B", "Standard_D"))
    if is_cpu_vm:
        os_disk_type = opts.get("os_disk_type", "Standard_LRS")
        data_disk_type = opts.get("data_disk_type", "Standard_LRS")
    else:
        os_disk_type = opts.get("os_disk_type", "Premium_LRS")
        data_disk_type = opts.get("data_disk_type", "Premium_LRS")

    return {
        "location": config.region,
        "resource_group": config.resource_group,
        "vm_name": config.vm_name,
        "vm_size": config.vm_size,
        "vm_user": opts.get("vm_user", "azureuser"),
        "image": image,
        "security_type": security_type,
        "secure_boot": opts.get("secure_boot", True),
        "vtpm": opts.get("vtpm", True),
        "disk_encryption": disk_encryption,
        "os_disk_size_gb": config.os_disk_size_gb,
        "data_disk_size_gb": config.data_disk_size_gb,
        "os_disk_type": os_disk_type,
        "data_disk_type": data_disk_type,
        "ssh_key_path": opts.get("ssh_key_path", "~/.ssh/id_ed25519.pub"),
        "nsg_ssh_source": config.allowed_ssh_sources[0] if config.allowed_ssh_sources else "*",
        # Derived names
        "nsg_name": f"{config.resource_group}-nsg",
        "vnet_name": f"{config.resource_group}-vnet",
        "subnet_name": "default",
        "pip_name": f"{config.vm_name}-pip",
        "nic_name": f"{config.vm_name}-nic",
        "data_disk_name": f"{config.vm_name}-models-disk",
    }
