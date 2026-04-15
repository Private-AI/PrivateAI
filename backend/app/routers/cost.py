"""Cost monitoring and budget management endpoints.

Provides endpoints for:
  - Setting and retrieving global/per-deployment budgets
  - Fetching cost reports with per-deployment breakdowns
  - Viewing and acknowledging cost alerts
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AcknowledgeAlertResponse,
    CostAlertsResponse,
    CostReportResponse,
    ErrorResponse,
    SetBudgetRequest,
    SetBudgetResponse,
    SetDeploymentBudgetRequest,
    SetDeploymentBudgetResponse,
)
from app.services.cost_monitor import get_cost_monitor

router = APIRouter(prefix="/api/v1/cost", tags=["cost"])


# ── Budget management ────────────────────────────────────────────────


@router.get("/budget", response_model=SetBudgetResponse)
async def get_budget():
    """Get the current global budget configuration."""
    monitor = get_cost_monitor()
    budget = monitor.get_budget()
    return SetBudgetResponse(
        success=True,
        message="Current budget configuration",
        budget=budget,
    )


@router.post(
    "/budget",
    response_model=SetBudgetResponse,
    responses={400: {"model": ErrorResponse}},
)
async def set_budget(request: SetBudgetRequest):
    """Set global budget limits.

    When the total spend across all deployments reaches a threshold,
    the configured action (alert, stop, or destroy) is taken
    automatically.
    """
    monitor = get_cost_monitor()
    monitor.set_budget(request.budget)
    return SetBudgetResponse(
        success=True,
        message="Budget updated successfully",
        budget=request.budget,
    )


# ── Per-deployment budget ────────────────────────────────────────────


@router.post(
    "/deployments/{deployment_id}/budget",
    response_model=SetDeploymentBudgetResponse,
    responses={404: {"model": ErrorResponse}},
)
async def set_deployment_budget(
    deployment_id: str,
    request: SetDeploymentBudgetRequest,
):
    """Set a spending limit for a specific deployment.

    Overrides the global per-deployment limit for this deployment.
    Set to 0 to revert to the global limit.
    """
    monitor = get_cost_monitor()
    success = monitor.set_deployment_budget(deployment_id, request.max_spend_usd)
    if not success:
        raise HTTPException(404, detail="Deployment not found in cost tracker")
    return SetDeploymentBudgetResponse(
        success=True,
        message=f"Per-deployment budget set to ${request.max_spend_usd:.2f}",
        deployment_id=deployment_id,
        max_spend_usd=request.max_spend_usd,
    )


# ── Cost report ──────────────────────────────────────────────────────


@router.get("/report", response_model=CostReportResponse)
async def get_cost_report():
    """Get a full cost report with per-deployment breakdown.

    Includes:
      - Total accrued spend across all deployments
      - Current hourly burn rate
      - Budget status (remaining, percent used)
      - Per-deployment cost details
      - Recent alerts
    """
    monitor = get_cost_monitor()
    report = monitor.get_cost_report()
    return CostReportResponse(report=report)


# ── Alerts ───────────────────────────────────────────────────────────


@router.get("/alerts", response_model=CostAlertsResponse)
async def get_cost_alerts():
    """Get recent cost alerts (last 50)."""
    monitor = get_cost_monitor()
    alerts = monitor.get_alerts()
    return CostAlertsResponse(alerts=alerts)


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=AcknowledgeAlertResponse,
    responses={404: {"model": ErrorResponse}},
)
async def acknowledge_alert(alert_id: str):
    """Acknowledge a cost alert."""
    monitor = get_cost_monitor()
    success = monitor.acknowledge_alert(alert_id)
    if not success:
        raise HTTPException(404, detail="Alert not found")
    return AcknowledgeAlertResponse(
        success=True,
        message="Alert acknowledged",
    )
