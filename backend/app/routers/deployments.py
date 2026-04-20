"""Deployment CRUD, lifecycle, and monitoring endpoints.

All deployment operations go through the orchestrator so the router
stays thin — just validation, serialization, and HTTP status codes.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.models.schemas import (
    AutoShutdownRequest,
    AutoShutdownResponse,
    CreateDeploymentRequest,
    CreateDeploymentResponse,
    DeleteModelResponse,
    DeploymentListResponse,
    DeploymentStatusResponse,
    ErrorResponse,
    LifecycleResponse,
    ModelListResponse,
    PullModelRequest,
    PullModelResponse,
    SetupVMResponse,
    ValidationResponse,
)
from app.services.orchestrator import get_orchestrator
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/api/v1/deployments", tags=["deployments"])


def _record_to_status(record) -> DeploymentStatusResponse:  # type: ignore[no-untyped-def]
    return DeploymentStatusResponse(
        id=record.id,
        status=record.status,
        config=record.config,
        created_at=record.created_at,
        updated_at=record.updated_at,
        public_ip=record.public_ip,
        vm_id=record.vm_id,
        provision_steps=record.provision_steps,
        setup_steps=record.setup_steps,
        endpoints=record.endpoints,
        error=record.error,
        error_detail=record.error_detail,
        provider_metadata=record.provider_metadata,
    )


# ── Create ───────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=CreateDeploymentResponse,
    status_code=202,
    responses={400: {"model": ErrorResponse}},
)
async def create_deployment(request: CreateDeploymentRequest):
    """Start a new cloud deployment.

    Accepts the full configuration and credentials in a single JSON
    payload.  Returns immediately with a deployment ID — provisioning
    runs in the background.

    Monitor progress via:
      - ``GET /api/v1/deployments/{id}`` (polling)
      - ``WS /api/v1/deployments/{id}/ws`` (real-time)
    """
    orchestrator = get_orchestrator()
    record = await orchestrator.create_deployment(request.config, request.credentials)
    return CreateDeploymentResponse(
        id=record.id,
        status=record.status,
        created_at=record.created_at,
    )


# ── Read ─────────────────────────────────────────────────────────────


@router.get("", response_model=DeploymentListResponse)
async def list_deployments():
    """List all deployments."""
    orchestrator = get_orchestrator()
    records = orchestrator.store.list_all()
    return DeploymentListResponse(deployments=[_record_to_status(r) for r in records])


@router.get(
    "/{deployment_id}",
    response_model=DeploymentStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_deployment(deployment_id: str):
    """Get full deployment status including progress steps."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    return _record_to_status(record)


