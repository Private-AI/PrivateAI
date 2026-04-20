"""Provider information, credential validation, and permissions setup."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ErrorResponse,
    ProviderInfoResponse,
    RecommendVMResponse,
    SetupPermissionsRequest,
    SetupPermissionsResponse,
    VMSizeListResponse,
    ValidateCredentialsRequest,
    ValidateCredentialsResponse,
)
from app.providers.registry import get_provider, list_providers
from app.services.deployment_store import get_store

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


@router.get("", response_model=ProviderInfoResponse)
async def get_providers():
    """List all available cloud providers with their regions.

    The frontend uses this to populate the provider selection dropdown.
    """
    return ProviderInfoResponse(providers=list_providers())


@router.get(
    "/{provider}/vm-sizes",
    response_model=VMSizeListResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_vm_sizes(provider: str, region: str = "eastus"):
    """List available VM sizes / GPU profiles for a provider and region.

    The frontend uses this to populate the VM size selection.
    """
    try:
        p = get_provider(provider)
    except KeyError as e:
        raise HTTPException(404, detail=str(e))
    return VMSizeListResponse(vm_sizes=p.list_vm_sizes(region))


@router.post(
    "/{provider}/validate-credentials",
    response_model=ValidateCredentialsResponse,
    responses={404: {"model": ErrorResponse}},
)
async def validate_credentials(provider: str, request: ValidateCredentialsRequest):
    """Validate cloud credentials before starting a deployment."""
    try:
        p = get_provider(provider)
    except KeyError as e:
        raise HTTPException(404, detail=str(e))

    valid, message = await p.validate_credentials(request.credentials)
    if valid:
        get_store().set_provider_credentials(provider, request.credentials)
    return ValidateCredentialsResponse(valid=valid, message=message)


@router.post(
    "/{provider}/setup-permissions",
    response_model=SetupPermissionsResponse,
    responses={404: {"model": ErrorResponse}},
)
async def setup_permissions(provider: str, request: SetupPermissionsRequest):
    """Register required cloud provider resource namespaces / APIs.

    For Azure this registers Microsoft.Network, Microsoft.Compute, and
    Microsoft.Storage so the user doesn't have to do it manually before
    their first deployment.
    """
    try:
        p = get_provider(provider)
    except KeyError as e:
        raise HTTPException(404, detail=str(e))

    if not hasattr(p, "setup_permissions"):
        raise HTTPException(400, detail=f"Provider '{provider}' does not support setup_permissions")

    result = await p.setup_permissions(request.credentials)  # type: ignore[attr-defined]
    get_store().set_provider_credentials(provider, request.credentials)
    return SetupPermissionsResponse(**result)


@router.get(
    "/{provider}/recommend-vm",
    response_model=RecommendVMResponse,
    responses={404: {"model": ErrorResponse}},
)
async def recommend_vm(provider: str, model: str = "llama3:8b"):
    """Return the cheapest VM profile that can comfortably run ``model``.

    The frontend calls this when the user selects a model in the wizard
    to auto-select the right VM size.
    """
    if provider != "azure":
        raise HTTPException(404, detail="VM recommendation only supported for azure")

    from app.providers.azure.config import AZURE_VM_PROFILES, recommend_vm_for_model

    vm_id = recommend_vm_for_model(model)
    profile = next((p for p in AZURE_VM_PROFILES if p.id == vm_id), None)
    reason = (
        f"{profile.display_name} — {profile.description}"
        if profile
        else f"Recommended profile: {vm_id}"
    )
    return RecommendVMResponse(vm_profile_id=vm_id, reason=reason)
