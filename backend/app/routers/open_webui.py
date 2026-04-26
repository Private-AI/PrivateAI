"""Open WebUI local management endpoints.

Provides endpoints for:
  - Checking Open WebUI status and health
  - Starting / stopping the local Open WebUI process
  - Updating configuration (Ollama URL, port, etc.) with automatic restart
  - Reading current configuration
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.open_webui import OpenWebuiEnvConfig
from app.models.schemas import (
    ErrorResponse,
    OpenWebuiConfigUpdateRequest,
    OpenWebuiConfigUpdateResponse,
    OpenWebuiStartRequest,
    OpenWebuiStartResponse,
    OpenWebuiStatusResponse,
    OpenWebuiStopResponse,
)
from app.services.open_webui_manager import get_open_webui_manager

router = APIRouter(prefix="/api/v1/open-webui", tags=["open-webui"])


# ── Status ───────────────────────────────────────────────────────────


@router.get("/status", response_model=OpenWebuiStatusResponse)
async def get_status():
    """Get the current state of the local Open WebUI instance."""
    manager = get_open_webui_manager()
    return OpenWebuiStatusResponse(state=manager.get_state())


@router.get("/health")
async def health_check():
    """Quick health check — is Open WebUI responding?"""
    manager = get_open_webui_manager()
    healthy = await manager.health_check()
    state = manager.get_state()
    return {
        "healthy": healthy,
        "status": state.status,
        "url": state.url,
    }


# ── Lifecycle ────────────────────────────────────────────────────────


@router.post(
    "/start",
    response_model=OpenWebuiStartResponse,
    responses={500: {"model": ErrorResponse}},
)
async def start_open_webui(request: OpenWebuiStartRequest | None = None):
    """Start the local Open WebUI process.

    Optionally pass a config override to change Ollama URL, port, etc.
    If Open WebUI is already running, returns the current state.
    """
    manager = get_open_webui_manager()
    config = request.config if request else None
    state = await manager.start(config)
    return OpenWebuiStartResponse(
        success=state.status == "running",
        message=(
            f"Open WebUI running at {state.url}"
            if state.status == "running"
            else f"Failed to start: {state.error}"
        ),
        state=state,
    )


@router.post(
    "/stop",
    response_model=OpenWebuiStopResponse,
)
async def stop_open_webui():
    """Stop the local Open WebUI process."""
    manager = get_open_webui_manager()
    await manager.stop()
    return OpenWebuiStopResponse(
        success=True,
        message="Open WebUI stopped",
    )


@router.post(
    "/restart",
    response_model=OpenWebuiStartResponse,
)
async def restart_open_webui(request: OpenWebuiStartRequest | None = None):
    """Restart Open WebUI, optionally with new configuration."""
    manager = get_open_webui_manager()
    config = request.config if request else None
    state = await manager.restart(config)
    return OpenWebuiStartResponse(
        success=state.status == "running",
        message=(
            f"Open WebUI restarted at {state.url}"
            if state.status == "running"
            else f"Failed to restart: {state.error}"
        ),
        state=state,
    )


# ── Connect to deployment ─────────────────────────────────────────────


class ConnectDeploymentRequest(BaseModel):
    """POST /api/v1/open-webui/connect — connect to a deployment's Ollama."""

    deployment_id: str = Field(..., description="Deployment ID")
    deployment_name: str = Field(default="", description="Display name")


@router.post(
    "/connect",
    response_model=OpenWebuiStartResponse,
    responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
)
async def connect_to_deployment(request: ConnectDeploymentRequest):
    """Connect Open WebUI to a deployment's Ollama server via SSH tunnel.

    The VM IP is read from the deployment record — never sent from the
    frontend — so no plaintext Ollama URL crosses the wire.
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
            f"Open WebUI connected to {request.deployment_name} (via SSH tunnel)"
            if state.status == "running"
            else f"Failed to connect: {state.error}"
        ),
        state=state,
    )


# ── Auth token ───────────────────────────────────────────────────────


@router.get("/token")
async def get_auth_token():
    """Return a short-lived JWT for Open WebUI API access.

    The backend acquires the token from Open WebUI directly (localhost)
    so the browser never has to deal with CORS on the auth endpoints.
    """
    import httpx

    manager = get_open_webui_manager()
    state = manager.get_state()
    if state.status != "running":
        raise HTTPException(503, detail="Open WebUI is not running")

    port = state.config.port
    email = "privateai@local"
    password = "privateai-local-only-2024"

    async with httpx.AsyncClient() as client:
        # Try signup first (creates admin on fresh instance)
        try:
            r = await client.post(
                f"http://localhost:{port}/api/v1/auths/signup",
                json={"name": "PrivateAI", "email": email, "password": password},
                timeout=10,
            )
            if r.status_code == 200:
                token = r.json().get("token")
                if token:
                    return {"token": token}
        except Exception:
            pass

        # Signup failed (user exists or disabled) — try signin
        try:
            r = await client.post(
                f"http://localhost:{port}/api/v1/auths/signin",
                json={"email": email, "password": password},
                timeout=10,
            )
            if r.status_code == 200:
                token = r.json().get("token")
                if token:
                    return {"token": token}
        except Exception:
            pass

    raise HTTPException(502, detail="Could not acquire Open WebUI token")


# ── Configuration ────────────────────────────────────────────────────


@router.get("/config")
async def get_config():
    """Get current Open WebUI environment configuration."""
    manager = get_open_webui_manager()
    config = manager.get_config()
    return {"config": config}


@router.put(
    "/config",
    response_model=OpenWebuiConfigUpdateResponse,
)
async def update_config(request: OpenWebuiConfigUpdateRequest):
    """Update Open WebUI configuration.

    If Open WebUI is currently running, it will be restarted
    automatically with the new settings.
    """
    manager = get_open_webui_manager()
    state = manager.get_state()
    was_running = state.status == "running"

    manager.set_config(request.config)

    restarted = False
    if was_running:
        await manager.restart(request.config)
        restarted = True

    return OpenWebuiConfigUpdateResponse(
        success=True,
        message=(
            "Configuration updated and Open WebUI restarted"
            if restarted
            else "Configuration updated"
        ),
        config=request.config,
        restarted=restarted,
    )