@router.get(
    "/{deployment_id}/live",
    response_model=DeploymentStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_deployment_live(deployment_id: str):
    """Get deployment status with a live query to the cloud provider.

    This is more expensive than the cached ``GET /{id}`` — use it
    when you need the real-time VM power state.
    """
    orchestrator = get_orchestrator()
    record = await orchestrator.refresh_status(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    return _record_to_status(record)


# ── Lifecycle ────────────────────────────────────────────────────────


@router.post(
    "/{deployment_id}/start",
    response_model=LifecycleResponse,
    responses={404: {"model": ErrorResponse}},
)
async def start_deployment(deployment_id: str):
    """Start a stopped VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    ip = await orchestrator.start_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id)
    return LifecycleResponse(
        success=ip is not None,
        status=updated.status if updated else record.status,
        message=f"VM started at {ip}" if ip else "Failed to start VM",
        public_ip=ip or "",
    )


@router.post(
    "/{deployment_id}/stop",
    response_model=LifecycleResponse,
    responses={404: {"model": ErrorResponse}},
)
async def stop_deployment(deployment_id: str):
    """Deallocate a running VM (stops compute billing)."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    success = await orchestrator.stop_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id)
    return LifecycleResponse(
        success=success,
        status=updated.status if updated else record.status,
        message="VM deallocated" if success else "Failed to stop VM",
    )


@router.post(
    "/{deployment_id}/auto-shutdown",
    response_model=AutoShutdownResponse,
    responses={404: {"model": ErrorResponse}},
)
async def set_auto_shutdown(deployment_id: str, request: AutoShutdownRequest):
    """Set a daily auto-shutdown schedule (cost safety).

    The VM will automatically shut down every day at the specified UTC time.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    success = await orchestrator.set_auto_shutdown(deployment_id, request.time_utc)
    return AutoShutdownResponse(
        success=success,
        message=f"Auto-shutdown set to {request.time_utc} UTC daily"
        if success
        else "Failed to set auto-shutdown",
    )


@router.delete(
    "/{deployment_id}",
    response_model=LifecycleResponse,
    responses={404: {"model": ErrorResponse}},
)
async def destroy_deployment(deployment_id: str):
    """Destroy all cloud resources for this deployment.

    This permanently deletes the resource group and everything in it.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    success = await orchestrator.destroy_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id)
    return LifecycleResponse(
        success=success,
        status=updated.status if updated else record.status,
        message="Resources destroyed" if success else "Destroy failed",
    )


# ── Setup (re-run) ──────────────────────────────────────────────────


@router.post(
    "/{deployment_id}/setup",
    response_model=SetupVMResponse,
    responses={404: {"model": ErrorResponse}},
)
async def rerun_setup(deployment_id: str):
    """Re-run VM software setup (e.g. after a reboot for GPU drivers)."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    success = await orchestrator.setup_deployment(deployment_id)
    return SetupVMResponse(
        success=success,
        message="Setup complete"
        if success
        else "Setup failed — check deployment status",
    )


# ── Validation ───────────────────────────────────────────────────────


@router.post(
    "/{deployment_id}/validate",
    response_model=ValidationResponse,
    responses={404: {"model": ErrorResponse}},
)
async def validate_deployment(deployment_id: str, check_gpu: bool = False):
    """Run health checks against the deployed VM."""
    orchestrator = get_orchestrator()
    result = await orchestrator.validate_deployment(deployment_id, check_gpu)
    if "error" in result:
        raise HTTPException(404, detail=result["error"])
    return ValidationResponse(**result)


# ── Model management ─────────────────────────────────────────────────


@router.get(
    "/{deployment_id}/models",
    response_model=ModelListResponse,
    responses={404: {"model": ErrorResponse}},
)
async def list_models(deployment_id: str):
    """List Ollama models installed on the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record or not record.public_ip:
        raise HTTPException(404, detail="Deployment not found or no IP assigned")

    ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
    from app.providers.registry import get_provider
    from app.models.schemas import ModelInfo

    provider = get_provider(record.config.provider)
    if not hasattr(provider, "list_models"):
        raise HTTPException(400, detail="Provider does not support model management")

    try:
        models_raw = await provider.list_models(  # type: ignore[attr-defined]
            record.config, record.public_ip, ssh_key
        )
        models = [ModelInfo(**m) if isinstance(m, dict) else ModelInfo(name=str(m)) for m in models_raw]
        return ModelListResponse(models=models)
    except Exception as e:
        raise HTTPException(502, detail=str(e))


@router.post(
    "/{deployment_id}/models",
    response_model=PullModelResponse,
    responses={404: {"model": ErrorResponse}},
)
async def pull_model(deployment_id: str, request: PullModelRequest):
    """Pull (download) a new Ollama model onto the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record or not record.public_ip:
        raise HTTPException(404, detail="Deployment not found or no IP assigned")

    ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
    from app.providers.registry import get_provider

    provider = get_provider(record.config.provider)
    if not hasattr(provider, "pull_model"):
        raise HTTPException(400, detail="Provider does not support model management")

    try:
        result = await provider.pull_model(  # type: ignore[attr-defined]
            record.config, record.public_ip, ssh_key, request.model
        )
        return PullModelResponse(
            success=result.get("success", False),
            model=request.model,
            message=result.get("error", "") if not result.get("success") else "Model pulled successfully",
        )
    except Exception as e:
        raise HTTPException(502, detail=str(e))


@router.delete(
    "/{deployment_id}/models/{model:path}",
    response_model=DeleteModelResponse,
    responses={404: {"model": ErrorResponse}},
)
async def delete_model(deployment_id: str, model: str):
    """Remove an Ollama model from the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record or not record.public_ip:
        raise HTTPException(404, detail="Deployment not found or no IP assigned")

    ssh_key = record.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
    from app.providers.registry import get_provider

    provider = get_provider(record.config.provider)
    if not hasattr(provider, "delete_model"):
        raise HTTPException(400, detail="Provider does not support model management")

    try:
        result = await provider.delete_model(  # type: ignore[attr-defined]
            record.config, record.public_ip, ssh_key, model
        )
        return DeleteModelResponse(
            success=result.get("success", False),
            model=model,
            message=result.get("error", "") if not result.get("success") else "Model deleted",
        )
    except Exception as e:
        raise HTTPException(502, detail=str(e))


# ── WebSocket ────────────────────────────────────────────────────────


@router.websocket("/{deployment_id}/ws")
async def deployment_ws(websocket: WebSocket, deployment_id: str):
    """Real-time deployment progress via WebSocket.

    Connect to this endpoint after creating a deployment to receive
    live status updates, progress steps, and error notifications.

    Message format:
    ```json
    {
        "type": "provision_progress" | "setup_progress" | "status_change" | ...,
        "step": "...",
        "current": 1,
        "total": 7,
        "message": "..."
    }
    ```
    """
    await ws_manager.connect(deployment_id, websocket)
    try:
        while True:
            # Keep connection alive; client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(deployment_id, websocket)
