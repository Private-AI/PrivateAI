"""Deployment state store — persists to JSON across backend restarts.

Thread-safe: all mutations acquire a lock because the Azure SDK calls
run on background threads.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from app.models.credentials import Credentials
from app.models.deployment import (
    DeploymentConfig,
    DeploymentRecord,
    DeploymentStatus,
    ServiceEndpoints,
    StepProgress,
)

logger = logging.getLogger(__name__)

_store_instance: DeploymentStore | None = None
_store_lock = threading.Lock()
_credentials_adapter = TypeAdapter(Credentials)

# Stored in the same volume as Open WebUI data so it survives restarts
_DEFAULT_PERSIST_PATH = Path(
    os.environ.get("OPEN_WEBUI_DATA_DIR", "/app/open-webui-data")
) / "deployments.json"


class DeploymentStore:
    """Thread-safe deployment record store with JSON file persistence."""

    def __init__(self, persist_path: Path = _DEFAULT_PERSIST_PATH) -> None:
        self._records: dict[str, DeploymentRecord] = {}
        self._credentials: dict[str, Any] = {}
        self._provider_credentials: dict[str, Any] = {}
        self._lock = threading.Lock()
        self._persist_path = persist_path
        self._load()

    # ── Persistence ──────────────────────────────────────────

    def _load(self) -> None:
        if not self._persist_path.exists():
            return
        try:
            data = json.loads(self._persist_path.read_text())
            for entry in data.get("records", []):
                try:
                    record = DeploymentRecord.model_validate(entry["record"])
                    self._records[record.id] = record
                    if entry.get("credentials"):
                        self._credentials[record.id] = _credentials_adapter.validate_python(
                            entry["credentials"]
                        )
                except Exception as e:
                    logger.warning("Skipping corrupt deployment record: %s", e)
            for provider_name, raw_credentials in data.get("provider_credentials", {}).items():
                try:
                    self._provider_credentials[provider_name] = _credentials_adapter.validate_python(
                        raw_credentials
                    )
                except Exception as e:
                    logger.warning(
                        "Skipping corrupt provider credentials for %s: %s",
                        provider_name,
                        e,
                    )
            logger.info("Loaded %d deployment(s) from %s", len(self._records), self._persist_path)
        except Exception as e:
            logger.warning("Could not load deployment store: %s", e)

    def _save(self) -> None:
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            entries = []
            for dep_id, record in self._records.items():
                cred = self._credentials.get(dep_id)
                entries.append({
                    "record": record.model_dump(mode="json"),
                    "credentials": cred.model_dump(mode="json") if hasattr(cred, "model_dump") else None,
                })
            provider_credentials = {
                provider_name: credentials.model_dump(mode="json")
                for provider_name, credentials in self._provider_credentials.items()
                if hasattr(credentials, "model_dump")
            }
            self._persist_path.write_text(
                json.dumps(
                    {
                        "records": entries,
                        "provider_credentials": provider_credentials,
                    },
                    indent=2,
                )
            )
        except Exception as e:
            logger.warning("Could not persist deployment store: %s", e)

    # ── CRUD ─────────────────────────────────────────────────────────────

    def create(self, config: DeploymentConfig, credentials: Any, user_id: str = "") -> DeploymentRecord:
        with self._lock:
            record = DeploymentRecord(config=config, user_id=user_id)
            self._records[record.id] = record
            self._credentials[record.id] = credentials
            self._save()
            return record

    def get(self, deployment_id: str, user_id: str | None = None) -> DeploymentRecord | None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record is None:
                return None
            if user_id is not None and record.user_id != user_id:
                return None
            return record

    def get_credentials(self, deployment_id: str, user_id: str | None = None) -> Any | None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record is None:
                return None
            if user_id is not None and record.user_id != user_id:
                return None
            return self._credentials.get(deployment_id)

    def update_credentials(self, deployment_id: str, credentials: Any, user_id: str | None = None) -> bool:
        with self._lock:
            record = self._records.get(deployment_id)
            if record is None:
                return False
            if user_id is not None and record.user_id != user_id:
                return False
            self._credentials[deployment_id] = credentials
            self._save()
            return True

    def get_provider_credentials(self, provider_name: str) -> Any | None:
        with self._lock:
            return self._provider_credentials.get(provider_name)

    def set_provider_credentials(self, provider_name: str, credentials: Any) -> None:
        with self._lock:
            self._provider_credentials[provider_name] = credentials
            self._save()

    def list_all(self, user_id: str | None = None) -> list[DeploymentRecord]:
        with self._lock:
            records = list(self._records.values())
            if user_id is not None:
                records = [r for r in records if r.user_id == user_id]
            return records

    def delete(self, deployment_id: str, user_id: str | None = None) -> bool:
        with self._lock:
            record = self._records.get(deployment_id)
            if record is None:
                return False
            if user_id is not None and record.user_id != user_id:
                return False
            del self._records[deployment_id]
            self._credentials.pop(deployment_id, None)
            self._save()
            return True

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
                self._save()

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
                self._save()

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
                self._save()

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
                self._save()

    def update_public_ip(self, deployment_id: str, ip: str) -> None:
        with self._lock:
            record = self._records.get(deployment_id)
            if record:
                record.public_ip = ip
                record.touch()
                self._save()


def get_store() -> DeploymentStore:
    global _store_instance
    if _store_instance is None:
        with _store_lock:
            if _store_instance is None:
                _store_instance = DeploymentStore()
    return _store_instance
