"""Core deployment models — provider-agnostic data structures.

These models represent the *user's intent* (what to deploy) and the
*system state* (what has been deployed), independent of which cloud
provider is being used.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────


class CloudProvider(StrEnum):
    """Supported cloud providers."""

    AZURE = "azure"
    GCP = "gcp"  # future
    AWS = "aws"  # future


class SecurityLevel(StrEnum):
    """Hardware encryption / confidential-computing level."""

    STANDARD = "standard"  # TrustedLaunch (Secure Boot + vTPM only)
    CONFIDENTIAL = "confidential"  # Full Confidential VM (AMD SEV-SNP)


class DeploymentStatus(StrEnum):
    """Lifecycle states for a deployment."""

    PENDING = "pending"  # Created, not yet started
    PROVISIONING = "provisioning"  # Infrastructure being created
    CONFIGURING = "configuring"  # VM software being installed
    RUNNING = "running"  # Fully operational
    STOPPING = "stopping"  # Being deallocated
    STOPPED = "stopped"  # VM deallocated (disks remain)
    STARTING = "starting"  # Being started
    DESTROYING = "destroying"  # Being torn down
    DESTROYED = "destroyed"  # Fully removed
    FAILED = "failed"  # Error during any phase


class SetupPhase(StrEnum):
    """Phases of VM software setup."""

    CONNECT = "connect"
    UPDATE_SYSTEM = "update_system"
    MOUNT_DISK = "mount_disk"
    NVIDIA_DRIVER = "nvidia_driver"
    INSTALL_OLLAMA = "install_ollama"
    PULL_MODELS = "pull_models"
    DONE = "done"


# ── Configuration models (user intent) ──────────────────────────────


class SetupConfig(BaseModel):
    """Software configuration for the VM after provisioning."""

    models: list[str] = Field(
        default=["gemma3:4b"],
        description="Ollama model tags to pull after setup",
    )


class DeploymentConfig(BaseModel):
    """Provider-agnostic deployment configuration.

    This is the canonical representation of *what the user wants*.
    Provider-specific translation happens inside each CloudProvider
    implementation.
    """

    provider: CloudProvider = Field(..., description="Which cloud provider to use")
    region: str = Field(..., description="Cloud region / location (e.g. 'eastus', 'us-central1')")
    vm_name: str = Field(
        default="privateai-vm",
        description="Name for the VM resource",
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$",
    )
    resource_group: str = Field(
        default="privateai-rg",
        description="Resource group / project grouping name",
    )

    # Hardware
    vm_size: str = Field(..., description="VM SKU / instance type (provider-specific string)")
    gpu_enabled: bool = Field(default=False, description="Whether the VM has a GPU")

    # Security
    security_level: SecurityLevel = Field(
        default=SecurityLevel.STANDARD,
        description="Hardware encryption level",
    )

    # Disks
    os_disk_size_gb: int = Field(default=256, ge=30, le=4096)
    data_disk_size_gb: int = Field(default=1024, ge=0, le=16384)

    # Networking
    allowed_ssh_sources: list[str] = Field(
        default=["*"],
        description="IP CIDRs allowed SSH access (e.g. ['1.2.3.4/32'])",
    )
    allowed_api_sources: list[str] = Field(
        default=["*"],
        description="IP CIDRs allowed Ollama/API access",
    )

    # Software
    setup: SetupConfig = Field(default_factory=SetupConfig)

    # Provider-specific overrides (pass-through dict for advanced users)
    provider_options: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific overrides (advanced)",
    )


# ── Step / progress tracking ────────────────────────────────────────


class StepProgress(BaseModel):
    """Progress of a single provisioning or setup step."""

    step: str
    label: str
    status: str = "pending"  # pending | in_progress | completed | failed
    detail: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None


# ── Service endpoints ────────────────────────────────────────────────


class ServiceEndpoints(BaseModel):
    """URLs for accessing deployed services."""

    ssh: str = Field(default="", description="SSH connection string")
    ollama_api: str = Field(default="", description="Ollama API base URL")


# ── Deployment record (system state) ────────────────────────────────


class DeploymentRecord(BaseModel):
    """Full state record for a deployment.

    This is what the backend stores in memory (and eventually in a DB)
    for each provisioning run.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    config: DeploymentConfig
    status: DeploymentStatus = DeploymentStatus.PENDING

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Infrastructure outputs
    public_ip: str = ""
    vm_id: str = ""

    # Progress tracking
    provision_steps: list[StepProgress] = Field(default_factory=list)
    setup_steps: list[StepProgress] = Field(default_factory=list)

    # Service access
    endpoints: ServiceEndpoints = Field(default_factory=ServiceEndpoints)

    # Errors
    error: str = ""
    error_detail: str = ""

    # Provider-specific metadata returned after provisioning
    provider_metadata: dict[str, Any] = Field(default_factory=dict)

    def touch(self) -> None:
        """Update the ``updated_at`` timestamp."""
        self.updated_at = datetime.now(timezone.utc)
