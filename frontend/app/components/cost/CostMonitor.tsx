"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconAlert,
  IconBell,
  IconCheck,
  IconDollar,
  IconLoader,
  IconTrendingUp,
} from "@/app/components/icons";
import {
  acknowledgeAlert,
  fetchCostReport,
} from "@/app/lib/api";
import type { CostAlert, CostReport } from "@/app/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUSD(amount: number): string {
  if (amount >= 1000) return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(4)}`;
}

function alertLevelClass(level: string): string {
  switch (level) {
    case "critical":
      return "text-[var(--error)] bg-[var(--error)]/10 border-[var(--error)]/30";
    case "warning":
      return "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/30";
    default:
      return "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/30";
  }
}

function progressColor(percent: number): string {
  if (percent >= 100) return "var(--error)";
  if (percent >= 80) return "var(--warning)";
  if (percent >= 50) return "var(--accent)";
  return "var(--success)";
}

// ---------------------------------------------------------------------------
// Cost Summary Bar (compact, shown at top of dashboard)
// ---------------------------------------------------------------------------

interface CostSummaryBarProps {
  report: CostReport | null;
  loading: boolean;
  onExpand: () => void;
  hasUnacknowledgedAlerts: boolean;
}

export function CostSummaryBar({
  report,
  loading,
  onExpand,
  hasUnacknowledgedAlerts,
}: CostSummaryBarProps) {
  if (!report) {
    return (
      <div className="card flex items-center gap-3 px-4 py-2.5">
        {loading ? (
          <>
            <IconLoader size={14} className="text-[var(--muted)]" />
            <span className="text-xs text-[var(--muted)]">Loading costs...</span>
          </>
        ) : (
          <>
            <IconDollar size={14} className="text-[var(--muted)]" />
            <span className="text-xs text-[var(--muted)]">
              Cost monitoring active
            </span>
          </>
        )}
      </div>
    );
  }

  const hasBudget = report.budget.max_total_spend_usd > 0;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="card flex w-full items-center gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--surface-hover)] cursor-pointer border-none text-left"
    >
      {/* Total spend */}
      <div className="flex items-center gap-2">
        <IconDollar size={14} className="text-[var(--accent)] shrink-0" />
        <span className="text-sm font-semibold text-[var(--fg)]">
          {formatUSD(report.total_accrued_usd)}
        </span>
        <span className="text-xs text-[var(--muted)]">spent</span>
      </div>

      {/* Hourly rate */}
      {report.total_hourly_rate_usd > 0 && (
        <div className="flex items-center gap-1.5">
          <IconTrendingUp size={12} className="text-[var(--muted)]" />
          <span className="text-xs text-[var(--muted)]">
            {formatUSD(report.total_hourly_rate_usd)}/hr
          </span>
        </div>
      )}

      {/* Budget progress */}
      {hasBudget && (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg)] overflow-hidden min-w-[60px]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(report.percent_used, 100)}%`,
                backgroundColor: progressColor(report.percent_used),
              }}
            />
          </div>
          <span className="text-xs text-[var(--muted)] whitespace-nowrap">
            {report.percent_used.toFixed(0)}% of {formatUSD(report.budget.max_total_spend_usd)}
          </span>
        </div>
      )}

      {/* Remaining hours */}
      {report.estimated_hours_remaining !== null && report.estimated_hours_remaining > 0 && (
        <span className="text-xs text-[var(--muted)] whitespace-nowrap">
          ~{report.estimated_hours_remaining.toFixed(1)}h remaining
        </span>
      )}

      {/* Alert indicator */}
      {hasUnacknowledgedAlerts && (
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--error)] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--error)]" />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cost Detail Panel (expanded view)
// ---------------------------------------------------------------------------

