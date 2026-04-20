"""Phase 2: API endpoint tests — uses FastAPI TestClient (no cloud calls).

Zero cost. Tests route wiring, request/response shapes, and error handling.

Run: pytest tests/test_api.py -m phase2 -v
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.providers.registry import get_provider
from app.services.orchestrator import get_orchestrator
from main import app

client = TestClient(app)


@pytest.mark.phase2
class TestHealthEndpoints:
    """Root and health endpoints."""

    def test_root(self) -> None:
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "PrivateAI" in data["message"]
        assert "version" in data

    def test_health(self) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"


@pytest.mark.phase2
class TestProviderEndpoints:
    """Provider listing and metadata endpoints."""

    def test_list_providers(self) -> None:
        resp = client.get("/api/v1/providers")
        assert resp.status_code == 200
        data = resp.json()
        assert "providers" in data
        assert len(data["providers"]) >= 1
        azure = data["providers"][0]
        assert azure["id"] == "azure"
        assert "Microsoft Azure" in azure["display_name"]
        assert len(azure["regions"]) > 0

    def test_list_vm_sizes(self) -> None:
        resp = client.get("/api/v1/providers/azure/vm-sizes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["vm_sizes"]) >= 4
        ids = [s["id"] for s in data["vm_sizes"]]
        assert "micro-cpu" in ids
        assert "t4-gpu" in ids
        assert all(not s["confidential"] for s in data["vm_sizes"])

    def test_list_vm_sizes_unknown_provider(self) -> None:
        resp = client.get("/api/v1/providers/unknown/vm-sizes")
        assert resp.status_code == 404

    def test_accessible_vm_sizes_unknown_provider(self) -> None:
        resp = client.post(
            "/api/v1/providers/unknown/accessible-vm-sizes",
            json={
                "region": "centralus",
                "credentials": {
                    "provider": "azure",
                    "subscription_id": "00000000-0000-0000-0000-000000000000",
                    "tenant_id": "00000000-0000-0000-0000-000000000000",
                    "client_id": "00000000-0000-0000-0000-000000000000",
                    "client_secret": "fake",
                },
            },
        )
        assert resp.status_code == 404

    def test_accessible_vm_sizes_returns_provider_filtered_results(
        self,
        monkeypatch,
        mock_azure_credentials,
    ) -> None:
        provider = get_provider("azure")
        mock_list = AsyncMock(
            return_value=[
                {
                    "id": "small-cpu",
                    "display_name": "Small CPU",
                    "vm_size": "Standard_D4as_v5",
                    "gpus": 0,
                    "gpu_model": "None",
                    "vcpus": 4,
                    "memory_gb": 16,
                    "confidential": False,
                    "description": "test",
                    "cost_per_hour": 0.19,
                    "available": True,
                    "availability_reason": None,
                },
                {
                    "id": "t4-gpu",
                    "display_name": "T4 GPU",
                    "vm_size": "Standard_NC4as_T4_v3",
                    "gpus": 1,
                    "gpu_model": "T4 16GB",
                    "vcpus": 4,
                    "memory_gb": 28,
                    "confidential": False,
                    "description": "test",
                    "cost_per_hour": 0.53,
                    "available": False,
                    "availability_reason": "No approved NCASv3_T4 quota is visible in centralus.",
                },
            ]
        )
        monkeypatch.setattr(provider, "list_accessible_vm_sizes", mock_list)

        resp = client.post(
            "/api/v1/providers/azure/accessible-vm-sizes",
            json={
                "region": "centralus",
                "credentials": mock_azure_credentials.model_dump(mode="json"),
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["vm_sizes"]) == 2
        assert data["vm_sizes"][0]["available"] is True
        assert data["vm_sizes"][1]["available"] is False

    def test_validate_credentials_unknown_provider(self) -> None:
        resp = client.post(
            "/api/v1/providers/unknown/validate-credentials",
            json={
                "credentials": {
                    "provider": "azure",
                    "subscription_id": "00000000-0000-0000-0000-000000000000",
                    "tenant_id": "00000000-0000-0000-0000-000000000000",
                    "client_id": "00000000-0000-0000-0000-000000000000",
                    "client_secret": "fake",
                }
            },
        )
        assert resp.status_code == 404


@pytest.mark.phase2
class TestDeploymentEndpoints:
    """Deployment CRUD and lifecycle endpoint shapes."""

    def test_list_deployments_empty(self) -> None:
        resp = client.get("/api/v1/deployments")
        assert resp.status_code == 200
        data = resp.json()
        assert "deployments" in data

    def test_get_deployment_not_found(self) -> None:
        resp = client.get("/api/v1/deployments/nonexistent-id")
        assert resp.status_code == 404

    def test_start_deployment_not_found(self) -> None:
        resp = client.post("/api/v1/deployments/nonexistent-id/start")
        assert resp.status_code == 404

    def test_stop_deployment_not_found(self) -> None:
        resp = client.post("/api/v1/deployments/nonexistent-id/stop")
        assert resp.status_code == 404

    def test_destroy_deployment_not_found(self) -> None:
        resp = client.delete("/api/v1/deployments/nonexistent-id")
        assert resp.status_code == 404

    def test_destroy_deployment_rejects_mismatched_credentials(
        self,
        test_config,
        mock_azure_credentials,
    ) -> None:
        orchestrator = get_orchestrator()
        record = orchestrator.store.create(test_config, mock_azure_credentials)

        try:
            resp = client.request(
                "DELETE",
                f"/api/v1/deployments/{record.id}",
                json={
                    "credentials": {
                        "provider": "aws",
                        "access_key_id": "fake-access-key",
                        "secret_access_key": "fake-secret-key",
                        "region": "us-east-1",
                    }
                },
            )
            assert resp.status_code == 400
        finally:
            orchestrator.store.delete(record.id)

    def test_destroy_managed_resources_route(
        self,
        monkeypatch,
        test_config,
        mock_azure_credentials,
    ) -> None:
        orchestrator = get_orchestrator()
        provider = get_provider("azure")
        record = orchestrator.store.create(test_config, mock_azure_credentials)
        orchestrator.store.set_provider_credentials("azure", mock_azure_credentials)

        async def fake_destroy_managed_resources(_credentials):  # type: ignore[no-untyped-def]
            return {
                "matched_resource_groups": [test_config.resource_group],
                "deleted_resource_groups": [test_config.resource_group],
                "failed_resource_groups": [],
            }

        monkeypatch.setattr(provider, "destroy_managed_resources", fake_destroy_managed_resources)

        try:
            resp = client.post(
                "/api/v1/deployments/destroy-managed-resources",
                json={"provider": "azure"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["deleted_resource_groups"] == [test_config.resource_group]
            assert data["removed_deployment_ids"] == [record.id]
            assert orchestrator.store.get(record.id) is None
        finally:
            orchestrator.store.delete(record.id)

    def test_setup_deployment_not_found(self) -> None:
        resp = client.post("/api/v1/deployments/nonexistent-id/setup")
        assert resp.status_code == 404

    def test_validate_deployment_not_found(self) -> None:
        resp = client.post("/api/v1/deployments/nonexistent-id/validate")
        assert resp.status_code == 404

    def test_services_deployment_not_found(self) -> None:
        resp = client.get("/api/v1/deployments/nonexistent-id/services")
        assert resp.status_code == 404

    def test_auto_shutdown_deployment_not_found(self) -> None:
        resp = client.post(
            "/api/v1/deployments/nonexistent-id/auto-shutdown",
            json={"time_utc": "1800"},
        )
        assert resp.status_code == 404


@pytest.mark.phase2
class TestOpenAPISchema:
    """Verify the OpenAPI schema is generated correctly."""

    def test_openapi_json(self) -> None:
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert schema["info"]["title"] == "PrivateAI Backend"
        paths = schema["paths"]
        assert "/api/v1/deployments" in paths
        assert "/api/v1/deployments/destroy-managed-resources" in paths
        assert "/api/v1/providers/{provider}/accessible-vm-sizes" in paths
        assert "/api/v1/providers" in paths
        assert "/api/v1/deployments/{deployment_id}/services" in paths
