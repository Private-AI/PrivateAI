"""Phase 2: API endpoint tests — uses FastAPI TestClient (no cloud calls).

Zero cost. Tests route wiring, request/response shapes, and error handling.

Run: pytest tests/test_api.py -m phase2 -v
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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
        assert "/api/v1/providers" in paths
        assert "/api/v1/deployments/{deployment_id}/services" in paths
