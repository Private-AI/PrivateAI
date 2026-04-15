"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconChat,
  IconExternalLink,
  IconLoader,
  IconPlay,
  IconRefresh,
  IconStop,
  IconSettings,
} from "@/app/components/icons";
import {
  fetchOpenWebuiStatus,
  startOpenWebui,
  stopOpenWebui,
  restartOpenWebui,
} from "@/app/lib/api";
import type { OpenWebuiState, OpenWebuiStatus } from "@/app/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: OpenWebuiStatus): string {
  switch (status) {
    case "running":
      return "text-[var(--success)]";
    case "starting":
    case "stopping":
      return "text-[var(--accent)]";
    case "error":
      return "text-[var(--error)]";
    default:
      return "text-[var(--muted)]";
  }
}

function statusBadge(status: OpenWebuiStatus): string {
  switch (status) {
    case "running":
      return "badge badge-success";
    case "starting":
    case "stopping":
      return "badge badge-accent";
    case "error":
      return "badge badge-error";
    case "not_installed":
      return "badge badge-muted";
    default:
      return "badge badge-muted";
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OpenWebuiPanelProps {
  onOpenChat: (url: string) => void;
  onOpenSettings: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OpenWebuiPanel({
  onOpenChat,
  onOpenSettings,
}: OpenWebuiPanelProps) {
  const [state, setState] = useState<OpenWebuiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchOpenWebuiStatus();
      setState(data);
    } catch {
      // API unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    intervalRef.current = setInterval(() => loadStatus(true), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadStatus]);

  const handleStart = useCallback(async () => {
    setActionLoading("start");
    try {
      const result = await startOpenWebui();
      setState(result.state);
    } catch {
      // error
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setActionLoading("stop");
    try {
      await stopOpenWebui();
      await loadStatus(true);
    } catch {
      // error
    } finally {
      setActionLoading(null);
    }
  }, [loadStatus]);

  const handleRestart = useCallback(async () => {
    setActionLoading("restart");
    try {
      const result = await restartOpenWebui();
      setState(result.state);
    } catch {
      // error
    } finally {
      setActionLoading(null);
    }
  }, []);

  if (!state) {
    return (
      <div className="card p-4 flex items-center gap-3">
        {loading ? (
          <>
            <IconLoader size={14} className="text-[var(--muted)]" />
            <span className="text-xs text-[var(--muted)]">
              Loading Open WebUI status...
            </span>
          </>
        ) : (
          <>
            <IconChat size={14} className="text-[var(--muted)]" />
            <span className="text-xs text-[var(--muted)]">
              Open WebUI unavailable
            </span>
          </>
        )}
      </div>
    );
  }

  const isRunning = state.status === "running";
  const isBusy =
    state.status === "starting" || state.status === "stopping" || !!actionLoading;

  return (
    <div className="card p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconChat size={16} className="text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--fg)]">
            Open WebUI
          </h3>
          <span className={statusBadge(state.status)}>{state.status}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Settings */}
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onOpenSettings}
            title="Open WebUI settings"
          >
            <IconSettings size={14} />
          </button>
        </div>
      </div>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
        {isRunning && state.url && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
            </span>
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[var(--accent)] hover:underline"
            >
              {state.url}
            </a>
          </span>
        )}

        {state.connected_deployment_name && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Connected to: <span className="font-medium text-[var(--fg)]">{state.connected_deployment_name}</span>
          </span>
        )}

        {state.config.ollama_base_urls && (
          <span>
            Ollama: <span className="font-mono">{state.config.ollama_base_urls}</span>
          </span>
        )}

        {isRunning && state.uptime_seconds > 0 && (
          <span>Uptime: {formatUptime(state.uptime_seconds)}</span>
        )}

        {state.pid && <span>PID: {state.pid}</span>}
      </div>

      {/* Error */}
      {state.error && (
        <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 rounded px-2.5 py-1.5">
          {state.error}
        </p>
      )}

      {/* Not installed warning */}
      {state.status === "not_installed" && (
        <p className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 rounded px-2.5 py-1.5">
          Open WebUI is not installed. Rebuild the Docker image to include it.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!isRunning && state.status !== "not_installed" && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleStart}
            disabled={isBusy}
          >
            {actionLoading === "start" ? (
              <IconLoader size={14} />
            ) : (
              <IconPlay size={14} />
            )}
            Start
          </button>
        )}

        {isRunning && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenChat(state.url)}
            >
              <IconChat size={14} />
              Open Chat
            </button>
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              <IconExternalLink size={14} />
              Browser
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRestart}
              disabled={isBusy}
            >
              {actionLoading === "restart" ? (
                <IconLoader size={14} />
              ) : (
                <IconRefresh size={14} />
              )}
              Restart
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-[var(--error)]"
              onClick={handleStop}
              disabled={isBusy}
            >
              {actionLoading === "stop" ? (
                <IconLoader size={14} />
              ) : (
                <IconStop size={14} />
              )}
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
