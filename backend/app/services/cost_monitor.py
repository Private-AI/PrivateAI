"""Cost monitoring service — tracks spending and enforces budget limits.

Runs a background asyncio loop that:
  1. Recalculates accrued cost for every running deployment each tick
  2. Checks global and per-deployment budgets against thresholds
  3. Fires alerts via WebSocket and triggers auto-shutdown when limits
     are exceeded

The monitor is started once at app startup and provides methods
that the orchestrator calls when deployments start/stop.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from app.models.cost import (
    BudgetAction,
    BudgetConfig,
    CostAlert,
    CostAlertLevel,
    CostReport,
    CostReportDeployment,
    DeploymentCostRecord,
)
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

# How often the background loop ticks (seconds)
MONITOR_TICK_INTERVAL = 30


class CostMonitor:
    """Singleton service that tracks costs and enforces budgets."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._budget = BudgetConfig()
        self._deployment_costs: dict[str, DeploymentCostRecord] = {}
        self._alerts: list[CostAlert] = []
        self._running = False
        self._task: asyncio.Task[None] | None = None
        # Store a reference to the orchestrator lazily (avoids circular import)
        self._orchestrator: Any = None

    # ── Budget management ────────────────────────────────────

    def get_budget(self) -> BudgetConfig:
        with self._lock:
            return self._budget.model_copy()

    def set_budget(self, budget: BudgetConfig) -> None:
        with self._lock:
            self._budget = budget
            # Reset threshold triggers if budget changed
            for t in self._budget.thresholds:
                t.triggered = False
                t.triggered_at = None
        logger.info(
            "Budget updated: max_total=$%.2f, max_per_deploy=$%.2f",
            budget.max_total_spend_usd,
            budget.max_per_deployment_spend_usd,
        )

    # ── Deployment cost tracking ─────────────────────────────

    def register_deployment(
        self,
        deployment_id: str,
        vm_size: str,
        cost_per_hour: float,
    ) -> None:
        """Called when a deployment is created to start tracking costs."""
        with self._lock:
            self._deployment_costs[deployment_id] = DeploymentCostRecord(
                deployment_id=deployment_id,
                vm_size=vm_size,
                cost_per_hour=cost_per_hour,
            )
        logger.info(
            "Registered cost tracking for %s ($%.2f/hr)",
            deployment_id,
            cost_per_hour,
        )

    def start_billing(self, deployment_id: str) -> None:
        """Mark a deployment as running (billing clock starts)."""
        with self._lock:
            rec = self._deployment_costs.get(deployment_id)
            if rec:
                now = datetime.now(timezone.utc)
                rec.is_running = True
                rec.started_at = now
                rec.last_updated = now
                logger.info("Billing started for %s", deployment_id)

    def stop_billing(self, deployment_id: str) -> None:
        """Mark a deployment as stopped (billing clock pauses)."""
        with self._lock:
            rec = self._deployment_costs.get(deployment_id)
            if rec and rec.is_running:
                rec.update_accrued_cost()
                rec.is_running = False
                logger.info(
                    "Billing stopped for %s (accrued=$%.4f)",
                    deployment_id,
                    rec.accrued_cost_usd,
                )

    def remove_deployment(self, deployment_id: str) -> None:
        """Remove tracking when a deployment is destroyed."""
        with self._lock:
            self._deployment_costs.pop(deployment_id, None)
        logger.info("Removed cost tracking for %s", deployment_id)

    def set_deployment_budget(
        self,
        deployment_id: str,
        max_spend_usd: float,
    ) -> bool:
        """Set a per-deployment spending limit."""
        with self._lock:
            rec = self._deployment_costs.get(deployment_id)
            if not rec:
                return False
            rec.per_deployment_limit_usd = max_spend_usd
        logger.info(
            "Per-deployment budget for %s set to $%.2f",
            deployment_id,
            max_spend_usd,
        )
        return True

    # ── Cost report generation ───────────────────────────────

    def get_cost_report(self) -> CostReport:
        """Build a full cost report across all deployments."""
        with self._lock:
            deployments: list[CostReportDeployment] = []
            total_accrued = 0.0
            total_hourly = 0.0

            for rec in self._deployment_costs.values():
                rec.update_accrued_cost()
                total_accrued += rec.accrued_cost_usd
                if rec.is_running:
                    total_hourly += rec.cost_per_hour

                deployments.append(
                    CostReportDeployment(
                        deployment_id=rec.deployment_id,
                        vm_size=rec.vm_size,
                        cost_per_hour=rec.cost_per_hour,
                        accrued_cost_usd=round(rec.accrued_cost_usd, 4),
                        is_running=rec.is_running,
                        started_at=rec.started_at.isoformat() if rec.started_at else None,
                        per_deployment_limit_usd=rec.per_deployment_limit_usd,
                    )
                )

            budget = self._budget.model_copy()
            budget_limit = budget.max_total_spend_usd

            budget_remaining = None
            estimated_hours = None
            percent_used = 0.0

            if budget_limit > 0:
                budget_remaining = max(0.0, budget_limit - total_accrued)
                percent_used = (
                    min(
                        (total_accrued / budget_limit) * 100.0,
                        200.0,
                    )
                    if budget_limit > 0
                    else 0.0
                )
                if total_hourly > 0:
                    estimated_hours = budget_remaining / total_hourly

            # Return only recent alerts (last 50)
            recent_alerts = list(reversed(self._alerts[-50:]))

            return CostReport(
                total_accrued_usd=round(total_accrued, 4),
                total_hourly_rate_usd=round(total_hourly, 4),
                budget=budget,
                deployments=deployments,
                alerts=recent_alerts,
                budget_remaining_usd=(
                    round(budget_remaining, 4) if budget_remaining is not None else None
                ),
                estimated_hours_remaining=(
                    round(estimated_hours, 2) if estimated_hours is not None else None
                ),
                percent_used=round(percent_used, 2),
            )

    def get_alerts(self) -> list[CostAlert]:
        with self._lock:
            return list(reversed(self._alerts[-50:]))

    def acknowledge_alert(self, alert_id: str) -> bool:
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.acknowledged = True
                    return True
        return False

    # ── Background monitoring loop ───────────────────────────

    def start(self) -> None:
        """Start the background cost-monitoring loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("Cost monitor started (tick every %ds)", MONITOR_TICK_INTERVAL)

    def stop(self) -> None:
        """Stop the background loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Cost monitor stopped")

    async def _monitor_loop(self) -> None:
        """Main tick loop: update costs, check thresholds, trigger actions."""
        while self._running:
            try:
                await asyncio.sleep(MONITOR_TICK_INTERVAL)
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in cost monitor tick")

    async def _tick(self) -> None:
        """Single monitoring tick."""
        actions_to_take: list[tuple[str, BudgetAction, CostAlert]] = []

        with self._lock:
            if not self._budget.enabled:
                return

            total_accrued = 0.0
            total_hourly = 0.0

            # Update all deployment costs
            for rec in self._deployment_costs.values():
                rec.update_accrued_cost()
                total_accrued += rec.accrued_cost_usd
                if rec.is_running:
                    total_hourly += rec.cost_per_hour

            budget_limit = self._budget.max_total_spend_usd

            # ── Check global budget thresholds ───────────────
            if budget_limit > 0:
                percent_used = (total_accrued / budget_limit) * 100.0
                for threshold in self._budget.thresholds:
                    if threshold.triggered:
                        continue
                    if percent_used >= threshold.percent:
                        threshold.triggered = True
                        threshold.triggered_at = datetime.now(timezone.utc)

                        if threshold.percent >= 100:
                            level = CostAlertLevel.CRITICAL
                        elif threshold.percent >= 80:
                            level = CostAlertLevel.WARNING
                        else:
                            level = CostAlertLevel.INFO

                        alert = CostAlert(
                            id=str(uuid.uuid4()),
                            level=level,
                            message=(
                                f"Global budget {threshold.percent:.0f}% reached: "
                                f"${total_accrued:.2f} of ${budget_limit:.2f} "
                                f"(action: {threshold.action})"
                            ),
                            threshold_percent=threshold.percent,
                            current_spend_usd=round(total_accrued, 4),
                            budget_limit_usd=budget_limit,
                            action_taken=threshold.action,
                        )
                        self._alerts.append(alert)

                        if threshold.action in (
                            BudgetAction.STOP,
                            BudgetAction.DESTROY,
                        ):
                            # Collect all running deployments for shutdown
                            for rec in self._deployment_costs.values():
                                if rec.is_running:
                                    actions_to_take.append(
                                        (rec.deployment_id, threshold.action, alert)
                                    )

            # ── Check per-deployment limits ──────────────────
            per_deploy_global = self._budget.max_per_deployment_spend_usd
            for rec in self._deployment_costs.values():
                if not rec.is_running:
                    continue
                limit = rec.per_deployment_limit_usd or per_deploy_global
                if limit <= 0:
                    continue
                if rec.accrued_cost_usd >= limit:
                    alert = CostAlert(
                        id=str(uuid.uuid4()),
                        level=CostAlertLevel.CRITICAL,
                        deployment_id=rec.deployment_id,
                        message=(
                            f"Deployment {rec.deployment_id[:8]}... "
                            f"exceeded per-deployment limit: "
                            f"${rec.accrued_cost_usd:.2f} of ${limit:.2f}"
                        ),
                        threshold_percent=100.0,
                        current_spend_usd=round(rec.accrued_cost_usd, 4),
                        budget_limit_usd=limit,
                        action_taken=BudgetAction.STOP,
                    )
                    self._alerts.append(alert)
                    actions_to_take.append((rec.deployment_id, BudgetAction.STOP, alert))

            # ── Check hourly rate limit ──────────────────────
            max_hourly = self._budget.max_hourly_rate_usd
            if max_hourly > 0 and total_hourly > max_hourly:
                alert = CostAlert(
                    id=str(uuid.uuid4()),
                    level=CostAlertLevel.WARNING,
                    message=(
                        f"Hourly burn rate ${total_hourly:.2f}/hr "
                        f"exceeds limit of ${max_hourly:.2f}/hr"
                    ),
                    current_spend_usd=round(total_hourly, 4),
                    budget_limit_usd=max_hourly,
                    action_taken=BudgetAction.ALERT,
                )
                self._alerts.append(alert)

        # ── Execute actions outside the lock ─────────────────
        for deployment_id, action, alert in actions_to_take:
            await self._execute_budget_action(deployment_id, action, alert)

    async def _execute_budget_action(
        self,
        deployment_id: str,
        action: BudgetAction,
        alert: CostAlert,
    ) -> None:
        """Execute a budget-triggered action (stop or destroy)."""
        # Broadcast the alert via WebSocket
        await ws_manager.broadcast(
            deployment_id,
            {
                "type": "cost_alert",
                "level": alert.level,
                "message": alert.message,
                "action": action,
                "current_spend_usd": alert.current_spend_usd,
                "budget_limit_usd": alert.budget_limit_usd,
            },
        )

        # Lazy-import orchestrator to avoid circular dependency
        if self._orchestrator is None:
            from app.services.orchestrator import get_orchestrator

            self._orchestrator = get_orchestrator()

        try:
            if action == BudgetAction.STOP:
                logger.warning(
                    "COST LIMIT: Stopping deployment %s ($%.2f spent)",
                    deployment_id,
                    alert.current_spend_usd,
                )
                await self._orchestrator.stop_deployment(deployment_id)
                self.stop_billing(deployment_id)

                await ws_manager.broadcast(
                    deployment_id,
                    {
                        "type": "cost_shutdown",
                        "message": (f"Deployment automatically stopped: {alert.message}"),
                        "action": "stop",
                    },
                )

            elif action == BudgetAction.DESTROY:
                logger.warning(
                    "COST LIMIT: Destroying deployment %s ($%.2f spent)",
                    deployment_id,
                    alert.current_spend_usd,
                )
                await self._orchestrator.destroy_deployment(deployment_id)
                self.stop_billing(deployment_id)
                self.remove_deployment(deployment_id)

                await ws_manager.broadcast(
                    deployment_id,
                    {
                        "type": "cost_shutdown",
                        "message": (f"Deployment automatically destroyed: {alert.message}"),
                        "action": "destroy",
                    },
                )

        except Exception:
            logger.exception(
                "Failed to execute budget action %s on %s",
                action,
                deployment_id,
            )

    # ── Broadcast cost updates ───────────────────────────────

    async def broadcast_cost_update(self) -> None:
        """Send a cost update to all deployment WebSocket listeners."""
        report = self.get_cost_report()
        for dep in report.deployments:
            if dep.is_running:
                await ws_manager.broadcast(
                    dep.deployment_id,
                    {
                        "type": "cost_update",
                        "accrued_cost_usd": dep.accrued_cost_usd,
                        "cost_per_hour": dep.cost_per_hour,
                        "total_accrued_usd": report.total_accrued_usd,
                        "budget_remaining_usd": report.budget_remaining_usd,
                        "percent_used": report.percent_used,
                    },
                )


# ── Singleton ────────────────────────────────────────────────────────

_cost_monitor: CostMonitor | None = None
_monitor_lock = threading.Lock()


def get_cost_monitor() -> CostMonitor:
    """Get the singleton cost monitor instance."""
    global _cost_monitor
    if _cost_monitor is None:
        with _monitor_lock:
            if _cost_monitor is None:
                _cost_monitor = CostMonitor()
    return _cost_monitor
