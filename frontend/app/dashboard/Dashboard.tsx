"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconAlert,
  IconChat,
  IconCopy,
  IconLoader,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconServer,
  IconStop,
  IconTerminal,
  IconTrash,
} from "@/app/components/icons";
import {
  CostDetailPanel,
  CostSummaryBar,
  useCostMonitor,
} from "@/app/components/cost/CostMonitor";
import TerminalPanel from "@/app/components/TerminalPanel";
import WebUIPanel from "@/app/components/WebUIPanel";
import {
  connectOpenWebuiToDeployment,
  deleteModel,
  destroyDeployment,
  destroyManagedResources,
  fetchDeploymentLive,
  fetchDeployments,
  fetchOpenWebuiStatus,
  listModels,
  pullModel,
  startDeployment,
  stopDeployment,
} from "@/app/lib/api";
import {
  getSettings,
  getDeploymentHistory,
  removeDeploymentFromHistory,
  updateDeploymentInHistory,
} from "@/app/lib/storage";
import type {
  AzureCredentials,
  Deployment,
  DeploymentStatus,
  OllamaModel,
  ServiceEndpoints,
} from "@/app/lib/types";

// ---------------------------------------------------------------------------
// Merged view model -- superset of Deployment & DeploymentHistoryEntry
// ---------------------------------------------------------------------------

interface DeploymentView {
  id: string;
  name: string;
  provider: string;
  region: string;
  vm_size: string;
  status: DeploymentStatus;
  created_at: string;
  public_ip: string | null;
  endpoints: ServiceEndpoints | null;
  error: string | null;
}

function deploymentToView(d: Deployment): DeploymentView {
  return {
    id: d.id,
    name: d.config.vm_name,
    provider: d.config.provider,
    region: d.config.region,
    vm_size: d.config.vm_size,
    status: d.status,
    created_at: d.created_at,
    public_ip: d.public_ip,
    endpoints: d.endpoints,
    error: d.error,
  };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: DeploymentStatus): string {
  switch (status) {
    case "running":
      return "badge badge-success";
    case "stopped":
    case "stopping":
      return "badge badge-warning";
    case "failed":
      return "badge badge-error";
    case "provisioning":
    case "configuring":
    case "starting":
      return "badge badge-accent";
    case "destroying":
    case "destroyed":
    case "pending":
    default:
      return "badge badge-muted";
  }
}

