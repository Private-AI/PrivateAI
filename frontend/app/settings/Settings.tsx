"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconSettings,
  IconTrash,
  IconCheck,
  IconShield,
  IconClock,
} from "@/app/components/icons";
import type { AzureCredentials } from "@/app/lib/types";
import {
  getSettings,
  saveSettings,
  clearHistory,
  getDeploymentHistory,
  type AppSettings,
} from "@/app/lib/storage";
import type { DeploymentHistoryEntry } from "@/app/lib/storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGIONS = [
  { value: "eastus", label: "East US" },
  { value: "westus2", label: "West US 2" },
  { value: "westeurope", label: "West Europe" },
  { value: "uksouth", label: "UK South" },
  { value: "southeastasia", label: "Southeast Asia" },
] as const;

const FEEDBACK_DURATION = 2000;

// ---------------------------------------------------------------------------
// Feedback hook
// ---------------------------------------------------------------------------

function useFeedback() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = setTimeout(() => setMessage(null), FEEDBACK_DURATION);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, show };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SettingsProps {
  onNavigate: (page: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Settings({ onNavigate }: SettingsProps) {
  // --- State ---------------------------------------------------------------
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [defaultRegion, setDefaultRegion] = useState("eastus");
  const [defaultModels, setDefaultModels] = useState("");
  const [history, setHistory] = useState<DeploymentHistoryEntry[]>([]);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const credentialsFeedback = useFeedback();
  const preferencesFeedback = useFeedback();
  const historyFeedback = useFeedback();

  // --- Load on mount -------------------------------------------------------
  useEffect(() => {
    const s = getSettings();
    setSettings(s);
    setDefaultRegion(s.defaultRegion);
    setDefaultModels(s.defaultModels.join(", "));
    setHistory(getDeploymentHistory());
  }, []);

  // --- Handlers ------------------------------------------------------------

  const handleClearCredentials = useCallback(() => {
    saveSettings({ savedCredentials: null });
    setSettings((prev) => (prev ? { ...prev, savedCredentials: null } : prev));
    credentialsFeedback.show("Credentials cleared");
  }, [credentialsFeedback]);

  const handleSavePreferences = useCallback(() => {
    const models = defaultModels
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    saveSettings({ defaultRegion, defaultModels: models });
    setSettings((prev) =>
      prev ? { ...prev, defaultRegion, defaultModels: models } : prev,
    );
    preferencesFeedback.show("Preferences saved");
  }, [defaultRegion, defaultModels, preferencesFeedback]);

  const handleClearHistory = useCallback(() => {
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      return;
    }
    clearHistory();
    setHistory([]);
    setConfirmClearHistory(false);
    historyFeedback.show("History cleared");
  }, [confirmClearHistory, historyFeedback]);

  // Reset confirmation if user clicks elsewhere after first click
  useEffect(() => {
    if (!confirmClearHistory) return;
    const timer = setTimeout(() => setConfirmClearHistory(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClearHistory]);

  // --- Render helpers ------------------------------------------------------

  const creds: AzureCredentials | null = settings?.savedCredentials ?? null;

  const recentDeployments = history.slice(0, 5);

  if (!settings) return null;

  // --- Render --------------------------------------------------------------

  return (
    <div className="mx-auto max-w-[640px] px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <IconSettings size={24} className="text-accent" />
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      </div>

      <div className="flex flex-col gap-6">
        {/* ================================================================
            1. Saved Credentials
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out both" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <IconShield size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-foreground">
              Saved Credentials
            </h2>
          </div>

          {creds ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Subscription ID</dt>
                <dd className="font-mono text-foreground">
                  {creds.subscription_id}
                </dd>
                <dt className="text-muted">Tenant ID</dt>
                <dd className="font-mono text-foreground">
                  {creds.tenant_id}
                </dd>
                <dt className="text-muted">Client ID</dt>
                <dd className="font-mono text-foreground">
                  {creds.client_id}
                </dd>
                <dt className="text-muted">Client Secret</dt>
                <dd className="font-mono text-foreground">
                  {creds.client_secret ? "****" : "Not saved"}
                </dd>
              </dl>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleClearCredentials}
                >
                  <IconTrash size={14} />
                  Clear Saved Credentials
                </button>
                {credentialsFeedback.message && (
                  <FeedbackText text={credentialsFeedback.message} />
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No credentials saved</p>
          )}
        </section>

        {/* ================================================================
            2. Default Preferences
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.08s both" }}
        >
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Default Preferences
          </h2>

          <div className="space-y-4">
            {/* Region */}
            <div>
              <label
                htmlFor="settings-region"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Default Region
              </label>
              <select
                id="settings-region"
                className="input"
                value={defaultRegion}
                onChange={(e) => setDefaultRegion(e.target.value)}
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Models */}
            <div>
              <label
                htmlFor="settings-models"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Default Models
              </label>
              <input
                id="settings-models"
                type="text"
                className="input"
                placeholder="llama3, codellama, mistral"
                value={defaultModels}
                onChange={(e) => setDefaultModels(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Comma-separated model tags
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSavePreferences}
              >
                <IconCheck size={14} />
                Save Preferences
              </button>
              {preferencesFeedback.message && (
                <FeedbackText text={preferencesFeedback.message} />
              )}
            </div>
          </div>
        </section>

        {/* ================================================================
            3. Deployment History
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.16s both" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <IconClock size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-foreground">
              Deployment History
            </h2>
          </div>

          <p className="mb-3 text-sm text-muted">
            {history.length === 0
              ? "No deployment records"
              : `${history.length} saved deployment${history.length === 1 ? "" : "s"}`}
          </p>

          {recentDeployments.length > 0 && (
            <ul className="mb-4 space-y-2">
              {recentDeployments.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs"
                >
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={d.status} />
                    <span className="text-muted">
                      {formatDate(d.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {history.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleClearHistory}
              >
                <IconTrash size={14} />
                {confirmClearHistory ? "Are you sure?" : "Clear History"}
              </button>
              {historyFeedback.message && (
                <FeedbackText text={historyFeedback.message} />
              )}
            </div>
          )}
        </section>

        {/* ================================================================
            4. About
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.24s both" }}
        >
          <h2 className="mb-3 text-base font-semibold text-foreground">
            About
          </h2>

          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              PrivateAI{" "}
              <span className="ml-1 rounded bg-surface-hover px-1.5 py-0.5 font-mono text-xs text-muted">
                v0.2.0
              </span>
            </p>
            <p className="text-muted">
              Private AI infrastructure deployment
            </p>
            <a
              href="#"
              className="mt-2 inline-block text-sm text-accent hover:underline"
            >
              GitHub
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeedbackText({ text }: { text: string }) {
  return (
    <span
      className="text-xs font-medium text-success"
      style={{ animation: "fade-in 0.15s ease-out" }}
    >
      {text}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: "badge-success",
    failed: "badge-error",
    destroyed: "badge-muted",
    stopped: "badge-warning",
  };
  const cls = colorMap[status] ?? "badge-accent";
  return <span className={`badge ${cls}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
