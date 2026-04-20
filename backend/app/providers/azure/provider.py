"""Azure cloud provider — implements the CloudProvider interface.

Refactored from the original ``azure_setup`` CLI package.  All Azure SDK
calls happen here; the rest of the backend only sees the abstract
``CloudProvider`` interface.

Security model: TrustedLaunch throughout (no ConfidentialVM / TEE).
Networking: only SSH (port 22) is open in the NSG — Ollama traffic
reaches Open WebUI exclusively via an SSH port-forward tunnel managed
by ``SSHTunnelManager``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from azure.core.exceptions import ResourceNotFoundError
from azure.identity import ClientSecretCredential, DefaultAzureCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.compute.models import (
    DataDisk,
    DiskCreateOptionTypes,
    HardwareProfile,
    LinuxConfiguration,
    ManagedDiskParameters,
    NetworkInterfaceReference,
    NetworkProfile,
    OSDisk,
    OSProfile,
    SecurityProfile,
    SshConfiguration,
    SshPublicKey,
    StorageAccountTypes,
    StorageProfile,
    UefiSettings,
    VirtualMachine,
)
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.network.models import (
    AddressSpace,
    NetworkInterface,
    NetworkInterfaceIPConfiguration,
    NetworkSecurityGroup,
    PublicIPAddress,
    SecurityRule,
    SecurityRuleAccess,
    SecurityRuleDirection,
    SecurityRuleProtocol,
    Subnet,
    VirtualNetwork,
)
from azure.mgmt.resource import ResourceManagementClient

from app.models.credentials import AzureCredentials, Credentials
from app.models.deployment import (
    DeploymentConfig,
    SecurityLevel,
    ServiceEndpoints,
    StepProgress,
)
from app.providers.azure.config import (
    AZURE_GPU_REGIONS,
    AZURE_VM_PROFILES,
    build_azure_params,
    get_fallback_vm_sizes,
    parse_image_reference,
)
from app.providers.azure.validator import validate_vm_remote
from app.providers.azure.vm_setup import (
    delete_model_remote,
    list_models_remote,
    pull_model_remote,
    setup_vm_remote,
)
from app.providers.base import (
    CloudProvider as CloudProviderBase,
    ProvisionResult,
    SetupResult,
    ValidationResult,
    VMStatusResult,
)

logger = logging.getLogger(__name__)


# ── Provisioning step definitions ────────────────────────────────────

PROVISION_STEPS = [
    ("resource_group", "Creating resource group"),
    ("nsg", "Creating network security group"),
    ("vnet", "Creating virtual network"),
    ("public_ip", "Creating public IP address"),
    ("nic", "Creating network interface"),
    ("vm", "Creating virtual machine"),
    ("data_disk", "Attaching data disk"),
]


# ── Helpers ──────────────────────────────────────────────────────────


def _get_azure_credential(
    credentials: Credentials,
) -> tuple[ClientSecretCredential | DefaultAzureCredential, str]:
    """Build an Azure credential object from the API credentials model.

    Returns ``(credential, subscription_id)``.
    """
    creds: AzureCredentials = credentials  # type: ignore[assignment]
    credential = ClientSecretCredential(
        tenant_id=creds.tenant_id,
        client_id=creds.client_id,
        client_secret=creds.client_secret.get_secret_value(),
    )
    return credential, creds.subscription_id


def _read_ssh_public_key(path: str) -> str:
    """Read SSH public key from file, generating one if it doesn't exist."""
    expanded = Path(path).expanduser()
    if not expanded.exists():
        private_path = expanded.with_suffix("") if expanded.suffix == ".pub" else expanded
        pub_path = Path(f"{private_path}.pub")

        if private_path.exists():
            if pub_path.exists():
                return pub_path.read_text().strip()
            msg = (
                f"Private key exists at {private_path} but public key "
                f"{pub_path} is missing. Re-derive with: "
                f"ssh-keygen -y -f {private_path} > {pub_path}"
            )
            raise FileNotFoundError(msg)

        logger.info("SSH key not found at %s, generating ed25519 key", expanded)
        os.makedirs(private_path.parent, mode=0o700, exist_ok=True)
        subprocess.run(
            [
                "ssh-keygen",
                "-t",
                "ed25519",
                "-f",
                str(private_path),
                "-N",
                "",
                "-C",
                "privateai-deploy",
            ],
            check=True,
            capture_output=True,
        )
        expanded = pub_path
    return expanded.read_text().strip()