function statusLabel(status: DeploymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function isTransient(status: DeploymentStatus): boolean {
  return (
    status === "provisioning" ||
    status === "configuring" ||
    status === "starting" ||
    status === "stopping" ||
    status === "destroying"
  );
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Null endpoints constant
// ---------------------------------------------------------------------------

const EMPTY_ENDPOINTS: ServiceEndpoints = {
  ssh: null,
  ollama_api: null,
};

// ---------------------------------------------------------------------------
// Copy button with tooltip
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleCopy}
        className="btn btn-ghost btn-icon btn-sm"
        aria-label="Copy to clipboard"
      >
        <IconCopy size={14} />
      </button>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-[var(--surface-hover)] px-2 py-0.5 text-xs text-[var(--fg)] shadow-lg animate-[fade-in_0.15s_ease-out] whitespace-nowrap pointer-events-none">
          Copied!
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Model manager panel (shown inside a running deployment card)
// ---------------------------------------------------------------------------

function formatModelSize(bytes: number): string {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function ModelManager({ deploymentId }: { deploymentId: string }) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [pullInput, setPullInput] = useState("");
  const [pulling, setPulling] = useState(false);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listModels(deploymentId);
      setModels(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (open) loadModels();
  }, [open, loadModels]);

  const handlePull = useCallback(async () => {
    if (!pullInput.trim()) return;
    setPulling(true);
    setError(null);
    try {
      await pullModel(deploymentId, pullInput.trim());
      setPullInput("");
      await loadModels();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  }, [deploymentId, pullInput, loadModels]);

  const handleDelete = useCallback(async (model: string) => {
    setDeletingModel(model);
    setError(null);
    try {
      await deleteModel(deploymentId, model);
      setModels((prev) => prev.filter((m) => m.name !== model));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingModel(null);
    }
  }, [deploymentId]);

  return (
    <div className="border-t border-[var(--border-color)] pt-3">
      <button
        type="button"
        className="flex items-center gap-2 text-xs font-medium text-[var(--fg-secondary)] hover:text-[var(--fg)] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <IconServer size={13} />
        Models {models.length > 0 && !open ? `(${models.length})` : ""}
        <span className="ml-auto text-[var(--muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Pull new model */}
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-xs font-mono flex-1"
              placeholder="llama3:8b, mistral:7b …"
              value={pullInput}
              onChange={(e) => setPullInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePull()}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pulling || !pullInput.trim()}
              onClick={handlePull}
            >
              {pulling ? <IconLoader size={13} /> : <IconPlus size={13} />}
              Pull
            </button>
          </div>

          {error && (
            <p className="text-xs text-[var(--error)]">{error}</p>
          )}

          {/* Model list */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <IconLoader size={13} /> Loading models…
            </div>
          )}
          {!loading && models.length === 0 && (
            <p className="text-xs text-[var(--muted)]">No models installed yet.</p>
          )}
          {models.map((m) => (
            <div
              key={m.name}
              className="flex items-center justify-between gap-2 rounded bg-[var(--bg)] px-3 py-2"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-mono text-[var(--fg)] truncate">{m.name}</span>
                {m.size > 0 && (
                  <span className="text-[10px] text-[var(--muted)]">
                    {formatModelSize(m.size)}
                    {m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ""}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm text-[var(--error)] hover:text-[var(--error)] shrink-0"
                disabled={deletingModel === m.name}
                onClick={() => handleDelete(m.name)}
                aria-label={`Delete ${m.name}`}
                title="Delete model"
              >
                {deletingModel === m.name ? <IconLoader size={13} /> : <IconTrash size={13} />}
              </button>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-ghost btn-sm self-start"
            disabled={loading}
            onClick={loadModels}
          >
            <IconRefresh size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="card flex flex-col items-center gap-4 px-12 py-10 text-center">
        <IconServer size={48} className="text-[var(--muted)]" />
        <h2 className="text-lg font-semibold text-[var(--fg)]">
          No deployments yet
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Deploy your first private AI infrastructure
        </p>
        <button
          type="button"
          className="btn btn-primary mt-2"
          onClick={() => onNavigate("provision")}
        >
          <IconPlus size={16} />
          Create Deployment
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deployment card
// ---------------------------------------------------------------------------

interface CardProps {
  deployment: DeploymentView;
  index: number;
  onRefresh: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDestroy: (id: string) => Promise<void>;
  onOpenTerminal: (id: string) => void;
  onOpenChat: (id: string, name: string) => void;
  chatLoadingId: string | null;
  connectedDeploymentId: string;
  loadingAction: string | null;
}

function DeploymentCard({
  deployment: d,
  index,
  onRefresh,
  onStart,
  onStop,
  onDestroy,
  onOpenTerminal,
  onOpenChat,
  chatLoadingId,
  connectedDeploymentId,
  loadingAction,
}: CardProps) {
  const sshCommand = d.public_ip ? `ssh root@${d.public_ip}` : null;
  const canChat = d.status === "running" && !!d.public_ip;
  const isConnected = connectedDeploymentId === d.id;
  const isChatLoading = chatLoadingId === d.id;
  const pulsing = d.status === "provisioning" || d.status === "configuring";

  return (
    <div
      className="card p-5 flex flex-col gap-3"
      style={{
        animation: `fade-in 0.2s ease-out ${index * 0.05}s both`,
      }}
    >
      {/* Top row: name + status */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-[var(--fg)]">
          {d.name}
        </h3>
        <span
          className={`${statusBadgeClass(d.status)} shrink-0 ${
            pulsing ? "animate-[pulse-subtle_2s_ease-in-out_infinite]" : ""
          }`}
        >
          {statusLabel(d.status)}
        </span>
      </div>

      {/* Provider / region / size */}
      <p className="text-xs text-[var(--muted)] truncate">
        {d.provider.toUpperCase()} &middot; {d.region} &middot; {d.vm_size}
      </p>

      {/* Error message */}
      {d.error && d.status === "failed" && (
        <p className="text-xs text-[var(--error)] truncate" title={d.error}>
          {d.error}
        </p>
      )}

      {/* Service links */}
      {d.status === "running" && sshCommand && (
        <div className="flex flex-col gap-2 rounded-md bg-[var(--bg)] p-3">
          {sshCommand && (
            <div className="flex items-center gap-2 text-xs">
              <IconTerminal
                size={14}
                className="shrink-0 text-[var(--muted)]"
              />
              <code className="flex-1 truncate font-mono text-[var(--fg-secondary)]">
                {sshCommand}
              </code>
              <CopyButton text={sshCommand} />
              <button
                type="button"
                className="btn btn-ghost btn-sm text-xs"
                onClick={() => onOpenTerminal(d.id)}
                aria-label="Open SSH terminal"
                title="Open embedded terminal"
              >
                Open
              </button>
            </div>
          )}

          {/* Open Chat — connect Open WebUI to this deployment via SSH tunnel */}
          {canChat && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                className={`btn btn-sm flex-1 ${
                  isConnected
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                disabled={isChatLoading}
                onClick={() => onOpenChat(d.id, d.name)}
              >
                {isChatLoading ? (
                  <IconLoader size={14} />
                ) : (
                  <IconChat size={14} />
                )}
                {isConnected ? "Open Chat" : "Connect & Chat"}
              </button>
              {isConnected && (
                <span className="text-[10px] text-[var(--success)] font-medium">Connected</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {(d.status === "provisioning" || d.status === "configuring") && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <IconLoader size={14} />
            Deploying...
          </span>
        )}

        {d.status === "starting" && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <IconLoader size={14} />
            Starting...
          </span>
        )}

        {d.status === "stopping" && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
            <IconLoader size={14} />
            Stopping...
          </span>
        )}

        {d.status === "destroying" && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--error)]">
            <IconLoader size={14} />
            Destroying...
          </span>
        )}

        {d.status === "running" && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingAction !== null}
              onClick={() => onStop(d.id)}
            >
              {loadingAction === "stop" ? (
                <IconLoader size={14} />
              ) : (
                <IconStop size={14} />
              )}
              Stop
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={loadingAction !== null}
              onClick={() => onDestroy(d.id)}
            >
              {loadingAction === "destroy" ? (
                <IconLoader size={14} />
              ) : (
                <IconTrash size={14} />
              )}
              Destroy
            </button>
          </>
        )}

        {d.status === "stopped" && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={loadingAction !== null}
              onClick={() => onStart(d.id)}
            >
              {loadingAction === "start" ? (
                <IconLoader size={14} />
              ) : (
                <IconPlay size={14} />
              )}
              Start
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={loadingAction !== null}
              onClick={() => onDestroy(d.id)}
            >
              {loadingAction === "destroy" ? (
                <IconLoader size={14} />
              ) : (
                <IconTrash size={14} />
              )}
              Destroy
            </button>
          </>
        )}

        {d.status === "failed" && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={loadingAction !== null}
            onClick={() => onDestroy(d.id)}
          >
            {loadingAction === "destroy" ? (
              <IconLoader size={14} />
            ) : (
              <IconTrash size={14} />
            )}
            Destroy
          </button>
        )}
      </div>

      {/* Model manager — only when running */}
      {d.status === "running" && <ModelManager deploymentId={d.id} />}

      {/* Bottom: created time + refresh */}
      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
        <span className="text-xs text-[var(--muted)]">
          Created {relativeTime(d.created_at)}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          disabled={loadingAction === "refresh"}
          onClick={() => onRefresh(d.id)}
          aria-label="Refresh deployment status"
        >
          <IconRefresh
            size={14}
            className={loadingAction === "refresh" ? "animate-spin" : ""}
          />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface DashboardProps {
  onNavigate: (page: string) => void;
}

type OpenPanel =
  | { type: "terminal"; deploymentId: string }
  | { type: "webui"; url: string }
  | null;

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [deployments, setDeployments] = useState<DeploymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    Record<string, string | null>
  >({});
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [costExpanded, setCostExpanded] = useState(false);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [connectedDeploymentId, setConnectedDeploymentId] = useState("");
  const [bulkDestroyLoading, setBulkDestroyLoading] = useState(false);
  const [bulkDestroyFeedback, setBulkDestroyFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  // Cost monitoring
  const {
    report: costReport,
    loading: costLoading,
    refreshing: costRefreshing,
    refresh: refreshCost,
    hasUnacknowledgedAlerts,
  } = useCostMonitor();

  const handleOpenTerminal = useCallback((id: string) => {
    setOpenPanel({ type: "terminal", deploymentId: id });
  }, []);

  /** Called from a deployment card — connects Open WebUI to this deployment, then opens chat. */
  const handleConnectAndChat = useCallback(
    async (deploymentId: string, deploymentName: string) => {
      setChatLoadingId(deploymentId);
      setChatError(null);
      try {
        const result = await connectOpenWebuiToDeployment(
          deploymentId,
          deploymentName,
        );
        if (result.success && result.state.url) {
          setConnectedDeploymentId(deploymentId);
          setOpenPanel({ type: "webui", url: result.state.url });
        } else {
          setChatError(result.message || "Open WebUI failed to start");
        }
      } catch (err) {
        setChatError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setChatLoadingId(null);
      }
    },
    [],
  );

  const handleClosePanel = useCallback(() => {
    setOpenPanel(null);
  }, []);

  // -----------------------------------------------------------------------
  // Load data
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    // 1) Instant display from local storage
    const history = getDeploymentHistory();
    const fromHistory: DeploymentView[] = history.map((h) => ({
      id: h.id,
      name: h.name,
      provider: h.provider,
      region: h.region,
      vm_size: h.vm_size,
      status: h.status,
      created_at: h.created_at,
      public_ip: h.public_ip,
      endpoints: h.endpoints,
      error: null,
    }));

    if (fromHistory.length > 0) {
      setDeployments(fromHistory);
    }

    // 2) Fetch live data and merge
    try {
      const live = await fetchDeployments();
      const liveViews = live.map(deploymentToView);

      // Merge: live data wins, keep history entries not in live
      const liveIds = new Set(liveViews.map((v) => v.id));
      const merged = [
        ...liveViews,
        ...fromHistory.filter((h) => !liveIds.has(h.id)),
      ];

      setDeployments(merged);

      // Update local storage with latest statuses
      for (const v of liveViews) {
        updateDeploymentInHistory(v.id, {
          status: v.status,
          public_ip: v.public_ip ?? "",
          endpoints: v.endpoints ?? EMPTY_ENDPOINTS,
        });
      }
    } catch {
      // API unreachable -- keep showing cached history
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Sync connected deployment from Open WebUI status
    fetchOpenWebuiStatus()
      .then((state) => {
        if (state.connected_deployment_id) {
          setConnectedDeploymentId(state.connected_deployment_id);
        }
      })
      .catch(() => {});
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Auto-refresh transient statuses
  // -----------------------------------------------------------------------

  useEffect(() => {
    const hasTransient = deployments.some((d) => isTransient(d.status));
    if (!hasTransient) return;

    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [deployments, loadData]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const setActionFor = useCallback(
    (id: string, action: string | null) => {
      setActionLoading((prev) => ({ ...prev, [id]: action }));
    },
    [],
  );

  const handleRefresh = useCallback(
    async (id: string) => {
      setActionFor(id, "refresh");
      try {
        const live = await fetchDeploymentLive(id);
        const view = deploymentToView(live);
        setDeployments((prev) =>
          prev.map((d) => (d.id === id ? view : d)),
        );
        updateDeploymentInHistory(id, {
          status: view.status,
          public_ip: view.public_ip ?? "",
          endpoints: view.endpoints ?? EMPTY_ENDPOINTS,
        });
      } catch {
        // Silently fail -- stale data stays
      } finally {
        setActionFor(id, null);
      }
    },
    [setActionFor],
  );

  const handleStart = useCallback(
    async (id: string) => {
      setActionFor(id, "start");
      try {
        await startDeployment(id);
        setDeployments((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "starting" as const } : d,
          ),
        );
        updateDeploymentInHistory(id, { status: "starting" });
      } catch {
        // Keep current state
      } finally {
        setActionFor(id, null);
      }
    },
    [setActionFor],
  );

  const handleStop = useCallback(
    async (id: string) => {
      setActionFor(id, "stop");
      try {
        await stopDeployment(id);
        setDeployments((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "stopping" as const } : d,
          ),
        );
        updateDeploymentInHistory(id, { status: "stopping" });
      } catch {
        // Keep current state
      } finally {
        setActionFor(id, null);
      }
    },
    [setActionFor],
  );

  const handleDestroy = useCallback(
    async (id: string) => {
      setActionFor(id, "destroy");
      try {
        const settings = getSettings();
        const credentials: AzureCredentials | undefined =
          settings.savedCredentials?.provider === "azure"
            ? settings.savedCredentials
            : undefined;
        const result = await destroyDeployment(id, credentials);

        if (result.success && result.status === "destroyed") {
          removeDeploymentFromHistory(id);
          setDeployments((prev) => prev.filter((d) => d.id !== id));
          return;
        }

        setDeployments((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, status: result.status as DeploymentStatus, error: result.message }
              : d,
          ),
        );
        updateDeploymentInHistory(id, { status: result.status as DeploymentStatus });
      } catch {
        // Keep current state
      } finally {
        setActionFor(id, null);
      }
    },
    [setActionFor],
  );

  const handleDestroyAllManagedResources = useCallback(async () => {
    const confirmed = window.confirm(
      "Destroy all Azure resource groups created by PrivateAI in this subscription? This only targets groups tagged as managed by PrivateAI.",
    );
    if (!confirmed) return;

    setBulkDestroyLoading(true);
    setBulkDestroyFeedback(null);
    try {
      const settings = getSettings();
      const credentials: AzureCredentials | undefined =
        settings.savedCredentials?.provider === "azure"
          ? settings.savedCredentials
          : undefined;
      const result = await destroyManagedResources("azure", credentials);

      for (const deploymentId of result.removed_deployment_ids) {
        removeDeploymentFromHistory(deploymentId);
      }

      setDeployments((prev) =>
        prev.filter((deployment) => !result.removed_deployment_ids.includes(deployment.id)),
      );
      setBulkDestroyFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      await loadData();
    } catch (err) {
      setBulkDestroyFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Bulk destroy failed",
      });
    } finally {
      setBulkDestroyLoading(false);
    }
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isEmpty = !loading && deployments.length === 0;

  return (
    <div className="flex flex-col gap-6 p-6 animate-[fade-in_0.2s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Deployments</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDestroyAllManagedResources}
            disabled={bulkDestroyLoading}
          >
            {bulkDestroyLoading ? <IconLoader size={16} /> : <IconAlert size={16} />}
            Destroy All Managed Azure Resources
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate("provision")}
          >
            <IconPlus size={16} />
            New Deployment
          </button>
        </div>
      </div>

      {bulkDestroyFeedback && (
        <div
          className={
            bulkDestroyFeedback.tone === "success"
              ? "card border-[var(--success)] bg-[var(--success-subtle)] p-3"
              : "card border-[var(--error)] bg-[var(--error-subtle)] p-3"
          }
        >
          <p
            className={
              bulkDestroyFeedback.tone === "success"
                ? "text-sm text-[var(--success)]"
                : "text-sm text-[var(--error)]"
            }
          >
            {bulkDestroyFeedback.message}
          </p>
        </div>
      )}

      {/* Cost monitoring bar */}
      <CostSummaryBar
        report={costReport}
        loading={costLoading}
        onExpand={() => setCostExpanded((prev) => !prev)}
        hasUnacknowledgedAlerts={hasUnacknowledgedAlerts}
      />

      {/* Cost detail panel (expanded) */}
      {costExpanded && costReport && (
        <CostDetailPanel
          report={costReport}
          onClose={() => setCostExpanded(false)}
          onRefresh={refreshCost}
          refreshing={costRefreshing}
        />
      )}

      {/* Loading skeleton */}
      {loading && deployments.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <IconLoader size={24} className="text-[var(--muted)]" />
        </div>
      )}

      {/* Chat connection error */}
      {chatError && (
        <div className="card border-[var(--error)] bg-[var(--error-subtle)] p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--error)]">{chatError}</p>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setChatError(null)}>Dismiss</button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <EmptyState onNavigate={onNavigate} />}

      {/* Deployment grid */}
      {deployments.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {deployments.map((d, i) => (
            <DeploymentCard
              key={d.id}
              deployment={d}
              index={i}
              onRefresh={handleRefresh}
              onStart={handleStart}
              onStop={handleStop}
              onDestroy={handleDestroy}
              onOpenTerminal={handleOpenTerminal}
              onOpenChat={handleConnectAndChat}
              chatLoadingId={chatLoadingId}
              connectedDeploymentId={connectedDeploymentId}
              loadingAction={actionLoading[d.id] ?? null}
            />
          ))}
        </div>
      )}

      {/* Embedded panels */}
      {openPanel?.type === "terminal" && (
        <TerminalPanel
          deploymentId={openPanel.deploymentId}
          onClose={handleClosePanel}
        />
      )}
      {openPanel?.type === "webui" && (
        <WebUIPanel url={openPanel.url} onClose={handleClosePanel} />
      )}
    </div>
  );
}
