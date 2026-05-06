"""Regression tests for persisted deployment state."""

from __future__ import annotations

import json
from pathlib import Path

from app.models.credentials import AzureCredentials
from app.services.deployment_store import DeploymentStore


def test_provider_credentials_persist_real_secret(tmp_path: Path) -> None:
    persist_path = tmp_path / "deployments.json"
    secret_value = "real-test-secret-value"
    credentials = AzureCredentials(
        subscription_id="00000000-0000-0000-0000-000000000000",
        tenant_id="00000000-0000-0000-0000-000000000000",
        client_id="00000000-0000-0000-0000-000000000000",
        client_secret=secret_value,
    )

    store = DeploymentStore(persist_path)
    store.set_provider_credentials("azure", credentials)

    persisted = json.loads(persist_path.read_text())
    assert persisted["provider_credentials"]["azure"]["client_secret"] == secret_value

    reloaded = DeploymentStore(persist_path)
    loaded = reloaded.get_provider_credentials("azure")

    assert loaded is not None
    assert loaded.client_secret.get_secret_value() == secret_value


def test_masked_provider_credentials_are_not_loaded(tmp_path: Path) -> None:
    persist_path = tmp_path / "deployments.json"
    persist_path.write_text(
        json.dumps(
            {
                "records": [],
                "provider_credentials": {
                    "azure": {
                        "provider": "azure",
                        "subscription_id": "00000000-0000-0000-0000-000000000000",
                        "tenant_id": "00000000-0000-0000-0000-000000000000",
                        "client_id": "00000000-0000-0000-0000-000000000000",
                        "client_secret": "**********",
                    }
                },
            }
        )
    )

    store = DeploymentStore(persist_path)

    assert store.get_provider_credentials("azure") is None
