"""Provider information and credential validation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ErrorResponse,
    ProviderInfoResponse,
    VMSizeListResponse,
    ValidateCredentialsRequest,
    ValidateCredentialsResponse,
)
from app.providers.registry import get_provider, list_providers

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
    """Validate cloud credentials before starting a deployment.

    The frontend calls this when the user provides their credentials
    to give immediate feedback on whether they are valid.
    """
    try:
        p = get_provider(provider)
    except KeyError as e:
        raise HTTPException(404, detail=str(e))

    valid, message = await p.validate_credentials(request.credentials)
    return ValidateCredentialsResponse(valid=valid, message=message)
