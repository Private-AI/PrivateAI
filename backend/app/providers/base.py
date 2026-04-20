"""Abstract base class for all cloud providers.

Every cloud provider (Azure, GCP, AWS) must implement this interface.
The orchestrator calls these methods and does not know which provider
is being used — polymorphism handles the rest.
"""

from __future__ import annotations

import abc
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from app.models.credentials import Credentials
from app.models.deployment import (
    DeploymentConfig,
    DeploymentStatus,
    ServiceEndpoints,
    StepProgress,
)


@dataclass
class ProvisionResult:
    """Returned by ``CloudProvider.provision()`` after infra creation."""

    success: bool
    public_ip: str = ""
    vm_id: str = ""
    error: str = ""
    error_detail: str = ""
    steps: list[StepProgress] = field(default_factory=list)
    provider_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SetupResult:
    """Returned by ``CloudProvider.setup_vm()`` after software install."""

    success: bool
    reboot_required: bool = False
    gpu_info: str = ""
    models_installed: list[str] = field(default_factory=list)
    error: str = ""
    steps: list[StepProgress] = field(default_factory=list)


@dataclass
class VMStatusResult:
    """Returned by ``CloudProvider.get_vm_status()``."""

    power_state: str = "unknown"
    vm_size: str = ""
    public_ip: str = ""
    provisioning_state: str = ""
    resource_count: int = 0


@dataclass
class ValidationCheck:
    """A single validation check result."""

    name: str
    passed: bool
    message: str
    detail: str = ""


@dataclass
class ValidationResult:
    """Returned by ``CloudProvider.validate()``."""

    checks: list[ValidationCheck] = field(default_factory=list)
    system_info: dict[str, str] = field(default_factory=dict)

    @property
    def all_passed(self) -> bool:
        return all(c.passed for c in self.checks)


class CloudProvider(abc.ABC):
    """Abstract interface that every cloud provider must implement.

    Lifecycle:
        1. ``validate_credentials()`` — verify the creds are valid
        2. ``provision()`` — create cloud infrastructure
        3. ``setup_vm()`` — install software on the VM via SSH
        4. ``validate()`` — verify the deployment is healthy
        5. ``start_vm()`` / ``stop_vm()`` — lifecycle management
        6. ``destroy()`` — tear everything down

    All methods receive the ``DeploymentConfig`` and ``Credentials`` so
    they are stateless — the orchestrator manages state.
    """

    # ── Identity ─────────────────────────────────────────────

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Short identifier, e.g. 'azure', 'gcp', 'aws'."""

    @property
    @abc.abstractmethod
    def display_name(self) -> str:
        """Human-readable name, e.g. 'Microsoft Azure'."""

    @abc.abstractmethod
    def list_regions(self) -> list[dict[str, str]]:
        """Return available regions as ``[{"id": "eastus", "name": "East US"}, ...]``."""

    @abc.abstractmethod
    def list_vm_sizes(self, region: str) -> list[dict[str, Any]]:
        """Return available VM sizes for a region.

        Each entry should include at least ``{"id": ..., "name": ..., "gpus": ..., "vcpus": ..., "memory_gb": ...}``.
        """

    async def list_accessible_vm_sizes(
        self,
        region: str,
        credentials: Credentials,
    ) -> list[dict[str, Any]]:
        """Return VM sizes annotated with account-specific availability.

        Providers can override this with quota-aware checks. The default keeps
        the static catalog available and marks every size as selectable.
        """
        sizes = self.list_vm_sizes(region)
        return [
            {
                **size,
                "available": size.get("available", True),
                "availability_reason": size.get("availability_reason"),
            }
            for size in sizes
        ]

    # ── Credentials ──────────────────────────────────────────

    @abc.abstractmethod
    async def validate_credentials(self, credentials: Credentials) -> tuple[bool, str]:
        """Test whether the supplied credentials are valid.

        Returns ``(is_valid, message)``.
        """

    # ── Provisioning ─────────────────────────────────────────

    @abc.abstractmethod
    async def provision(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        progress_callback: Any | None = None,
    ) -> ProvisionResult:
        """Create all cloud infrastructure (resource group, network, VM, disks).

        This is the main entry point that replaces the old ``deployer.deploy()``.
        ``progress_callback`` is called with ``(step, current, total, message)``
        as each step completes.
        """

    @abc.abstractmethod
    async def check_quota(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> tuple[bool, int, int]:
        """Check whether there is sufficient quota for the requested VM.

        Returns ``(has_quota, available, limit)``.
        """

    # ── VM Software Setup ────────────────────────────────────

    @abc.abstractmethod
    async def setup_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        progress_callback: Any | None = None,
    ) -> SetupResult:
        """Install GPU drivers, Ollama, and pull models.

        ``ssh_private_key`` is the path to the private key file on the
        backend host.
        """

    # ── Lifecycle ────────────────────────────────────────────

    @abc.abstractmethod
    async def get_vm_status(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> VMStatusResult:
        """Get current VM power state and metadata."""

    @abc.abstractmethod
    async def start_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> str:
        """Start / power-on the VM.  Returns the public IP."""

    @abc.abstractmethod
    async def stop_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> None:
        """Deallocate the VM (stops compute billing, keeps disks)."""

    @abc.abstractmethod
    async def set_auto_shutdown(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        time_utc: str = "1800",
    ) -> None:
        """Set a daily auto-shutdown schedule (HHMM in UTC).

        This is a cost-safety mechanism — the VM will automatically shut
        down every day at the specified time unless manually started again.
        """

    @abc.abstractmethod
    async def destroy(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> bool:
        """Delete all resources associated with this deployment.

        Returns ``True`` if deletion was initiated.
        """

    async def destroy_managed_resources(self, credentials: Credentials) -> dict[str, Any]:
        """Delete provider-managed resources created by this app.

        Providers can override this to offer a cleanup action for orphaned
        resources that are no longer tied cleanly to a deployment record.
        """
        raise NotImplementedError("Bulk destroy not supported by this provider")

    # ── Validation ───────────────────────────────────────────

    @abc.abstractmethod
    async def validate(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        check_gpu: bool = False,
    ) -> ValidationResult:
        """Run health checks against the deployed VM."""

    # ── Service endpoints ────────────────────────────────────

    def get_service_endpoints(
        self,
        config: DeploymentConfig,
        public_ip: str,
    ) -> ServiceEndpoints:
        """Build service endpoint URLs from config and IP.

        Default implementation covers the common case — providers can
        override if their networking differs.
        """
        ssh = f"ssh azureuser@{public_ip}" if public_ip else ""
        ollama = f"http://{public_ip}:11434" if public_ip else ""
        return ServiceEndpoints(ssh=ssh, ollama_api=ollama)