interface CostDetailPanelProps {
  report: CostReport;
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function CostDetailPanel({
  report,
  onClose,
  onRefresh,
  refreshing,
}: CostDetailPanelProps) {
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const handleAcknowledge = useCallback(async (alertId: string) => {
    setAcknowledging(alertId);
    try {
      await acknowledgeAlert(alertId);
    } catch {
      // Silently fail
    } finally {
      setAcknowledging(null);
      onRefresh();
    }
  }, [onRefresh]);

  const hasBudget = report.budget.max_total_spend_usd > 0;
  const unacknowledgedAlerts = report.alerts.filter((a) => !a.acknowledged);

  return (
    <div
      className="card p-5 flex flex-col gap-4"
      style={{ animation: "slide-up 0.2s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconDollar size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--fg)]">
            Cost Monitor
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? <IconLoader size={12} /> : null}
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Spent"
          value={formatUSD(report.total_accrued_usd)}
          accent
        />
        <StatCard
          label="Burn Rate"
          value={
            report.total_hourly_rate_usd > 0
              ? `${formatUSD(report.total_hourly_rate_usd)}/hr`
              : "Idle"
          }
        />
        <StatCard
          label="Budget"
          value={
            hasBudget
              ? formatUSD(report.budget.max_total_spend_usd)
              : "No limit"
          }
        />
        <StatCard
          label="Remaining"
          value={
            report.budget_remaining_usd !== null
              ? formatUSD(report.budget_remaining_usd)
              : "N/A"
          }
          warning={
            report.budget_remaining_usd !== null &&
            report.budget_remaining_usd < report.total_hourly_rate_usd * 2
          }
        />
      </div>

      {/* Budget progress bar */}
      {hasBudget && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Budget usage</span>
            <span>{report.percent_used.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(report.percent_used, 100)}%`,
                backgroundColor: progressColor(report.percent_used),
              }}
            />
          </div>
          {report.estimated_hours_remaining !== null && (
            <p className="text-xs text-[var(--muted)]">
              At current burn rate, budget will be exhausted in{" "}
              <span className="font-medium text-[var(--fg)]">
                {report.estimated_hours_remaining.toFixed(1)} hours
              </span>
            </p>
          )}
        </div>
      )}

      {/* Per-deployment costs */}
      {report.deployments.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-[var(--fg)]">
            Per-Deployment Costs
          </h3>
          <div className="rounded-md border border-[var(--border-color)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">
                    Deployment
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">
                    VM Size
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">
                    Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">
                    Accrued
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">
                    Limit
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-[var(--muted)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.deployments.map((d) => (
                  <tr
                    key={d.deployment_id}
                    className="border-b border-[var(--border-color)] last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[var(--fg)]">
                      {d.deployment_id.slice(0, 8)}...
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {d.vm_size}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--fg)]">
                      {formatUSD(d.cost_per_hour)}/hr
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--fg)]">
                      {formatUSD(d.accrued_cost_usd)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted)]">
                      {d.per_deployment_limit_usd > 0
                        ? formatUSD(d.per_deployment_limit_usd)
                        : "Global"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {d.is_running ? (
                        <span className="badge badge-success">Running</span>
                      ) : (
                        <span className="badge badge-muted">Stopped</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts */}
      {unacknowledgedAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <IconBell size={14} className="text-[var(--warning)]" />
            <h3 className="text-sm font-medium text-[var(--fg)]">
              Alerts ({unacknowledgedAlerts.length})
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            {unacknowledgedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging === alert.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md bg-[var(--bg)] p-3 flex flex-col gap-1">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={`text-sm font-semibold ${
          warning
            ? "text-[var(--error)]"
            : accent
              ? "text-[var(--accent)]"
              : "text-[var(--fg)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
  acknowledging,
}: {
  alert: CostAlert;
  onAcknowledge: (id: string) => void;
  acknowledging: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${alertLevelClass(alert.level)}`}
    >
      <IconAlert size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{alert.message}</p>
        <p className="text-xs opacity-70 mt-0.5">
          Action: {alert.action_taken} | Spend: {formatUSD(alert.current_spend_usd)}
          {alert.budget_limit_usd > 0 &&
            ` / ${formatUSD(alert.budget_limit_usd)}`}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm shrink-0"
        onClick={() => onAcknowledge(alert.id)}
        disabled={acknowledging}
        title="Acknowledge alert"
      >
        {acknowledging ? (
          <IconLoader size={12} />
        ) : (
          <IconCheck size={12} />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main hook for cost data
// ---------------------------------------------------------------------------

export function useCostMonitor(pollInterval = 15000) {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadReport = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchCostReport();
      setReport(data);
    } catch {
      // API unreachable — keep last data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
    intervalRef.current = setInterval(() => loadReport(true), pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadReport, pollInterval]);

  const hasUnacknowledgedAlerts =
    report?.alerts.some((a) => !a.acknowledged) ?? false;

  return {
    report,
    loading,
    refreshing,
    refresh: () => loadReport(false),
    hasUnacknowledgedAlerts,
  };
}
