"""API request / response schemas.

These are the Pydantic models that FastAPI uses for automatic
validation, serialization, and OpenAPI doc generation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.credentials import Credentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    DeploymentStatus,
    SecurityLevel,
    ServiceEndpoints,
    SetupConfig,
    StepProgress,
)


# ── Deployment CRUD ──────────────────────────────────────────────────


class CreateDeploymentRequest(BaseModel):
    """POST /api/v1/deployments — start a new provisioning run.

    This is the single JSON the frontend sends when the user clicks
    "Provision".
    """

    credentials: Credentials = Field(..., description="Cloud provider credentials")
    config: DeploymentConfig = Field(..., description="What to deploy")


class CreateDeploymentResponse(BaseModel):
    """Returned immediately after creating a deployment."""

    id: str
    status: DeploymentStatus
    created_at: datetime
    message: str = "Deployment created. Poll status or connect via WebSocket."


class DeploymentStatusResponse(BaseModel):
    """GET /api/v1/deployments/{id} — full deployment state."""

    id: str
    status: DeploymentStatus
    config: DeploymentConfig
    created_at: datetime
    updated_at: datetime
    public_ip: str
    vm_id: str
    provision_steps: list[StepProgress]
    setup_steps: list[StepProgress]
    endpoints: ServiceEndpoints
    error: str
    error_detail: str
    provider_metadata: dict[str, Any]


class DeploymentListResponse(BaseModel):
    """GET /api/v1/deployments — list all deployments."""

    deployments: list[DeploymentStatusResponse]


# ── VM Setup ─────────────────────────────────────────────────────────


class SetupVMRequest(BaseModel):
    """POST /api/v1/deployments/{id}/setup — re-run VM software setup."""

    pass  # No body needed — uses stored config + credentials


class SetupVMResponse(BaseModel):
    success: bool
    message: str


# ── Providers ────────────────────────────────────────────────────────


class ProviderInfoResponse(BaseModel):
    """GET /api/v1/providers — list available cloud providers."""

    providers: list[dict[str, Any]]


class VMSizeListResponse(BaseModel):
    """GET /api/v1/providers/{provider}/vm-sizes — list GPU VM options."""

    vm_sizes: list[dict[str, Any]]


# ── Credentials ──────────────────────────────────────────────────────


class ValidateCredentialsRequest(BaseModel):
    """POST /api/v1/providers/{provider}/validate-credentials."""

    credentials: Credentials


class ValidateCredentialsResponse(BaseModel):
    valid: bool
    message: str


# ── Services ─────────────────────────────────────────────────────────


class ServiceAccessResponse(BaseModel):
    """GET /api/v1/deployments/{id}/services — deployed service URLs."""

    deployment_id: str
    status: DeploymentStatus
    endpoints: ServiceEndpoints


# ── Validation ───────────────────────────────────────────────────────


class ValidationResponse(BaseModel):
    """POST /api/v1/deployments/{id}/validate — health check results."""

    all_passed: bool
    checks: list[dict[str, Any]]
    system_info: dict[str, str]


# ── Lifecycle actions ────────────────────────────────────────────────


class LifecycleResponse(BaseModel):
    """Generic response for start / stop / destroy actions."""

    success: bool
    status: DeploymentStatus
    message: str
    public_ip: str = ""


# ── Auto-shutdown ────────────────────────────────────────────────────


class AutoShutdownRequest(BaseModel):
    """POST /api/v1/deployments/{id}/auto-shutdown."""

    time_utc: str = Field(
        default="1800",
        description="Daily shutdown time in HHMM UTC format (e.g. '1800' = 6pm UTC)",
        pattern=r"^[0-2][0-9][0-5][0-9]$",
    )


class AutoShutdownResponse(BaseModel):
    success: bool
    message: str


# ── Errors ───────────────────────────────────────────────────────────


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: str
    detail: str = ""