def _make_step(step_id: str, label: str, status: str = "pending") -> StepProgress:
    return StepProgress(step=step_id, label=label, status=status)


# ── AzureProvider ────────────────────────────────────────────────────


class AzureProvider(CloudProviderBase):
    """Azure implementation of the cloud provider interface."""

    @property
    def name(self) -> str:
        return "azure"

    @property
    def display_name(self) -> str:
        return "Microsoft Azure"

    def list_regions(self) -> list[dict[str, str]]:
        return AZURE_GPU_REGIONS

    def list_vm_sizes(self, region: str) -> list[dict[str, Any]]:
        return [
            {
                "id": p.id,
                "display_name": p.display_name,
                "vm_size": p.vm_size,
                "gpus": p.gpus,
                "gpu_model": p.gpu_model,
                "vcpus": p.vcpus,
                "memory_gb": p.memory_gb,
                "confidential": p.confidential,
                "description": p.description,
                "cost_per_hour": p.cost_per_hour,
            }
            for p in AZURE_VM_PROFILES
        ]

    # ── Credentials ──────────────────────────────────────────

    async def validate_credentials(self, credentials: Credentials) -> tuple[bool, str]:
        """Test Azure credentials by listing resource groups."""
        try:
            credential, subscription_id = _get_azure_credential(credentials)
            client = ResourceManagementClient(credential, subscription_id)
            rgs = list(client.resource_groups.list())
            return True, f"Authenticated. {len(rgs)} resource group(s) visible."
        except Exception as e:
            logger.warning("Azure credential validation failed: %s", e)
            return False, str(e)

    async def setup_permissions(self, credentials: Credentials) -> dict[str, Any]:
        """Register required Azure resource providers.

        Returns a dict with ``success``, ``providers``, and ``message``.
        """
        import time

        def _setup() -> dict[str, Any]:
            credential, subscription_id = _get_azure_credential(credentials)
            resource_client = ResourceManagementClient(credential, subscription_id)

            namespaces = ["Microsoft.Network", "Microsoft.Compute", "Microsoft.Storage"]
            results: dict[str, str] = {}

            for ns in namespaces:
                provider = resource_client.providers.get(ns)
                if provider.registration_state == "Registered":
                    results[ns] = "already_registered"
                else:
                    resource_client.providers.register(ns)
                    results[ns] = "registering"

            # Wait up to 120 s for all to be Registered
            deadline = time.time() + 120
            while time.time() < deadline:
                all_done = True
                for ns in namespaces:
                    if results[ns] != "already_registered":
                        state = resource_client.providers.get(ns).registration_state
                        if state == "Registered":
                            results[ns] = "registered"
                        else:
                            all_done = False
                if all_done:
                    break
                time.sleep(5)

            success = all(v in ("registered", "already_registered") for v in results.values())
            return {
                "success": success,
                "providers": results,
                "message": "All providers registered." if success else "Some providers are still registering — retry in a moment.",
            }

        return await asyncio.to_thread(_setup)

    # ── Provisioning ─────────────────────────────────────────

    async def provision(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        progress_callback: Any | None = None,
    ) -> ProvisionResult:
        """Create Azure infrastructure (RG, NSG, VNet, IP, NIC, VM, disk).

        Runs the blocking Azure SDK calls in a thread pool so the event
        loop stays responsive.
        """
        return await asyncio.to_thread(self._provision_sync, config, credentials, progress_callback)

    def _provision_sync(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        progress_callback: Any | None = None,
    ) -> ProvisionResult:
        """Synchronous provisioning — called from a thread."""
        az = build_azure_params(config)
        credential, subscription_id = _get_azure_credential(credentials)

        resource_client = ResourceManagementClient(credential, subscription_id)
        network_client = NetworkManagementClient(credential, subscription_id)
        compute_client = ComputeManagementClient(credential, subscription_id)

        # Skip data disk for very small VMs to save cost
        skip_data_disk = config.data_disk_size_gb <= 0

        effective_steps = PROVISION_STEPS if not skip_data_disk else [
            s for s in PROVISION_STEPS if s[0] != "data_disk"
        ]

        total = len(effective_steps)
        steps: list[StepProgress] = [_make_step(s_id, s_label) for s_id, s_label in effective_steps]
        result = ProvisionResult(success=False, steps=steps)

        def _progress(idx: int, status: str, detail: str = "") -> None:
            steps[idx].status = status
            now = datetime.now(timezone.utc)
            if status == "in_progress":
                steps[idx].started_at = now
            elif status in ("completed", "failed"):
                steps[idx].completed_at = now
            steps[idx].detail = detail
            if progress_callback:
                progress_callback(steps[idx].step, status, idx + 1, total, detail)

        # Helper to find step index by id
        def _idx(step_id: str) -> int:
            return next(i for i, s in enumerate(steps) if s.step == step_id)

        try:
            # ── 1. Resource Group ────────────────────────────
            _progress(_idx("resource_group"), "in_progress")
            resource_client.resource_groups.create_or_update(
                az["resource_group"],
                {
                    "location": az["location"],
                    "tags": {
                        "project": "privateai",
                        "created-by": "privateai-backend",
                    },
                },
            )
            _progress(_idx("resource_group"), "completed")

            # ── 2. NSG — SSH only, no public Ollama port ─────
            _progress(_idx("nsg"), "in_progress")
            nsg_params = NetworkSecurityGroup(
                location=az["location"],
                security_rules=[
                    SecurityRule(
                        name="AllowSSH",
                        priority=1000,
                        protocol=SecurityRuleProtocol.TCP,
                        access=SecurityRuleAccess.ALLOW,
                        direction=SecurityRuleDirection.INBOUND,
                        source_address_prefix=az["nsg_ssh_source"],
                        source_port_range="*",
                        destination_address_prefix="*",
                        destination_port_range="22",
                    ),
                    # Ollama (11434) is intentionally NOT opened here.
                    # Traffic reaches Ollama via SSH tunnel from the backend.
                ],
            )
            nsg_result = network_client.network_security_groups.begin_create_or_update(
                az["resource_group"], az["nsg_name"], nsg_params
            ).result(timeout=300)
            _progress(_idx("nsg"), "completed", "SSH only (Ollama via tunnel)")

            # ── 3. VNet + Subnet ─────────────────────────────
            _progress(_idx("vnet"), "in_progress")
            vnet_params = VirtualNetwork(
                location=az["location"],
                address_space=AddressSpace(address_prefixes=["10.0.0.0/16"]),
                subnets=[
                    Subnet(
                        name=az["subnet_name"],
                        address_prefix="10.0.0.0/24",
                        network_security_group=nsg_result,
                    ),
                ],
            )
            network_client.virtual_networks.begin_create_or_update(
                az["resource_group"], az["vnet_name"], vnet_params
            ).result(timeout=300)
            _progress(_idx("vnet"), "completed")

            # ── 4. Public IP ─────────────────────────────────
            _progress(_idx("public_ip"), "in_progress")
            pip_result = network_client.public_ip_addresses.begin_create_or_update(
                az["resource_group"],
                az["pip_name"],
                PublicIPAddress(
                    location=az["location"],
                    sku={"name": "Standard"},
                    public_ip_allocation_method="Static",
                ),
            ).result(timeout=300)
            _progress(_idx("public_ip"), "completed")

            # ── 5. NIC ───────────────────────────────────────
            _progress(_idx("nic"), "in_progress")
            subnet_info = network_client.subnets.get(
                az["resource_group"], az["vnet_name"], az["subnet_name"]
            )
            accel_net = not any(
                prefix in az["vm_size"]
                for prefix in ("Standard_B", "Standard_A", "Standard_D1", "Standard_DS1")
            )
            nic_result = network_client.network_interfaces.begin_create_or_update(
                az["resource_group"],
                az["nic_name"],
                NetworkInterface(
                    location=az["location"],
                    ip_configurations=[
                        NetworkInterfaceIPConfiguration(
                            name="ipconfig1",
                            subnet=subnet_info,
                            public_ip_address=pip_result,
                        ),
                    ],
                    enable_accelerated_networking=accel_net,
                ),
            ).result(timeout=300)
            _progress(_idx("nic"), "completed")

            # ── 6. VM (with SKU fallback on capacity errors) ──
            _progress(_idx("vm"), "in_progress", "this takes 3-8 minutes")
            ssh_key_data = _read_ssh_public_key(az["ssh_key_path"])

            security_profile = SecurityProfile(
                security_type="TrustedLaunch",
                uefi_settings=UefiSettings(
                    secure_boot_enabled=az["secure_boot"],
                    v_tpm_enabled=az["vtpm"],
                ),
            )
            image_ref = parse_image_reference(az["image"])

            sku_candidates = [az["vm_size"]] + get_fallback_vm_sizes(az["vm_size"])
            vm_result = None
            last_sku_error: Exception | None = None
            for sku in sku_candidates:
                try:
                    logger.info("Trying VM SKU: %s", sku)
                    _progress(_idx("vm"), "in_progress", f"trying {sku}…")
                    vm_result = compute_client.virtual_machines.begin_create_or_update(
                        az["resource_group"],
                        az["vm_name"],
                        VirtualMachine(
                            location=az["location"],
                            hardware_profile=HardwareProfile(vm_size=sku),
                            storage_profile=StorageProfile(
                                image_reference=image_ref,
                                os_disk=OSDisk(
                                    create_option="FromImage",
                                    disk_size_gb=az["os_disk_size_gb"],
                                    managed_disk=ManagedDiskParameters(
                                        storage_account_type=az["os_disk_type"],
                                    ),
                                ),
                            ),
                            os_profile=OSProfile(
                                computer_name=az["vm_name"],
                                admin_username=az["vm_user"],
                                linux_configuration=LinuxConfiguration(
                                    disable_password_authentication=True,
                                    ssh=SshConfiguration(
                                        public_keys=[
                                            SshPublicKey(
                                                path=f"/home/{az['vm_user']}/.ssh/authorized_keys",
                                                key_data=ssh_key_data,
                                            ),
                                        ],
                                    ),
                                ),
                            ),
                            network_profile=NetworkProfile(
                                network_interfaces=[NetworkInterfaceReference(id=nic_result.id)],
                            ),
                            security_profile=security_profile,
                            tags={"project": "privateai", "created-by": "privateai-backend", "vm-sku": sku},
                        ),
                    ).result(timeout=900)
                    logger.info("VM created with SKU: %s", sku)
                    break
                except Exception as e:
                    if "SkuNotAvailable" in str(e) or "Capacity" in str(e):
                        logger.warning("SKU %s not available, trying next fallback: %s", sku, e)
                        last_sku_error = e
                        continue
                    raise

            if vm_result is None:
                raise last_sku_error or RuntimeError("No available VM SKU found")

            result.vm_id = vm_result.id or ""
            _progress(_idx("vm"), "completed")

            # ── 7. Data Disk (skipped for very small VMs) ────
            if not skip_data_disk:
                _progress(_idx("data_disk"), "in_progress", f"{az['data_disk_size_gb']} GB")
                current_vm = compute_client.virtual_machines.get(
                    az["resource_group"], az["vm_name"]
                )
                existing_disks = (
                    current_vm.storage_profile.data_disks
                    if current_vm.storage_profile and current_vm.storage_profile.data_disks
                    else []
                )
                next_lun = max((d.lun for d in existing_disks), default=-1) + 1
                existing_disks.append(
                    DataDisk(
                        lun=next_lun,
                        name=az["data_disk_name"],
                        create_option=DiskCreateOptionTypes.EMPTY,
                        disk_size_gb=az["data_disk_size_gb"],
                        managed_disk=ManagedDiskParameters(
                            storage_account_type=StorageAccountTypes(az["data_disk_type"]),
                        ),
                    )
                )
                if current_vm.storage_profile:
                    current_vm.storage_profile.data_disks = existing_disks
                compute_client.virtual_machines.begin_create_or_update(
                    az["resource_group"], az["vm_name"], current_vm
                ).result(timeout=600)
                _progress(_idx("data_disk"), "completed")

            # ── Get public IP ────────────────────────────────
            pip_info = network_client.public_ip_addresses.get(
                az["resource_group"], az["pip_name"]
            )
            result.public_ip = pip_info.ip_address or ""
            result.success = True
            result.provider_metadata = {
                "subscription_id": subscription_id,
                "resource_group": az["resource_group"],
                "vm_name": az["vm_name"],
                "vm_user": az["vm_user"],
                "ssh_key_path": az["ssh_key_path"],
                "location": az["location"],
            }

            logger.info(
                "Azure provisioning complete: ip=%s vm_id=%s",
                result.public_ip,
                result.vm_id,
            )
            return result

        except Exception as e:
            import traceback

            failed_idx = next(
                (i for i, s in enumerate(steps) if s.status == "in_progress"),
                len(steps) - 1,
            )
            _progress(failed_idx, "failed", str(e))
            result.error = str(e)
            result.error_detail = traceback.format_exc()
            logger.error("Azure provisioning failed: %s", e, exc_info=True)

            # Auto-cleanup: explicitly delete quota-consuming resources first
            # (public IP, NIC, VM) so limits are freed immediately, then
            # delete the whole resource group for full cleanup.
            rg = az.get("resource_group", "")
            if rg:
                try:
                    resource_client.resource_groups.get(rg)
                except Exception:
                    rg = ""  # RG never created — nothing to clean up

            if rg:
                logger.info("Auto-cleanup starting for resource group %s", rg)
                # 1. VM — must be deleted before NIC/disk can be freed
                try:
                    compute_client.virtual_machines.begin_delete(
                        rg, az.get("vm_name", "")
                    ).result(timeout=120)
                    logger.info("Auto-cleanup: VM deleted")
                except Exception as ex:
                    logger.debug("Auto-cleanup VM delete skipped: %s", ex)

                # 2. NIC — must go before public IP can be disassociated
                try:
                    network_client.network_interfaces.begin_delete(
                        rg, az.get("nic_name", "")
                    ).result(timeout=60)
                    logger.info("Auto-cleanup: NIC deleted")
                except Exception as ex:
                    logger.debug("Auto-cleanup NIC delete skipped: %s", ex)

                # 3. Public IP — delete explicitly so quota is freed NOW
                try:
                    network_client.public_ip_addresses.begin_delete(
                        rg, az.get("pip_name", "")
                    ).result(timeout=60)
                    logger.info("Auto-cleanup: public IP deleted — quota freed")
                except Exception as ex:
                    logger.debug("Auto-cleanup public IP delete skipped: %s", ex)

                # 4. Delete the whole RG for everything else (async, fire-and-forget)
                try:
                    resource_client.resource_groups.begin_delete(rg)
                    logger.info("Auto-cleanup: resource group %s deletion initiated", rg)
                except Exception as ex:
                    logger.warning("Auto-cleanup RG delete failed: %s", ex)

            return result

    async def check_quota(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> tuple[bool, int, int]:
        """Check GPU quota in the target region."""
        credential, subscription_id = _get_azure_credential(credentials)
        compute_client = ComputeManagementClient(credential, subscription_id)

        def _check() -> tuple[bool, int, int]:
            usages = compute_client.usage.list(config.region)
            for usage in usages:
                if (
                    usage.name
                    and usage.name.localized_value
                    and "NCCadsH100v5" in usage.name.localized_value
                ):
                    limit = usage.limit or 0
                    current = usage.current_value or 0
                    available = limit - current
                    return available > 0, available, limit
            return False, 0, 0

        return await asyncio.to_thread(_check)

    # ── VM Software Setup ────────────────────────────────────

    async def setup_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        progress_callback: Any | None = None,
    ) -> SetupResult:
        """Install GPU drivers, Ollama, and pull models."""
        az = build_azure_params(config)
        return await asyncio.to_thread(
            setup_vm_remote,
            ip=public_ip,
            username=az["vm_user"],
            ssh_key_path=ssh_private_key,
            models=config.setup.models,
            has_data_disk=config.data_disk_size_gb > 0,
            has_gpu=config.gpu_enabled,
            progress_callback=progress_callback,
        )

    # ── Model management (via SSH) ───────────────────────────

    async def list_models(
        self,
        config: DeploymentConfig,
        public_ip: str,
        ssh_private_key: str,
    ) -> list[dict[str, Any]]:
        az = build_azure_params(config)
        return await asyncio.to_thread(
            list_models_remote,
            ip=public_ip,
            username=az["vm_user"],
            ssh_key_path=ssh_private_key,
        )

    async def pull_model(
        self,
        config: DeploymentConfig,
        public_ip: str,
        ssh_private_key: str,
        model: str,
    ) -> dict[str, Any]:
        az = build_azure_params(config)
        return await asyncio.to_thread(
            pull_model_remote,
            ip=public_ip,
            username=az["vm_user"],
            ssh_key_path=ssh_private_key,
            model=model,
        )

    async def delete_model(
        self,
        config: DeploymentConfig,
        public_ip: str,
        ssh_private_key: str,
        model: str,
    ) -> dict[str, Any]:
        az = build_azure_params(config)
        return await asyncio.to_thread(
            delete_model_remote,
            ip=public_ip,
            username=az["vm_user"],
            ssh_key_path=ssh_private_key,
            model=model,
        )

    # ── Lifecycle ────────────────────────────────────────────

    async def get_vm_status(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> VMStatusResult:
        credential, subscription_id = _get_azure_credential(credentials)

        def _status() -> VMStatusResult:
            compute_client = ComputeManagementClient(credential, subscription_id)
            network_client = NetworkManagementClient(credential, subscription_id)
            resource_client = ResourceManagementClient(credential, subscription_id)

            result = VMStatusResult()

            try:
                vm = compute_client.virtual_machines.get(
                    config.resource_group, config.vm_name, expand="instanceView"
                )
                result.vm_size = vm.hardware_profile.vm_size if vm.hardware_profile else "unknown"
                result.provisioning_state = vm.provisioning_state or "unknown"
                if vm.instance_view and vm.instance_view.statuses:
                    for status in vm.instance_view.statuses:
                        if status.code and status.code.startswith("PowerState/"):
                            result.power_state = status.display_status or status.code
            except Exception as e:
                result.power_state = f"VM not found: {e}"

            try:
                pip_name = f"{config.vm_name}-pip"
                pip = network_client.public_ip_addresses.get(config.resource_group, pip_name)
                result.public_ip = pip.ip_address or ""
            except Exception:
                pass

            try:
                resources = list(
                    resource_client.resources.list_by_resource_group(config.resource_group)
                )
                result.resource_count = len(resources)
            except Exception:
                pass

            return result

        return await asyncio.to_thread(_status)

    async def start_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> str:
        credential, subscription_id = _get_azure_credential(credentials)

        def _start() -> str:
            compute_client = ComputeManagementClient(credential, subscription_id)
            network_client = NetworkManagementClient(credential, subscription_id)

            compute_client.virtual_machines.begin_start(
                config.resource_group, config.vm_name
            ).result()

            pip = network_client.public_ip_addresses.get(
                config.resource_group, f"{config.vm_name}-pip"
            )
            return pip.ip_address or ""

        return await asyncio.to_thread(_start)

    async def stop_vm(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> None:
        credential, subscription_id = _get_azure_credential(credentials)

        def _stop() -> None:
            ComputeManagementClient(credential, subscription_id).virtual_machines.begin_deallocate(
                config.resource_group, config.vm_name
            ).result()

        await asyncio.to_thread(_stop)

    async def set_auto_shutdown(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        time_utc: str = "1800",
    ) -> None:
        credential, subscription_id = _get_azure_credential(credentials)
        az = build_azure_params(config)

        def _set_schedule() -> None:
            vm_id = (
                f"/subscriptions/{subscription_id}"
                f"/resourceGroups/{config.resource_group}"
                f"/providers/Microsoft.Compute/virtualMachines/{config.vm_name}"
            )
            resource_client = ResourceManagementClient(credential, subscription_id)
            schedule_name = f"shutdown-computevm-{config.vm_name}"
            schedule_params = {
                "location": az["location"],
                "properties": {
                    "status": "Enabled",
                    "taskType": "ComputeVmShutdownTask",
                    "dailyRecurrence": {"time": time_utc},
                    "timeZoneId": "UTC",
                    "targetResourceId": vm_id,
                },
            }
            resource_client.resources.begin_create_or_update(
                config.resource_group,
                "Microsoft.DevTestLab",
                "",
                "schedules",
                schedule_name,
                "2018-09-15",
                schedule_params,
            ).result()
            logger.info("Auto-shutdown set to %s UTC for %s", time_utc, config.vm_name)

        await asyncio.to_thread(_set_schedule)

    async def destroy(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
    ) -> bool:
        credential, subscription_id = _get_azure_credential(credentials)

        def _destroy() -> bool:
            resource_client = ResourceManagementClient(credential, subscription_id)
            try:
                resource_client.resource_groups.get(config.resource_group)
            except ResourceNotFoundError:
                return True
            try:
                resource_client.resource_groups.begin_delete(config.resource_group).result(
                    timeout=300
                )
            except Exception as e:
                msg = f"Azure destroy failed for resource group '{config.resource_group}': {e}"
                raise RuntimeError(msg) from e
            return True

        return await asyncio.to_thread(_destroy)

    async def destroy_managed_resources(self, credentials: Credentials) -> dict[str, Any]:
        credential, subscription_id = _get_azure_credential(credentials)

        def _destroy_managed_resources() -> dict[str, Any]:
            resource_client = ResourceManagementClient(credential, subscription_id)
            targets: list[str] = []
            for rg in resource_client.resource_groups.list():
                name = rg.name or ""
                tags = rg.tags or {}
                if not name:
                    continue
                if tags.get("project") != "privateai":
                    continue
                if tags.get("created-by") != "privateai-backend":
                    continue
                targets.append(name)

            deleted: list[str] = []
            failed: list[str] = []
            for rg_name in sorted(targets):
                try:
                    resource_client.resource_groups.begin_delete(rg_name).result(timeout=900)
                    deleted.append(rg_name)
                except ResourceNotFoundError:
                    deleted.append(rg_name)
                except Exception as e:
                    logger.error("Bulk Azure destroy failed for %s: %s", rg_name, e)
                    failed.append(rg_name)

            return {
                "matched_resource_groups": sorted(targets),
                "deleted_resource_groups": deleted,
                "failed_resource_groups": failed,
            }

        return await asyncio.to_thread(_destroy_managed_resources)

    # ── Validation ───────────────────────────────────────────

    async def validate(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        public_ip: str,
        ssh_private_key: str,
        check_gpu: bool = False,
    ) -> ValidationResult:
        az = build_azure_params(config)
        return await asyncio.to_thread(
            validate_vm_remote,
            ip=public_ip,
            username=az["vm_user"],
            ssh_key_path=ssh_private_key,
            check_gpu=check_gpu,
        )

    # ── Service endpoints ────────────────────────────────────

    def get_service_endpoints(
        self,
        config: DeploymentConfig,
        public_ip: str,
    ) -> ServiceEndpoints:
        az = build_azure_params(config)
        ssh = f"ssh {az['vm_user']}@{public_ip}" if public_ip else ""
        return ServiceEndpoints(ssh=ssh, ollama_api="")
