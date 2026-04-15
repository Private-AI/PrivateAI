"""Cost monitoring models — budget, tracking, and alert data structures.

These models support the cost-monitoring system that tracks per-deployment
and global spending, enforces budget limits, and triggers automatic
shutdowns when thresholds are exceeded.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────


class BudgetAction(StrEnum):
    """What happens when a budget threshold is breached."""

    ALERT = "alert"  # WebSocket notification only
    STOP = "stop"  # Stop (deallocate) the VM
    DESTROY = "destroy"  # Destroy all resources


class CostAlertLevel(StrEnum):
    """Severity level for cost alerts."""

    INFO = "info"  # Informational (e.g. 50% spent)
    WARNING = "warning"  # Approaching limit (e.g. 80% spent)
    CRITICAL = "critical"  # At or over limit — action taken


# ── Budget configuration ─────────────────────────────────────────────


class BudgetThreshold(BaseModel):
    """A single threshold within a budget (e.g. warn at 80%, stop at 100%)."""

    percent: float = Field(
        ...,
        ge=0,
        le=200,
        description="Percentage of budget that triggers this threshold",
    )
    action: BudgetAction = Field(
        ...,
        description="Action to take when threshold is reached",
    )
    triggered: bool = Field(
        default=False,
        description="Whether this threshold has already fired",
    )
    triggered_at: datetime | None = Field(
        default=None,
        description="When the threshold was triggered",
    )


class BudgetConfig(BaseModel):
    """Budget limits set by the user.

    Can be set globally (all deployments) or per-deployment.
    """

    max_total_spend_usd: float = Field(
        default=0.0,
        ge=0,
        description="Maximum total spend in USD. 0 = unlimited.",
    )
    max_per_deployment_spend_usd: float = Field(
        default=0.0,
        ge=0,
        description="Maximum spend per deployment in USD. 0 = unlimited.",
    )
    max_hourly_rate_usd: float = Field(
        default=0.0,
        ge=0,
        description="Maximum hourly burn rate in USD. 0 = unlimited.",
    )
    thresholds: list[BudgetThreshold] = Field(
        default_factory=lambda: [
            BudgetThreshold(percent=50.0, action=BudgetAction.ALERT),
            BudgetThreshold(percent=80.0, action=BudgetAction.ALERT),
            BudgetThreshold(percent=100.0, action=BudgetAction.STOP),
        ],
        description="Ordered thresholds that trigger alerts/actions",
    )
    enabled: bool = Field(
        default=True,
        description="Whether cost monitoring is active",
    )


# ── Cost tracking records ────────────────────────────────────────────


class DeploymentCostRecord(BaseModel):
    """Running cost state for a single deployment."""

    deployment_id: str
    vm_size: str = ""
    cost_per_hour: float = 0.0
    accrued_cost_usd: float = 0.0
    is_running: bool = False
    started_at: datetime | None = None  # When the VM started (for billing)
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    # Per-deployment budget override (0 = use global)
    per_deployment_limit_usd: float = 0.0

    def update_accrued_cost(self) -> float:
        """Recalculate accrued cost based on elapsed time since start."""
        if not self.is_running or not self.started_at:
            return self.accrued_cost_usd

        now = datetime.now(timezone.utc)
        elapsed_hours = (now - self.last_updated).total_seconds() / 3600.0
        increment = elapsed_hours * self.cost_per_hour
        self.accrued_cost_usd += increment
        self.last_updated = now
        return self.accrued_cost_usd


# ── Cost alerts ──────────────────────────────────────────────────────


class CostAlert(BaseModel):
    """An alert generated when a cost threshold is breached."""

    id: str = ""
    level: CostAlertLevel
    deployment_id: str = ""  # Empty for global alerts
    message: str
    threshold_percent: float = 0.0
    current_spend_usd: float = 0.0
    budget_limit_usd: float = 0.0
    action_taken: BudgetAction = BudgetAction.ALERT
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    acknowledged: bool = False


# ── API response models ──────────────────────────────────────────────


class CostReportDeployment(BaseModel):
    """Cost summary for a single deployment."""

    deployment_id: str
    vm_name: str = ""
    vm_size: str = ""
    cost_per_hour: float = 0.0
    accrued_cost_usd: float = 0.0
    is_running: bool = False
    started_at: str | None = None
    per_deployment_limit_usd: float = 0.0


class CostReport(BaseModel):
    """Full cost report across all deployments."""

    total_accrued_usd: float = 0.0
    total_hourly_rate_usd: float = 0.0
    budget: BudgetConfig = Field(default_factory=BudgetConfig)
    deployments: list[CostReportDeployment] = Field(default_factory=list)
    alerts: list[CostAlert] = Field(default_factory=list)
    budget_remaining_usd: float | None = None  # None if no budget set
    estimated_hours_remaining: float | None = None
    percent_used: float = 0.0
