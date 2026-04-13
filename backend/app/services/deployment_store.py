"""In-memory deployment state store.

Tracks all deployment records for the lifetime of the backend process.
A future version could persist to SQLite or PostgreSQL.

Thread-safe: all mutations acquire a lock because the Azure SDK calls
run on background threads.
"""

from __future__ import annotations

import threading
from typing import Any

from app.models.deployment import (
    DeploymentConfig,
    DeploymentRecord,
    DeploymentStatus,
    ServiceEndpoints,
    StepProgress,
)

_store_instance: DeploymentStore | None = None
_store_lock = threading.Lock()


class DeploymentStore:
    """Thread-safe in-memory store for deployment records."""

    def __init__(self) -> None:
        self._records: dict[str, DeploymentRecord] = {}
        self._credentials: dict[str, Any] = {}  # deployment_id -> Credentials
        self._lock = threading.Lock()

    # ── CRUD ─────────────────────────────────────────────────

    def create(self, config: DeploymentConfig, credentials: Any) -> DeploymentRecord:
        """Create a new deployment record and store credentials."""
        with self._lock:
            record = DeploymentRecord(config=config)
            self._records[record.id] = record
            self._credentials[record.id] = credentials
            return record

    def get(self, deployment_id: str) -> DeploymentRecord | None:
        with self._lock:
            return self._records.get(deployment_id)

    def get_credentials(self, deployment_id: str) -> Any | None:
        with self._lock:
            return self._credentials.get(deployment_id)

    def list_all(self) -> list[DeploymentRecord]:
        with self._lock:
            return list(self._records.values())

    def delete(self, deployment_id: str) -> bool:
        with self._lock:
            if deployment_id in self._records:
                del self._records[deployment_id]
                self._credentials.pop(deployment_id, None)
                return True
            return False

    # ── State mutations ──────────────────────────────────────

    def update_status(
        self,
        deployment_id: str,
        status: DeploymentStatus,
        error: str = "",
        error_detail: str = "",
    ) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.status = status
                if error:
                    record.error = error
                if error_detail:
                    record.error_detail = error_detail
                record.touch()

    def update_provision_result(
        self,
        deployment_id: str,
        public_ip: str,
        vm_id: str,
        steps: list[StepProgress],
        provider_metadata: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.public_ip = public_ip
                record.vm_id = vm_id
                record.provision_steps = steps
                if provider_metadata:
                    record.provider_metadata = provider_metadata
                record.touch()

    def update_setup_steps(
        self,
        deployment_id: str,
        steps: list[StepProgress],
    ) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.setup_steps = steps
                record.touch()

    def update_endpoints(
        self,
        deployment_id: str,
        endpoints: ServiceEndpoints,
    ) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.endpoints = endpoints
                record.touch()

    def update_public_ip(self, deployment_id: str, ip: str) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.public_ip = ip
                record.touch()


def get_store() -> DeploymentStore:
    """Get the singleton store instance."""
    global _store_instance
    if _store_instance is None:
        with _store_lock:
            if _store_instance is None:
                _store_instance = DeploymentStore()
    return _store_instance
