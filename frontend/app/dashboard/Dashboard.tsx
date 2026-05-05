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
import { useWindowWidth } from "@/app/lib/useWindowWidth";
import TerminalPanel from "@/app/components/TerminalPanel";
import ChatPanel from "@/app/components/ChatPanel";
import { COLORS } from "@/app/lib/colors";
import {
  connectOpenWebuiToDeployment,
  deleteModel,
  destroyDeployment,
  destroyManagedResources,
  fetchDeploymentLive,
  fetchDeployments,
  fetchOpenWebuiStatus,
  startOpenWebui,
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
// View model
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
// Helpers
// ---------------------------------------------------------------------------

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

const EMPTY_ENDPOINTS: ServiceEndpoints = { ssh: null, ollama_api: null };

// ---------------------------------------------------------------------------
// Copy button
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

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={handleCopy} className="btn btn-ghost btn-icon btn-sm" aria-label="Copy">
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
// Model manager
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
      setModels(await listModels(deploymentId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => { if (open) loadModels(); }, [open, loadModels]);

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
    <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 14, marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer",
          color: COLORS.textMuted, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit",
        }}
      >
        <IconServer size={12} style={{ color: COLORS.textMuted }} />
        Models{models.length > 0 && !open ? ` (${models.length})` : ""}
        <span style={{ marginLeft: "auto", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              className="input text-xs font-mono flex-1"
              placeholder="llama3:8b, mistral:7b …"
              value={pullInput}
              onChange={(e) => setPullInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePull()}
              spellCheck={false}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={pulling || !pullInput.trim()} onClick={handlePull}>
              {pulling ? <IconLoader size={13} /> : <IconPlus size={13} />}
              Pull
            </button>
          </div>
          {error && <p className="text-xs text-[var(--error)]">{error}</p>}
          {loading && <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><IconLoader size={13} /> Loading…</div>}
          {!loading && models.length === 0 && <p className="text-xs text-[var(--muted)]">No models installed yet.</p>}
          {models.map((m) => (
            <div key={m.name} className="flex items-center justify-between gap-2 rounded bg-[var(--bg)] px-3 py-2">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-mono text-[var(--fg)] truncate">{m.name}</span>
                {m.size > 0 && (
                  <span className="text-[10px] text-[var(--muted)]">
                    {formatModelSize(m.size)}{m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ""}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm text-[var(--error)] shrink-0"
                disabled={deletingModel === m.name}
                onClick={() => handleDelete(m.name)}
              >
                {deletingModel === m.name ? <IconLoader size={13} /> : <IconTrash size={13} />}
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm self-start" disabled={loading} onClick={loadModels}>
            <IconRefresh size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; color: string }> = {
    azure: { label: "Azure", color: "#0078d4" },
    aws:   { label: "AWS",   color: "#ff9900" },
    gcp:   { label: "GCP",   color: "#4285f4" },
  };
  const { label, color } = map[provider.toLowerCase()] ?? { label: provider.toUpperCase(), color: "#6b7280" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}20`, border: `1px solid ${color}35`,
      borderRadius: 4, padding: "2px 7px", letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: DeploymentStatus }) {
  const color = status === "running" ? "#4ade80"
    : status === "failed" ? "#f87171"
    : isTransient(status) ? COLORS.indigoLight
    : "#94a3b8";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, color,
      background: `${color}15`, border: `1px solid ${color}30`,
      borderRadius: 100, padding: "3px 10px",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0,
        boxShadow: status === "running" ? `0 0 6px ${color}` : "none",
        animation: isTransient(status) ? "pulse-core 1.5s infinite" : "none",
      }} />
      {statusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared card action types
// ---------------------------------------------------------------------------

interface CardActions {
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

// ---------------------------------------------------------------------------
// Featured deployment card (primary / first running)
// ---------------------------------------------------------------------------

function FeaturedCard({ d, actions, isMobile }: { d: DeploymentView; actions: CardActions; isMobile: boolean }) {
  const { onRefresh, onStart, onStop, onDestroy, onOpenTerminal, onOpenChat,
          chatLoadingId, connectedDeploymentId, loadingAction } = actions;

  const canChat = d.status === "running" && !!d.public_ip;
  const isConnected = connectedDeploymentId === d.id;
  const isChatLoading = chatLoadingId === d.id;
  const transient = isTransient(d.status);
  const sshCommand = d.public_ip ? `ssh azureuser@${d.public_ip}` : null;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(45,212,191,0.05) 100%)",
      border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: 20, padding: isMobile ? "20px 16px" : "28px 32px",
      position: "relative", overflow: "hidden",
    }}>
      {/* Radial glow */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 220, height: 220,
        background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ fontSize: 10, color: COLORS.indigo, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20, opacity: 0.8 }}>
        Active instance
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", gap: isMobile ? 16 : 24 }}>

        {/* VM icon + status dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="4" y="8" width="28" height="18" rx="4" stroke={COLORS.indigoLight} strokeWidth="1.5"/>
              <rect x="8" y="12" width="20" height="10" rx="2" fill={COLORS.indigo} opacity="0.4"/>
              <line x1="12" y1="26" x2="24" y2="26" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="18" y1="26" x2="18" y2="30" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="12" y1="30" x2="24" y2="30" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="10" y="14" width="2" height="6" rx="1" fill={COLORS.teal} opacity="0.85"/>
              <line x1="14" y1="15" x2="22" y2="15" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round"/>
              <line x1="14" y1="18" x2="20" y2="18" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </div>
          {d.status === "running" && (
            <div style={{
              position: "absolute", bottom: 2, right: 2, width: 14, height: 14,
              borderRadius: "50%", background: "#4ade80",
              border: "2px solid #07091a", boxShadow: "0 0 8px #4ade80",
            }} />
          )}
          {transient && (
            <div style={{
              position: "absolute", bottom: 2, right: 2, width: 14, height: 14,
              borderRadius: "50%", background: COLORS.indigoLight,
              border: "2px solid #07091a", animation: "pulse-core 1.5s infinite",
            }} />
          )}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <h2 style={{
              fontFamily: "var(--font-syne), Syne, sans-serif",
              fontSize: 22, fontWeight: 700, color: COLORS.textPrimary,
              letterSpacing: "-0.02em", margin: 0,
            }}>
              {d.name}
            </h2>
            <StatusPill status={d.status} />
            <ProviderBadge provider={d.provider} />
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{d.region}</span>
          </div>

          {/* Metadata */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 14 }}>
            {[
              { label: "Size",    value: d.vm_size },
              { label: "IP",      value: d.public_ip ?? "—", mono: true },
              { label: "Active",  value: relativeTime(d.created_at) },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: mono ? "monospace" : "inherit", fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Error */}
          {d.error && d.status === "failed" && (
            <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 10px" }}>{d.error}</p>
          )}

          {/* Transient label */}
          {transient && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.indigoLight, fontSize: 13 }}>
              <IconLoader size={13} className="animate-spin" style={{ color: COLORS.indigoLight }} />
              {statusLabel(d.status)}...
            </div>
          )}

          {/* SSH row */}
          {d.status === "running" && sshCommand && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 14,
              padding: "8px 12px", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${COLORS.border}`, borderRadius: 8,
            }}>
              <IconTerminal size={13} style={{ color: COLORS.textMuted, flexShrink: 0 }} />
              <code style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "monospace", flex: 1 }}>{sshCommand}</code>
              <CopyButton text={sshCommand} />
              <button type="button" className="btn btn-ghost btn-sm text-xs" onClick={() => onOpenTerminal(d.id)}>Open</button>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", gap: 8, flexShrink: 0, minWidth: isMobile ? 0 : 148, width: isMobile ? "100%" : "auto" }}>

          {/* Connect & Chat */}
          {canChat && (
            <button
              type="button"
              disabled={isChatLoading}
              onClick={() => onOpenChat(d.id, d.name)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: COLORS.indigo, border: "none", borderRadius: 10, padding: "11px 16px",
                color: "white", fontSize: 13, fontWeight: 600, cursor: isChatLoading ? "default" : "pointer",
                fontFamily: "inherit", boxShadow: "0 4px 16px rgba(99,102,241,0.3)", transition: "opacity 0.2s",
                opacity: isChatLoading ? 0.7 : 1,
              }}
            >
              {isChatLoading ? <IconLoader size={14} style={{ color: "white" }} className="animate-spin" /> : <IconChat size={14} style={{ color: "white" }} />}
              {isConnected ? "Open Chat" : "Connect & Chat"}
            </button>
          )}

          {/* Stop */}
          {d.status === "running" && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => onStop(d.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: "rgba(255,255,255,0.05)", border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "9px 16px", color: COLORS.textSecondary,
                fontSize: 13, fontWeight: 600, cursor: loadingAction ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {loadingAction === "stop" ? <IconLoader size={14} className="animate-spin" /> : <IconStop size={14} />}
              Stop VM
            </button>
          )}

          {/* Start */}
          {d.status === "stopped" && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => onStart(d.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: "rgba(255,255,255,0.05)", border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "9px 16px", color: COLORS.textSecondary,
                fontSize: 13, fontWeight: 600, cursor: loadingAction ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {loadingAction === "start" ? <IconLoader size={14} className="animate-spin" /> : <IconPlay size={14} />}
              Start VM
            </button>
          )}

          {/* Destroy */}
          {(d.status === "running" || d.status === "stopped" || d.status === "failed") && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => onDestroy(d.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 10, padding: "9px 16px", color: "#f87171",
                fontSize: 13, fontWeight: 600, cursor: loadingAction ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {loadingAction === "destroy" ? <IconLoader size={14} className="animate-spin" style={{ color: "#f87171" }} /> : <IconTrash size={14} />}
              Destroy
            </button>
          )}

          {/* Refresh */}
          <button
            type="button"
            disabled={loadingAction === "refresh"}
            onClick={() => onRefresh(d.id)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "none", border: "none", padding: "6px", marginTop: 2,
              color: COLORS.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <IconRefresh size={13} className={loadingAction === "refresh" ? "animate-spin" : ""} />
            Refresh status
          </button>
        </div>
      </div>

      {/* Model manager */}
      {d.status === "running" && (
        <div style={{ marginTop: 20 }}>
          <ModelManager deploymentId={d.id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact row (inside "More deployments" collapsible)
// ---------------------------------------------------------------------------

function CompactRow({
  d, index, actions, hovered, onHover, isMobile,
}: {
  d: DeploymentView;
  index: number;
  actions: CardActions;
  hovered: boolean;
  onHover: (id: string | null) => void;
  isMobile: boolean;
}) {
  const { onStart, onStop, onDestroy, onOpenChat,
          chatLoadingId, connectedDeploymentId, loadingAction } = actions;

  const canChat = d.status === "running" && !!d.public_ip;
  const isConnected = connectedDeploymentId === d.id;
  const isChatLoading = chatLoadingId === d.id;
  const transient = isTransient(d.status);
  const statusColor = d.status === "running" ? "#4ade80"
    : d.status === "failed" ? "#f87171"
    : transient ? COLORS.indigoLight
    : "#6b7280";

  return (
    <div
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, padding: isMobile ? "12px 12px" : "14px 20px",
        background: hovered ? "rgba(255,255,255,0.035)" : index % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
        borderTop: index > 0 ? `1px solid ${COLORS.border}` : "none",
        transition: "background 0.15s",
      }}
    >
      {/* Icon + status dot */}
      <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="10" rx="2.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
            <line x1="7" y1="14" x2="13" y2="14" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="10" y1="14" x2="10" y2="17" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="7" y1="17" x2="13" y2="17" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{
          position: "absolute", bottom: -1, right: -1, width: 10, height: 10,
          borderRadius: "50%", background: statusColor, border: "2px solid #07091a",
          animation: transient ? "pulse-core 1.5s infinite" : "none",
        }} />
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
          <ProviderBadge provider={d.provider} />
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>{d.region}</span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>{d.vm_size}</span>
          <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>
            {statusLabel(d.status)}{d.status === "running" ? ` · ${relativeTime(d.created_at)}` : ""}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: "flex", gap: 7, flexShrink: 0,
        opacity: isMobile || hovered ? 1 : 0.45, transition: "opacity 0.2s",
      }}>
        {canChat && (
          <button
            type="button"
            disabled={isChatLoading}
            onClick={() => onOpenChat(d.id, d.name)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: COLORS.indigo, border: "none", borderRadius: 8,
              padding: isMobile ? "7px 10px" : "7px 14px", color: "white", fontSize: 12, fontWeight: 600,
              cursor: isChatLoading ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {isChatLoading ? <IconLoader size={12} className="animate-spin" style={{ color: "white" }} /> : <IconChat size={12} style={{ color: "white" }} />}
            {!isMobile && (isConnected ? "Chat" : "Connect")}
          </button>
        )}
        {d.status === "stopped" && (
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => onStart(d.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: isMobile ? "7px 10px" : "7px 12px", color: COLORS.textSecondary, fontSize: 12, fontWeight: 500,
              cursor: loadingAction ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {loadingAction === "start" ? <IconLoader size={12} className="animate-spin" /> : <IconPlay size={12} />}
            {!isMobile && "Start"}
          </button>
        )}
        {d.status === "running" && (
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => onStop(d.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: isMobile ? "7px 10px" : "7px 12px", color: COLORS.textSecondary, fontSize: 12, fontWeight: 500,
              cursor: loadingAction ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {loadingAction === "stop" ? <IconLoader size={12} className="animate-spin" /> : <IconStop size={12} />}
            {!isMobile && "Stop"}
          </button>
        )}
        <button
          type="button"
          disabled={loadingAction !== null}
          onClick={() => onDestroy(d.id)}
          title="Destroy"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8,
            padding: "7px 10px", color: "#f87171", cursor: loadingAction ? "default" : "pointer",
          }}
        >
          {loadingAction === "destroy" ? <IconLoader size={12} className="animate-spin" style={{ color: "#f87171" }} /> : <IconTrash size={12} />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center",
        padding: "48px 60px", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 20,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IconServer size={32} style={{ color: COLORS.textMuted }} />
        </div>
        <div>
          <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            No deployments yet
          </h2>
          <p style={{ color: COLORS.textMuted, fontSize: 14, margin: 0 }}>
            Deploy your first private AI — it only takes a few minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("provision")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: COLORS.indigo, border: "none", borderRadius: 10, padding: "10px 20px",
            color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }}
        >
          <IconPlus size={16} style={{ color: "white" }} />
          Create Deployment
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
  | { type: "chat"; url: string }
  | null;

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [deployments, setDeployments] = useState<DeploymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string | null>>({});
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [costExpanded, setCostExpanded] = useState(false);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [connectedDeploymentId, setConnectedDeploymentId] = useState("");
  const [bulkDestroyLoading, setBulkDestroyLoading] = useState(false);
  const [bulkDestroyFeedback, setBulkDestroyFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const { report: costReport, loading: costLoading, refreshing: costRefreshing, refresh: refreshCost, hasUnacknowledgedAlerts } = useCostMonitor();

  const handleOpenTerminal = useCallback((id: string) => {
    setOpenPanel({ type: "terminal", deploymentId: id });
  }, []);

  const handleConnectAndChat = useCallback(async (deploymentId: string, deploymentName: string) => {
    setChatLoadingId(deploymentId);
    setChatError(null);
    try {
      const result = await connectOpenWebuiToDeployment(deploymentId, deploymentName);
      if (result.success) {
        setConnectedDeploymentId(deploymentId);
        setOpenPanel({ type: "chat", url: result.state?.url ?? "" });
      } else {
        setChatError(result.message || "Open WebUI failed to start");
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setChatLoadingId(null);
    }
  }, []);

  const handleClosePanel = useCallback(() => setOpenPanel(null), []);

  const loadData = useCallback(async () => {
    const history = getDeploymentHistory();
    const fromHistory: DeploymentView[] = history.map((h) => ({
      id: h.id, name: h.name, provider: h.provider, region: h.region, vm_size: h.vm_size,
      status: h.status, created_at: h.created_at, public_ip: h.public_ip, endpoints: h.endpoints, error: null,
    }));
    // Show cached data and clear loading immediately — API call refreshes in background
    setDeployments(fromHistory);
    setLoading(false);

    try {
      const live = await fetchDeployments();
      // Filter out destroyed records — backend now deletes them, but guard against
      // stale records from before this fix.
      const liveViews = live.filter((d) => d.status !== "destroyed").map(deploymentToView);
      const liveIds = new Set(liveViews.map((v) => v.id));
      setDeployments([...liveViews, ...fromHistory.filter((h) => !liveIds.has(h.id))]);
      for (const v of liveViews) {
        updateDeploymentInHistory(v.id, { status: v.status, public_ip: v.public_ip ?? "", endpoints: v.endpoints ?? EMPTY_ENDPOINTS });
      }
    } catch {
      // keep cached history already displayed
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchOpenWebuiStatus()
      .then((state) => {
        if (state.connected_deployment_id) setConnectedDeploymentId(state.connected_deployment_id);
        if (state.status === "running" && state.url) {
          try { localStorage.setItem("_privateai_chat_url", state.url); } catch {}
        } else if (state.status === "stopped" || state.status === "error") {
          startOpenWebui().then((r) => {
            if (r.success && r.state?.url) {
              try { localStorage.setItem("_privateai_chat_url", r.state.url); } catch {}
            }
          }).catch(() => {});
        }
      }).catch(() => {});
  }, [loadData]);

  useEffect(() => {
    if (!deployments.some((d) => isTransient(d.status))) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [deployments, loadData]);

  const setActionFor = useCallback((id: string, action: string | null) => {
    setActionLoading((prev) => ({ ...prev, [id]: action }));
  }, []);

  const handleRefresh = useCallback(async (id: string) => {
    setActionFor(id, "refresh");
    try {
      const view = deploymentToView(await fetchDeploymentLive(id));
      setDeployments((prev) => prev.map((d) => d.id === id ? view : d));
      updateDeploymentInHistory(id, { status: view.status, public_ip: view.public_ip ?? "", endpoints: view.endpoints ?? EMPTY_ENDPOINTS });
    } catch { /* keep current */ } finally { setActionFor(id, null); }
  }, [setActionFor]);

  const handleStart = useCallback(async (id: string) => {
    setActionFor(id, "start");
    try {
      await startDeployment(id);
      setDeployments((prev) => prev.map((d) => d.id === id ? { ...d, status: "starting" as const } : d));
      updateDeploymentInHistory(id, { status: "starting" });
    } catch { /* keep current */ } finally { setActionFor(id, null); }
  }, [setActionFor]);

  const handleStop = useCallback(async (id: string) => {
    setActionFor(id, "stop");
    try {
      await stopDeployment(id);
      setDeployments((prev) => prev.map((d) => d.id === id ? { ...d, status: "stopping" as const } : d));
      updateDeploymentInHistory(id, { status: "stopping" });
    } catch { /* keep current */ } finally { setActionFor(id, null); }
  }, [setActionFor]);

  const handleDestroy = useCallback(async (id: string) => {
    setActionFor(id, "destroy");
    const currentStatus = deployments.find((d) => d.id === id)?.status;
    try {
      const settings = getSettings();
      const credentials: AzureCredentials | undefined =
        settings.savedCredentials?.provider === "azure" ? settings.savedCredentials : undefined;
      const result = await destroyDeployment(id, credentials);
      if (result.success || result.status === "destroyed") {
        removeDeploymentFromHistory(id);
        setDeployments((prev) => prev.filter((d) => d.id !== id));
        return;
      }
      // If the deployment was already failed, the cloud resources are likely
      // already gone — let the user force-remove it from the list.
      if (currentStatus === "failed") {
        removeDeploymentFromHistory(id);
        setDeployments((prev) => prev.filter((d) => d.id !== id));
        return;
      }
      setDeployments((prev) => prev.map((d) => d.id === id ? { ...d, status: result.status as DeploymentStatus, error: result.message } : d));
      updateDeploymentInHistory(id, { status: result.status as DeploymentStatus });
    } catch {
      // Network error — if it was already failed just remove it locally.
      if (currentStatus === "failed") {
        removeDeploymentFromHistory(id);
        setDeployments((prev) => prev.filter((d) => d.id !== id));
      }
    } finally { setActionFor(id, null); }
  }, [setActionFor, deployments]);

  const handleDestroyAllManagedResources = useCallback(async () => {
    if (!window.confirm("Destroy all Azure resource groups created by PrivateAI in this subscription? This also removes any failed or stuck deployments from the list.")) return;
    setBulkDestroyLoading(true);
    setBulkDestroyFeedback(null);
    try {
      const settings = getSettings();
      const credentials: AzureCredentials | undefined =
        settings.savedCredentials?.provider === "azure" ? settings.savedCredentials : undefined;
      const result = await destroyManagedResources("azure", credentials);
      // Remove everything the backend cleaned up.
      const removedSet = new Set(result.removed_deployment_ids);
      for (const id of result.removed_deployment_ids) removeDeploymentFromHistory(id);
      // Also purge any failed/destroyed records still in local state — the backend
      // cleaned those up too (dead deployments are removed in bulk destroy).
      setDeployments((prev) => {
        const remaining = prev.filter((d) => {
          if (removedSet.has(d.id)) return false;
          if (d.status === "failed" || d.status === "destroyed" || d.status === "destroying") return false;
          return true;
        });
        // Sync history for anything we removed locally.
        for (const d of prev) {
          if (!remaining.includes(d)) removeDeploymentFromHistory(d.id);
        }
        return remaining;
      });
      setBulkDestroyFeedback({ tone: result.success ? "success" : "error", message: result.message });
      await loadData();
    } catch (err) {
      setBulkDestroyFeedback({ tone: "error", message: err instanceof Error ? err.message : "Bulk destroy failed" });
    } finally {
      setBulkDestroyLoading(false);
    }
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const featuredDeployment = deployments.find((d) => d.status === "running") ?? deployments[0];
  const restDeployments = featuredDeployment ? deployments.filter((d) => d.id !== featuredDeployment.id) : [];
  const isEmpty = !loading && deployments.length === 0;

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  return (
    <div style={{ padding: isMobile ? "20px 16px" : "36px 40px", maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: isMobile ? 22 : 28, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Your Private AI
          </h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
            Manage your servers and start private conversations
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            disabled={bulkDestroyLoading}
            onClick={handleDestroyAllManagedResources}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 10, padding: "9px 14px", color: "#f87171", fontSize: 12, fontWeight: 600,
              cursor: bulkDestroyLoading ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {bulkDestroyLoading ? <IconLoader size={14} className="animate-spin" style={{ color: "#f87171" }} /> : <IconAlert size={14} />}
            {isMobile ? "Destroy All" : "Destroy All Azure"}
          </button>
          <button
            type="button"
            onClick={() => onNavigate("provision")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: COLORS.indigo, border: "none", borderRadius: 10, padding: "10px 18px",
              color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
            }}
          >
            <IconPlus size={15} style={{ color: "white" }} />
            New Deployment
          </button>
        </div>
      </div>

      {/* Bulk destroy feedback */}
      {bulkDestroyFeedback && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 10,
          background: bulkDestroyFeedback.tone === "success" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
          border: `1px solid ${bulkDestroyFeedback.tone === "success" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
          fontSize: 13, color: bulkDestroyFeedback.tone === "success" ? "#4ade80" : "#f87171",
        }}>
          {bulkDestroyFeedback.message}
        </div>
      )}

      {/* Cost monitoring */}
      <CostSummaryBar report={costReport} loading={costLoading} onExpand={() => setCostExpanded((p) => !p)} hasUnacknowledgedAlerts={hasUnacknowledgedAlerts} />
      {costExpanded && costReport && (
        <CostDetailPanel report={costReport} onClose={() => setCostExpanded(false)} onRefresh={refreshCost} refreshing={costRefreshing} />
      )}

      {/* Chat error */}
      {chatError && (
        <div style={{
          marginTop: 16, padding: "12px 16px", borderRadius: 10,
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 13, color: "#f87171",
        }}>
          {chatError}
          <button type="button" onClick={() => setChatError(null)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 20, lineHeight: 1, paddingLeft: 12 }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loading && deployments.length === 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <IconLoader size={28} className="animate-spin" style={{ color: COLORS.textMuted }} />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <EmptyState onNavigate={onNavigate} />}

      {/* Featured card */}
      {featuredDeployment && (
        <div style={{ marginTop: 24, animation: "fade-in 0.3s ease-out" }}>
          <FeaturedCard
            d={featuredDeployment}
            isMobile={isMobile}
            actions={{
              onRefresh: handleRefresh, onStart: handleStart, onStop: handleStop, onDestroy: handleDestroy,
              onOpenTerminal: handleOpenTerminal, onOpenChat: handleConnectAndChat,
              chatLoadingId, connectedDeploymentId,
              loadingAction: actionLoading[featuredDeployment.id] ?? null,
            }}
          />
        </div>
      )}

      {/* More deployments collapsible */}
      {restDeployments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setMoreExpanded((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: moreExpanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${moreExpanded ? COLORS.borderHover : COLORS.border}`,
              borderRadius: moreExpanded ? "14px 14px 0 0" : 14,
              padding: "14px 20px", cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flex: 1, minWidth: 0, overflow: "hidden" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <rect x="1" y="2" width="14" height="4" rx="1.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
                <rect x="1" y="8" width="14" height="4" rx="1.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary, whiteSpace: "nowrap" }}>More deployments</span>
              {!isMobile && (
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {restDeployments.map((d) => {
                    const c = d.status === "running" ? "#4ade80" : d.status === "failed" ? "#f87171" : isTransient(d.status) ? COLORS.indigoLight : "#6b7280";
                    return <div key={d.id} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.85 }} />;
                  })}
                </div>
              )}
              <span style={{ fontSize: 12, color: COLORS.textMuted, whiteSpace: "nowrap", flexShrink: 0 }}>{restDeployments.length} instance{restDeployments.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
              {!isMobile && <span style={{ fontSize: 12, color: COLORS.textMuted }}>{moreExpanded ? "Collapse" : "Expand"}</span>}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: moreExpanded ? "rotate(180deg)" : "none", transition: "transform 0.3s ease" }}>
                <path d="M4 6L8 10L12 6" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </button>

          {moreExpanded && (
            <div style={{ border: `1px solid ${COLORS.borderHover}`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
              {restDeployments.map((d, i) => (
                <CompactRow
                  key={d.id}
                  d={d}
                  index={i}
                  actions={{
                    onRefresh: handleRefresh, onStart: handleStart, onStop: handleStop, onDestroy: handleDestroy,
                    onOpenTerminal: handleOpenTerminal, onOpenChat: handleConnectAndChat,
                    chatLoadingId, connectedDeploymentId,
                    loadingAction: actionLoading[d.id] ?? null,
                  }}
                  hovered={hoveredRowId === d.id}
                  onHover={setHoveredRowId}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overlays */}
      {openPanel?.type === "terminal" && (
        <TerminalPanel deploymentId={openPanel.deploymentId} onClose={handleClosePanel} />
      )}
      {openPanel?.type === "chat" && (
        <ChatPanel openwebuiUrl={openPanel.url} onClose={handleClosePanel} />
      )}
    </div>
  );
}
