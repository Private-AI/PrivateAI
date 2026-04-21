"""Open WebUI management endpoints (hosted demo mode).

In hosted mode, Open WebUI runs as an external service (Docker Compose).
The backend only health-checks and proxies status — it does NOT spawn
or manage the Open WebUI process.

Users access Open WebUI directly at the configured URL.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.schemas import (
    ErrorResponse,
    OpenWebuiStartResponse,
    OpenWebuiStatusResponse,
)
from app.services.open_webui_manager import get_open_webui_manager

router = APIRouter(prefix="/api/v1/open-webui", tags=["open-webui"])

OPEN_WEBUI_URL = os.environ.get("OPEN_WEBUI_URL", "http://localhost:8080")


class OpenWebuiInfoResponse(BaseModel):
    """GET /api/v1/open-webui/info — where to find Open WebUI."""

    url: str
    status: str
    message: str


# ── Status ───────────────────────────────────────────────────────────


@router.get("/status", response_model=OpenWebuiStatusResponse)
async def get_status():
    """Get the current state of the external Open WebUI instance."""
    manager = get_open_webui_manager()
    return OpenWebuiStatusResponse(state=manager.get_state())


@router.get("/health")
async def health_check():
    """Quick health check — is the external Open WebUI responding?"""
    manager = get_open_webui_manager()
    healthy = await manager.health_check()
    state = manager.get_state()
    return {
        "healthy": healthy,
        "status": state.status,
        "url": state.url,
    }


@router.get("/info", response_model=OpenWebuiInfoResponse)
async def get_info():
    """Return the public URL where users can access Open WebUI.

    In hosted mode, Open WebUI is served externally (e.g. via Nginx
    at /open-webui or on a subdomain). This endpoint tells the frontend
    where to redirect the user.
    """
    manager = get_open_webui_manager()
    healthy = await manager.health_check()
    return OpenWebuiInfoResponse(
        url=OPEN_WEBUI_URL,
        status="running" if healthy else "unhealthy",
        message="Open WebUI is available at the provided URL"
        if healthy
        else "Open WebUI is not responding",
    )


# ── Connect to deployment ──────────────────────────────────────────────────


class ConnectDeploymentRequest(BaseModel):
    """POST /api/v1/open-webui/connect — configure Open WebUI for a deployment."""

    deployment_id: str = Field(..., description="Deployment ID")
    deployment_name: str = Field(default="", description="Display name")


@router.post(
    "/connect",
    response_model=OpenWebuiStartResponse,
    responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
)
async def connect_to_deployment(request: ConnectDeploymentRequest):
    """Configure the external Open WebUI to use a deployment's Ollama.

    In hosted mode, this updates the external Open WebUI's configuration
    via its API instead of spawning a local process.
    """
    from app.services.orchestrator import get_orchestrator

    record = get_orchestrator().store.get(request.deployment_id)
    if not record or not record.public_ip:
        raise HTTPException(400, detail="Deployment not found or has no public IP")

    ssh_key_path = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
    vm_user = record.provider_metadata.get("vm_user", "azureuser")
    ollama_url = f"http://{record.public_ip}:11434"

    manager = get_open_webui_manager()
    try:
        state = await manager.connect_to_deployment(
            deployment_id=request.deployment_id,
            deployment_name=request.deployment_name,
            ollama_url=ollama_url,
            ssh_key_path=ssh_key_path,
            vm_user=vm_user,
        )
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e)) from e

    return OpenWebuiStartResponse(
        success=state.status == "running",
        message=(
            f"Open WebUI connected to {request.deployment_name}"
            if state.status == "running"
            else f"Failed to connect: {state.error}"
        ),
        state=state,
    )
