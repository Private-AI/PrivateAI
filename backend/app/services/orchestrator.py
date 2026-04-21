"""Deployment orchestrator — coordinates provisioning and setup.

The orchestrator is the single entry point for all deployment lifecycle
operations.  It:
  1. Creates a ``DeploymentRecord`` in the store
  2. Dispatches to the correct ``CloudProvider``
  3. Updates the record as steps complete
  4. Broadcasts progress via WebSocket (if listeners are attached)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.models.credentials import Credentials
from app.models.deployment import (
    DeploymentConfig,
    DeploymentRecord,
    DeploymentStatus,
)
from app.providers.base import CloudProvider
from app.providers.registry import get_provider
from app.services.cost_monitor import get_cost_monitor
from app.services.deployment_store import DeploymentStore, get_store
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


class DeploymentOrchestrator:
    """Coordinates multi-step deployment workflows."""

    def __init__(self, store: DeploymentStore | None = None) -> None:
        self.store = store or get_store()

    def _get_provider(self, provider_name: str) -> CloudProvider:
        return get_provider(provider_name)

    def _resolve_credentials(
        self,
        deployment_id: str,
        provider_name: str,
    ) -> Credentials | None:
        provider_credentials = self.store.get_provider_credentials(provider_name)
        if provider_credentials is not None:
            return provider_credentials
        deployment_credentials = self.store.get_credentials(deployment_id)
        if deployment_credentials is None:
            return None
        return deployment_credentials

    # ── Credential validation ────────────────────────────────

    async def validate_credentials(
        self, provider_name: str, credentials: Credentials
    ) -> tuple[bool, str]:
        provider = self._get_provider(provider_name)
        valid, message = await provider.validate_credentials(credentials)
        if valid:
            self.store.set_provider_credentials(provider_name, credentials)
        return valid, message

    # ── Full provisioning pipeline ───────────────────────────

    async def create_deployment(
        self,
        config: DeploymentConfig,
        credentials: Credentials,
        user_id: str = "",
    ) -> DeploymentRecord:
        """Create a deployment record and kick off provisioning in the
        background.

        Returns immediately with the new record (status=PENDING).
        The caller can poll ``GET /deployments/{id}`` or listen on the
        WebSocket for progress.
        """
        # Write SSH private key to temp file if provided in credentials
        ssh_key_content = ""
        if hasattr(credentials, "ssh_private_key"):
            ssh_key_content = credentials.ssh_private_key or ""
        if ssh_key_content:
            from app.utils.ssh_key import write_temp_ssh_key
            temp_key_path = write_temp_ssh_key(ssh_key_content)
            config.provider_options["ssh_key_path"] = temp_key_path
            config.provider_options["_temp_ssh_key"] = temp_key_path

        record = self.store.create(config, credentials, user_id=user_id)
        self.store.set_provider_credentials(config.provider, credentials)
        logger.info("Created deployment %s (provider=%s, user=%s)", record.id, config.provider, user_id)

        # Register with cost monitor
        cost_per_hour = self._get_cost_per_hour(config.vm_size)
        cost_monitor = get_cost_monitor()
        cost_monitor.register_deployment(record.id, config.vm_size, cost_per_hour)

        # Launch provisioning as a background task
        asyncio.create_task(self._run_provision(record.id))
        return record

    @staticmethod
    def _get_cost_per_hour(vm_size: str) -> float:
        """Look up cost/hr for a VM size from the Azure profile catalog."""
        try:
            from app.providers.azure.config import get_cost_per_hour

            return get_cost_per_hour(vm_size)
        except Exception:
            return 0.0

    async def _run_provision(self, deployment_id: str) -> None:
        """Background task: provision infrastructure then optionally
        set up VM software.
        """
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            logger.error("Deployment %s not found in store", deployment_id)
            return

        provider = self._get_provider(record.config.provider)

        # ── Phase 1: Provision infrastructure ────────────────
        self.store.update_status(deployment_id, DeploymentStatus.PROVISIONING)
        await ws_manager.broadcast(
            deployment_id,
            {
                "type": "status_change",
                "status": DeploymentStatus.PROVISIONING,
            },
        )

        # Capture the running loop up front so thread-based progress
        # callbacks (from Azure SDK / Paramiko threads) can safely
        # schedule broadcasts back on to the main event loop.
        loop = asyncio.get_running_loop()

        def _provision_progress(step: str, status: str, current: int, total: int, msg: str) -> None:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(
                    deployment_id,
                    {
                        "type": "provision_progress",
                        "step": step,
                        "status": status,
                        "current": current,
                        "total": total,
                        "message": msg,
                    },
                ),
                loop,
            )

        result = await provider.provision(
            record.config, credentials, progress_callback=_provision_progress
        )

        self.store.update_provision_result(
            deployment_id,
            public_ip=result.public_ip,
            vm_id=result.vm_id,
            steps=result.steps,
            provider_metadata=result.provider_metadata,
        )

        if not result.success:
            self.store.update_status(
                deployment_id,
                DeploymentStatus.FAILED,
                error=result.error,
                error_detail=result.error_detail,
            )
            await ws_manager.broadcast(
                deployment_id,
                {
                    "type": "status_change",
                    "status": DeploymentStatus.FAILED,
                    "error": result.error,
                },
            )
            return

        # Build service endpoints: SSH is always available;
        # Ollama is only reachable via SSH tunnel (set later when chat opens)
        endpoints = provider.get_service_endpoints(record.config, result.public_ip)
        self.store.update_endpoints(deployment_id, endpoints)

        await ws_manager.broadcast(
            deployment_id,
            {
                "type": "provision_complete",
                "public_ip": result.public_ip,
            },
        )

        # ── Phase 2: VM software setup ───────────────────────
        self.store.update_status(deployment_id, DeploymentStatus.CONFIGURING)
        await ws_manager.broadcast(
            deployment_id,
            {
                "type": "status_change",
                "status": DeploymentStatus.CONFIGURING,
            },
        )

        ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")

        def _setup_progress(step: str, status: str, current: int, total: int, msg: str) -> None:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(
                    deployment_id,
                    {
                        "type": "setup_progress",
                        "step": step,
                        "status": status,
                        "current": current,
                        "total": total,
                        "message": msg,
                    },
                ),
                loop,
            )

        setup_result = await provider.setup_vm(
            record.config,
            credentials,
            result.public_ip,
            ssh_key,
            progress_callback=_setup_progress,
        )

        self.store.update_setup_steps(deployment_id, setup_result.steps)

        if setup_result.success:
            self.store.update_status(deployment_id, DeploymentStatus.RUNNING)
            # Start cost billing now that the VM is running
            get_cost_monitor().start_billing(deployment_id)
            await ws_manager.broadcast(
                deployment_id,
                {
                    "type": "status_change",
                    "status": DeploymentStatus.RUNNING,
                },
            )
        elif setup_result.reboot_required:
            self.store.update_status(
                deployment_id,
                DeploymentStatus.RUNNING,
                error="VM needs reboot for GPU drivers. Reboot then re-run setup.",
            )
            # Still billing — VM is running even if setup needs a reboot
            get_cost_monitor().start_billing(deployment_id)
            await ws_manager.broadcast(
                deployment_id,
                {
                    "type": "reboot_required",
                    "message": setup_result.error,
                },
            )
        else:
            self.store.update_status(
                deployment_id,
                DeploymentStatus.FAILED,
                error=setup_result.error,
            )
            await ws_manager.broadcast(
                deployment_id,
                {
                    "type": "status_change",
                    "status": DeploymentStatus.FAILED,
                    "error": setup_result.error,
                },
            )

    # ── Setup (re-run) ───────────────────────────────────────

    async def setup_deployment(self, deployment_id: str) -> bool:
        """Re-run VM software setup (e.g. after a reboot)."""
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials or not record.public_ip:
            return False

        provider = self._get_provider(record.config.provider)
        self.store.update_status(deployment_id, DeploymentStatus.CONFIGURING)

        ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
        setup_result = await provider.setup_vm(
            record.config, credentials, record.public_ip, ssh_key
        )

        self.store.update_setup_steps(deployment_id, setup_result.steps)

        if setup_result.success:
            self.store.update_status(deployment_id, DeploymentStatus.RUNNING)
        else:
            self.store.update_status(
                deployment_id, DeploymentStatus.FAILED, error=setup_result.error
            )
        return setup_result.success

    # ── Lifecycle ────────────────────────────────────────────

    async def start_deployment(self, deployment_id: str) -> str | None:
        """Start a stopped VM. Returns the public IP or None."""
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            return None

        provider = self._get_provider(record.config.provider)
        self.store.update_status(deployment_id, DeploymentStatus.STARTING)

        try:
            ip = await provider.start_vm(record.config, credentials)
            self.store.update_public_ip(deployment_id, ip)
            endpoints = provider.get_service_endpoints(record.config, ip)
            self.store.update_endpoints(deployment_id, endpoints)
            self.store.update_status(deployment_id, DeploymentStatus.RUNNING)
            # Resume cost billing
            get_cost_monitor().start_billing(deployment_id)
            return ip
        except Exception as e:
            self.store.update_status(deployment_id, DeploymentStatus.FAILED, error=str(e))
            return None

    async def stop_deployment(self, deployment_id: str) -> bool:
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            return False

        provider = self._get_provider(record.config.provider)
        self.store.update_status(deployment_id, DeploymentStatus.STOPPING)

        try:
            await provider.stop_vm(record.config, credentials)
            self.store.update_status(deployment_id, DeploymentStatus.STOPPED)
            # Pause cost billing
            get_cost_monitor().stop_billing(deployment_id)
            return True
        except Exception as e:
            self.store.update_status(deployment_id, DeploymentStatus.FAILED, error=str(e))
            return False

    async def set_auto_shutdown(self, deployment_id: str, time_utc: str = "1800") -> bool:
        """Configure daily auto-shutdown for cost safety."""
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            return False

        provider = self._get_provider(record.config.provider)
        try:
            await provider.set_auto_shutdown(record.config, credentials, time_utc)
            return True
        except Exception as e:
            logger.error("Auto-shutdown failed: %s", e)
            return False

    async def destroy_deployment(self, deployment_id: str) -> bool:
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            return False

        provider = self._get_provider(record.config.provider)
        self.store.update_status(deployment_id, DeploymentStatus.DESTROYING)

        try:
            success = await provider.destroy(record.config, credentials)
            if success:
                self.store.update_status(deployment_id, DeploymentStatus.DESTROYED)
                # Stop billing and remove from cost tracker
                cost_monitor = get_cost_monitor()
                cost_monitor.stop_billing(deployment_id)
                cost_monitor.remove_deployment(deployment_id)
                # Clean up temp SSH key if we created one
                temp_key = record.config.provider_options.get("_temp_ssh_key")
                if temp_key:
                    from app.utils.ssh_key import cleanup_temp_ssh_key
                    cleanup_temp_ssh_key(temp_key)
            else:
                self.store.update_status(deployment_id, DeploymentStatus.FAILED, error="Destroy failed")
            return success
        except Exception as e:
            self.store.update_status(deployment_id, DeploymentStatus.FAILED, error=str(e))
            return False

    async def destroy_managed_resources(
        self,
        provider_name: str,
        credentials: Credentials | None = None,
    ) -> dict[str, Any]:
        resolved_credentials = credentials or self.store.get_provider_credentials(provider_name)
        if resolved_credentials is None:
            raise ValueError(f"No {provider_name} credentials available for managed cleanup")

        provider = self._get_provider(provider_name)
        result = await provider.destroy_managed_resources(resolved_credentials)
        self.store.set_provider_credentials(provider_name, resolved_credentials)

        deleted_resource_groups = set(result.get("deleted_resource_groups", []))
        removed_deployment_ids: list[str] = []
        for record in self.store.list_all():
            if record.config.provider != provider_name:
                continue
            if record.config.resource_group not in deleted_resource_groups:
                continue
            get_cost_monitor().stop_billing(record.id)
            get_cost_monitor().remove_deployment(record.id)
            self.store.delete(record.id)
            removed_deployment_ids.append(record.id)

        result["removed_deployment_ids"] = removed_deployment_ids
        return result

    # ── Status ───────────────────────────────────────────────

    async def refresh_status(self, deployment_id: str) -> DeploymentRecord | None:
        """Query the cloud provider for live VM status and update the record."""
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials:
            return None

        provider = self._get_provider(record.config.provider)
        vm_status = await provider.get_vm_status(record.config, credentials)
        record.provider_metadata["live_status"] = {
            "power_state": vm_status.power_state,
            "vm_size": vm_status.vm_size,
            "public_ip": vm_status.public_ip,
            "provisioning_state": vm_status.provisioning_state,
            "resource_count": vm_status.resource_count,
        }
        if vm_status.public_ip:
            self.store.update_public_ip(deployment_id, vm_status.public_ip)
        record.touch()
        return record

    # ── Validation ───────────────────────────────────────────

    async def validate_deployment(
        self, deployment_id: str, check_gpu: bool = False
    ) -> dict[str, Any]:
        record = self.store.get(deployment_id)
        credentials = self._resolve_credentials(
            deployment_id,
            record.config.provider if record else "",
        )
        if not record or not credentials or not record.public_ip:
            return {"error": "Deployment not found or no IP"}

        provider = self._get_provider(record.config.provider)
        ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
        result = await provider.validate(
            record.config, credentials, record.public_ip, ssh_key, check_gpu
        )
        return {
            "all_passed": result.all_passed,
            "checks": [
                {
                    "name": c.name,
                    "passed": c.passed,
                    "message": c.message,
                    "detail": c.detail,
                }
                for c in result.checks
            ],
            "system_info": result.system_info,
        }


# ── Singleton ────────────────────────────────────────────────────────

_orchestrator: DeploymentOrchestrator | None = None


def get_orchestrator() -> DeploymentOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = DeploymentOrchestrator()
    return _orchestrator
