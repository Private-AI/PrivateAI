"""Service access endpoints — URLs for Ollama, Open WebUI, SSH."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import ErrorResponse, ServiceAccessResponse
from app.services.orchestrator import get_orchestrator

router = APIRouter(prefix="/api/v1/deployments", tags=["services"])


@router.get(
    "/{deployment_id}/services",
    response_model=ServiceAccessResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_services(deployment_id: str):
    """Get access URLs for deployed services (Ollama, Open WebUI, SSH).

    The frontend uses this to render clickable links / embedded iframes
    for the deployed applications.
    """
    orchestrator = get_orchestrator()
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")

    return ServiceAccessResponse(
        deployment_id=record.id,
        status=record.status,
        endpoints=record.endpoints,
    )
