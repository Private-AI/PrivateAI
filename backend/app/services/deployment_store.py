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
from typing import Any, cast

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
_MASKED_SECRET_VALUE = "**********"


def _to_plain_json(value: Any) -> Any:
    """Convert Pydantic values to JSON-safe data without masking secrets."""
    if hasattr(value, "get_secret_value"):
        return value.get_secret_value()
    if isinstance(value, dict):
        return {key: _to_plain_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain_json(item) for item in value]
    return value


def _dump_credentials(credentials: Any) -> dict[str, Any] | None:
    if not hasattr(credentials, "model_dump"):
        return None
    dumped = _to_plain_json(credentials.model_dump(mode="python"))
    if not isinstance(dumped, dict):
        return None
    return cast(dict[str, Any], dumped)


def _has_masked_secret(credentials: Any) -> bool:
    for field_name in ("client_secret", "secret_access_key", "service_account_json"):
        value = getattr(credentials, field_name, None)
        if hasattr(value, "get_secret_value"):
            value = value.get_secret_value()
        if value == _MASKED_SECRET_VALUE:
            return True
    return False


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
                        credentials = _credentials_adapter.validate_python(entry["credentials"])
                        if _has_masked_secret(credentials):
                            logger.warning(
                                "Skipping masked credentials for deployment %s",
                                record.id,
                            )
                        else:
                            self._credentials[record.id] = credentials
                except Exception as e:
                    logger.warning("Skipping corrupt deployment record: %s", e)
            for provider_name, raw_credentials in data.get("provider_credentials", {}).items():
                try:
                    credentials = _credentials_adapter.validate_python(
                        raw_credentials
                    )
                    if _has_masked_secret(credentials):
                        logger.warning(
                            "Skipping masked provider credentials for %s",
                            provider_name,
                        )
                    else:
                        self._provider_credentials[provider_name] = credentials
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
                    "credentials": _dump_credentials(cred),
                })
            provider_credentials = {
                provider_name: dumped
                for provider_name, credentials in self._provider_credentials.items()
                if (dumped := _dump_credentials(credentials)) is not None
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

    # ── CRUD ─────────────────────────────────────────────────

    def create(self, config: DeploymentConfig, credentials: Any) -> DeploymentRecord:
        with self._lock:
            record = DeploymentRecord(config=config)
            self._records[record.id] = record
            self._credentials[record.id] = credentials
            self._save()
            return record

    def get(self, deployment_id: str) -> DeploymentRecord | None:
        with self._lock:
            return self._records.get(deployment_id)

    def get_credentials(self, deployment_id: str) -> Any | None:
        with self._lock:
            return self._credentials.get(deployment_id)

    def update_credentials(self, deployment_id: str, credentials: Any) -> bool:
        with self._lock:
            if deployment_id not in self._records:
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

    def list_all(self) -> list[DeploymentRecord]:
        with self._lock:
            return list(self._records.values())

    def delete(self, deployment_id: str) -> bool:
        with self._lock:
            if deployment_id in self._records:
                del self._records[deployment_id]
                self._credentials.pop(deployment_id, None)
                self._save()
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
