"""Deployment CRUD, lifecycle, and monitoring endpoints.

All deployment operations go through the orchestrator so the router
stays thin — just validation, serialization, and HTTP status codes.

In hosted mode, credentials are sent per-request and NEVER persisted
to disk. The server stores only deployment metadata.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status

from app.models.credentials import Credentials
from app.models.schemas import (
    AutoShutdownRequest,
    AutoShutdownResponse,
    CreateDeploymentRequest,
    CreateDeploymentResponse,
    DeleteModelResponse,
    DeploymentListResponse,
    DeploymentStatusResponse,
    DestroyDeploymentRequest,
    DestroyManagedResourcesRequest,
    DestroyManagedResourcesResponse,
    ErrorResponse,
    LifecycleResponse,
    ModelListResponse,
    PullModelRequest,
    PullModelResponse,
    SetupVMResponse,
    ValidationResponse,
)
from app.models.user import User
from app.services.orchestrator import get_orchestrator
from app.services.ws_manager import ws_manager
from app.utils.auth import get_current_user

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


def _require_owner(record, user: User) -> None:
    if record.user_id and record.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized to access this deployment")


async def _get_ws_user(websocket: WebSocket) -> User:
    """Extract and validate JWT from WebSocket query parameter."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    from app.utils.auth import jwt, SECRET_KEY, ALGORITHM, get_user_db
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token")
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_db().get_by_id(user_id)
    if user is None:
        await websocket.close(code=4001, reason="User not found")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Create ───────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=CreateDeploymentResponse,
    status_code=202,
    responses={400: {"model": ErrorResponse}},
)
async def create_deployment(
    request: CreateDeploymentRequest,
    user: User = Depends(get_current_user),
):
    """Start a new cloud deployment.

    Credentials are sent in the request body and used immediately.
    They are NOT persisted to disk in hosted mode.
    """
    orchestrator = get_orchestrator()
    record = await orchestrator.create_deployment(request.config, request.credentials, user_id=user.id)
    return CreateDeploymentResponse(
        id=record.id,
        status=record.status,
        created_at=record.created_at,
    )


# ── Read ─────────────────────────────────────────────────────────────


@router.get("", response_model=DeploymentListResponse)
async def list_deployments(user: User = Depends(get_current_user)):
    """List all deployments for the authenticated user."""
    orchestrator = get_orchestrator()
    records = orchestrator.store.list_all(user_id=user.id)
    return DeploymentListResponse(deployments=[_record_to_status(r) for r in records])


@router.get(
    "/{deployment_id}",
    response_model=DeploymentStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_deployment(deployment_id: str, user: User = Depends(get_current_user)):
    """Get full deployment status including progress steps."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    return _record_to_status(record)


@router.get(
    "/{deployment_id}/live",
    response_model=DeploymentStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_deployment_live(
    deployment_id: str,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Get deployment status with a live query to the cloud provider.

    In hosted mode, you may need to provide credentials if they are not
    cached from a previous operation.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)
    record = await orchestrator.refresh_status(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    _require_owner(record, user)
    return _record_to_status(record)


# ── Lifecycle ────────────────────────────────────────────────────────


@router.post(
    "/destroy-managed-resources",
    response_model=DestroyManagedResourcesResponse,
    responses={400: {"model": ErrorResponse}},
)
async def destroy_managed_resources(
    request: DestroyManagedResourcesRequest,
    user: User = Depends(get_current_user),
):
    """Destroy all PrivateAI-managed resource groups for a provider."""
    orchestrator = get_orchestrator()
    try:
        result = await orchestrator.destroy_managed_resources(
            request.provider,
            request.credentials,
        )
    except NotImplementedError as e:
        raise HTTPException(400, detail=str(e))
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    matched = result.get("matched_resource_groups", [])
    deleted = result.get("deleted_resource_groups", [])
    failed = result.get("failed_resource_groups", [])
    removed = result.get("removed_deployment_ids", [])
    success = len(failed) == 0
    if not matched:
        message = "No PrivateAI-managed resource groups found."
    elif success:
        message = f"Destroyed {len(deleted)} managed resource group(s)."
    else:
        message = (
            f"Destroyed {len(deleted)} managed resource group(s); "
            f"{len(failed)} failed."
        )

    return DestroyManagedResourcesResponse(
        success=success,
        provider=request.provider,
        message=message,
        matched_resource_groups=matched,
        deleted_resource_groups=deleted,
        failed_resource_groups=failed,
        removed_deployment_ids=removed,
    )


@router.post(
    "/{deployment_id}/start",
    response_model=LifecycleResponse,
    responses={404: {"model": ErrorResponse}},
)
async def start_deployment(
    deployment_id: str,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Start a stopped VM.

    In hosted mode, send credentials if they are not cached from create.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)

    ip = await orchestrator.start_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id, user_id=user.id)
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
async def stop_deployment(
    deployment_id: str,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Deallocate a running VM (stops compute billing)."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)

    success = await orchestrator.stop_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id, user_id=user.id)
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
async def set_auto_shutdown(
    deployment_id: str,
    request: AutoShutdownRequest,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Set a daily auto-shutdown schedule (cost safety)."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)

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
async def destroy_deployment(
    deployment_id: str,
    request: DestroyDeploymentRequest | None = None,
    user: User = Depends(get_current_user),
):
    """Destroy all cloud resources for this deployment.

    This permanently deletes the resource group and everything in it.
    In hosted mode, you may need to provide credentials if they are not cached.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    if request and request.credentials:
        if request.credentials.provider != record.config.provider:
            raise HTTPException(
                400,
                detail="Credential provider does not match deployment provider",
            )
        orchestrator.store.update_credentials(deployment_id, request.credentials, user_id=user.id)

    success = await orchestrator.destroy_deployment(deployment_id)
    updated = orchestrator.store.get(deployment_id, user_id=user.id)
    message = (
        "Resources destroyed"
        if success
        else (updated.error if updated and updated.error else "Destroy failed")
    )
    return LifecycleResponse(
        success=success,
        status=updated.status if updated else record.status,
        message=message,
    )


# ── Setup (re-run) ──────────────────────────────────────────────────


@router.post(
    "/{deployment_id}/setup",
    response_model=SetupVMResponse,
    responses={404: {"model": ErrorResponse}},
)
async def rerun_setup(
    deployment_id: str,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Re-run VM software setup (e.g. after a reboot for GPU drivers)."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)

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
async def validate_deployment(
    deployment_id: str,
    check_gpu: bool = False,
    credentials: Credentials | None = None,
    user: User = Depends(get_current_user),
):
    """Run health checks against the deployed VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    if credentials:
        orchestrator.store.update_credentials(deployment_id, credentials, user_id=user.id)
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
async def list_models(deployment_id: str, user: User = Depends(get_current_user)):
    """List Ollama models installed on the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
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
async def pull_model(
    deployment_id: str,
    request: PullModelRequest,
    user: User = Depends(get_current_user),
):
    """Pull (download) a new Ollama model onto the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
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
async def delete_model(
    deployment_id: str,
    model: str,
    user: User = Depends(get_current_user),
):
    """Remove an Ollama model from the VM."""
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
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
    """
    user = await _get_ws_user(websocket)
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id, user_id=user.id)
    if not record:
        await websocket.close(code=4004, reason="Deployment not found")
        return
    await ws_manager.connect(deployment_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(deployment_id, websocket)
