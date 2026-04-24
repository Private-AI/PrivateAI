"""API request / response schemas.

These are the Pydantic models that FastAPI uses for automatic
validation, serialization, and OpenAPI doc generation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.credentials import Credentials
from app.models.cost import BudgetConfig, CostAlert, CostReport
from app.models.open_webui import OpenWebuiEnvConfig, OpenWebuiState
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


class AccessibleVMSizeRequest(BaseModel):
    """POST /api/v1/providers/{provider}/accessible-vm-sizes."""

    region: str
    credentials: Credentials


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


class DestroyDeploymentRequest(BaseModel):
    """DELETE /api/v1/deployments/{id}.

    Allows the caller to replace stale stored credentials before teardown.
    """

    credentials: Credentials | None = None


class DestroyManagedResourcesRequest(BaseModel):
    """POST /api/v1/deployments/destroy-managed-resources."""

    provider: CloudProvider = CloudProvider.AZURE
    credentials: Credentials | None = None


class DestroyManagedResourcesResponse(BaseModel):
    success: bool
    provider: CloudProvider
    message: str
    matched_resource_groups: list[str]
    deleted_resource_groups: list[str]
    failed_resource_groups: list[str]
    removed_deployment_ids: list[str]


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


# ── Cost monitoring ──────────────────────────────────────────────────


class SetBudgetRequest(BaseModel):
    """POST /api/v1/cost/budget — set global budget limits."""

    budget: BudgetConfig


class SetBudgetResponse(BaseModel):
    success: bool
    message: str
    budget: BudgetConfig


class SetDeploymentBudgetRequest(BaseModel):
    """POST /api/v1/cost/deployments/{id}/budget — set per-deployment limit."""

    max_spend_usd: float = Field(
        ...,
        ge=0,
        description="Max spend for this deployment. 0 = use global.",
    )


class SetDeploymentBudgetResponse(BaseModel):
    success: bool
    message: str
    deployment_id: str
    max_spend_usd: float


class CostReportResponse(BaseModel):
    """GET /api/v1/cost/report — full cost report."""

    report: CostReport


class CostAlertsResponse(BaseModel):
    """GET /api/v1/cost/alerts — recent cost alerts."""

    alerts: list[CostAlert]


class AcknowledgeAlertResponse(BaseModel):
    success: bool
    message: str


# ── Open WebUI management ────────────────────────────────────────────


class OpenWebuiStatusResponse(BaseModel):
    """GET /api/v1/open-webui/status — current state."""

    state: OpenWebuiState


class OpenWebuiStartRequest(BaseModel):
    """POST /api/v1/open-webui/start — start with optional config override."""

    config: OpenWebuiEnvConfig | None = None


class OpenWebuiStartResponse(BaseModel):
    success: bool
    message: str
    state: OpenWebuiState


class OpenWebuiStopResponse(BaseModel):
    success: bool
    message: str


class OpenWebuiConfigUpdateRequest(BaseModel):
    """PUT /api/v1/open-webui/config — update env vars (triggers restart)."""

    config: OpenWebuiEnvConfig


class OpenWebuiConfigUpdateResponse(BaseModel):
    success: bool
    message: str
    config: OpenWebuiEnvConfig
    restarted: bool


# ── Model management ─────────────────────────────────────────────────


class ModelInfo(BaseModel):
    """Single Ollama model entry as returned by /api/tags."""

    name: str
    size: int = 0
    digest: str = ""
    modified_at: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class ModelListResponse(BaseModel):
    """GET /api/v1/deployments/{id}/models — list installed models."""

    models: list[ModelInfo]


class PullModelRequest(BaseModel):
    """POST /api/v1/deployments/{id}/models — pull a model."""

    model: str = Field(..., description="Ollama model tag, e.g. 'llama3:8b'")


class PullModelResponse(BaseModel):
    success: bool
    model: str
    message: str = ""


class DeleteModelResponse(BaseModel):
    success: bool
    model: str
    message: str = ""


# ── Permissions setup ────────────────────────────────────────────────


class SetupPermissionsRequest(BaseModel):
    """POST /api/v1/providers/{provider}/setup-permissions."""

    credentials: Credentials


class SetupPermissionsResponse(BaseModel):
    success: bool
    message: str
    providers: dict[str, str] = Field(default_factory=dict)


# ── VM recommendation ────────────────────────────────────────────────


class RecommendVMResponse(BaseModel):
    """GET /api/v1/providers/{provider}/recommend-vm?model=llama3:8b"""

    vm_profile_id: str
    reason: str


# ── Azure CLI device-code authentication ─────────────────────────────


class AzureCliLoginStartResponse(BaseModel):
    """POST /api/v1/azure/cli/login/start — kick off device-code login."""

    session_id: str = Field(..., description="Opaque session handle — reuse for subsequent calls")
    verification_url: str = Field(
        ...,
        description="URL the user opens in their browser",
    )
    user_code: str = Field(..., description="Code the user enters at verification_url")
    message: str = Field(
        default="",
        description="Raw human-readable prompt emitted by the Azure CLI",
    )


class AzureCliLoginStatusResponse(BaseModel):
    """GET /api/v1/azure/cli/login/status — poll until authenticated."""

    session_id: str
    status: str = Field(
        ...,
        description="pending | authenticated | failed | provisioned | expired",
    )
    subscription_id: str = ""
    subscription_name: str = ""
    tenant_id: str = ""
    user_name: str = ""
    error: str = ""


class AzureCliProvisionRequest(BaseModel):
    """POST /api/v1/azure/cli/provision — create the Service Principal."""

    session_id: str = Field(..., description="Session id returned by /login/start")
    name: str = Field(
        default="PrivateAI-Provisioner",
        description="Display name for the App Registration / Service Principal",
        min_length=1,
        max_length=128,
    )
    role: str = Field(
        default="Contributor",
        description="RBAC role to grant on the current subscription",
    )


class AzureCliProvisionResponse(BaseModel):
    """Ready-to-use AzureCredentials returned after SP creation."""

    session_id: str
    status: str = "provisioned"
    client_id: str
    client_secret: str
    tenant_id: str
    subscription_id: str
    display_name: str


class AzureCliCancelResponse(BaseModel):
    """POST /api/v1/azure/cli/login/cancel — abort an in-flight login."""

    session_id: str
    cancelled: bool
    message: str = ""


# ── Errors ───────────────────────────────────────────────────────────


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: str
    detail: str = ""
