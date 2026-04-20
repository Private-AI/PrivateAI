"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconSettings,
  IconTrash,
  IconCheck,
  IconShield,
  IconClock,
  IconDollar,
  IconChat,
  IconLoader,
} from "@/app/components/icons";
import type {
  AzureCredentials,
  BudgetConfig,
  BudgetAction,
  OpenWebuiEnvConfig,
} from "@/app/lib/types";
import {
  fetchBudget,
  setBudget,
  fetchOpenWebuiConfig,
  updateOpenWebuiConfig,
} from "@/app/lib/api";
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
  const [defaultRegion, setDefaultRegion] = useState("centralus");
  const [defaultModels, setDefaultModels] = useState("");
  const [history, setHistory] = useState<DeploymentHistoryEntry[]>([]);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Budget state
  const [budgetEnabled, setBudgetEnabled] = useState(true);
  const [maxTotalSpend, setMaxTotalSpend] = useState("");
  const [maxPerDeploySpend, setMaxPerDeploySpend] = useState("");
  const [maxHourlyRate, setMaxHourlyRate] = useState("");
  const [budgetActionAt100, setBudgetActionAt100] = useState<BudgetAction>("stop");
  const [budgetLoading, setBudgetLoading] = useState(false);

  // Open WebUI config state
  const [webuiOllamaUrls, setWebuiOllamaUrls] = useState("");
  const [webuiPort, setWebuiPort] = useState("8080");
  const [webuiName, setWebuiName] = useState("PrivateAI Chat");
  const [webuiEnableSignup, setWebuiEnableSignup] = useState(true);
  const [webuiDefaultModels, setWebuiDefaultModels] = useState("");
  const [webuiEnableRag, setWebuiEnableRag] = useState(true);
  const [webuiLoading, setWebuiLoading] = useState(false);

  const credentialsFeedback = useFeedback();
  const preferencesFeedback = useFeedback();
  const historyFeedback = useFeedback();
  const budgetFeedback = useFeedback();
  const webuiFeedback = useFeedback();

  // --- Load on mount -------------------------------------------------------
  useEffect(() => {
    const s = getSettings();
    setSettings(s);
    setDefaultRegion(s.defaultRegion);
    setDefaultModels(s.defaultModels.join(", "));
    setHistory(getDeploymentHistory());

    // Load budget from backend
    fetchBudget()
      .then((budget) => {
        setBudgetEnabled(budget.enabled);
        setMaxTotalSpend(budget.max_total_spend_usd > 0 ? String(budget.max_total_spend_usd) : "");
        setMaxPerDeploySpend(budget.max_per_deployment_spend_usd > 0 ? String(budget.max_per_deployment_spend_usd) : "");
        setMaxHourlyRate(budget.max_hourly_rate_usd > 0 ? String(budget.max_hourly_rate_usd) : "");
        const actionThreshold = budget.thresholds.find((t) => t.percent >= 100);
        if (actionThreshold) setBudgetActionAt100(actionThreshold.action);
      })
      .catch(() => {
        // Backend unreachable — use defaults
      });

    // Load Open WebUI config from backend
    fetchOpenWebuiConfig()
      .then((cfg) => {
        setWebuiOllamaUrls(cfg.ollama_base_urls);
        setWebuiPort(String(cfg.port));
        setWebuiName(cfg.webui_name);
        setWebuiEnableSignup(cfg.enable_signup);
        setWebuiDefaultModels(cfg.default_models);
        setWebuiEnableRag(cfg.enable_rag);
      })
      .catch(() => {
        // Backend unreachable
      });
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

  const handleSaveBudget = useCallback(async () => {
    setBudgetLoading(true);
    try {
      const budget: BudgetConfig = {
        max_total_spend_usd: parseFloat(maxTotalSpend) || 0,
        max_per_deployment_spend_usd: parseFloat(maxPerDeploySpend) || 0,
        max_hourly_rate_usd: parseFloat(maxHourlyRate) || 0,
        enabled: budgetEnabled,
        thresholds: [
          { percent: 50, action: "alert" as BudgetAction, triggered: false, triggered_at: null },
          { percent: 80, action: "alert" as BudgetAction, triggered: false, triggered_at: null },
          { percent: 100, action: budgetActionAt100, triggered: false, triggered_at: null },
        ],
      };
      await setBudget(budget);
      saveSettings({ budgetConfig: budget });
      budgetFeedback.show("Budget saved");
    } catch {
      budgetFeedback.show("Failed to save budget");
    } finally {
      setBudgetLoading(false);
    }
  }, [maxTotalSpend, maxPerDeploySpend, maxHourlyRate, budgetEnabled, budgetActionAt100, budgetFeedback]);

  const handleSaveWebuiConfig = useCallback(async () => {
    setWebuiLoading(true);
    try {
      const config: OpenWebuiEnvConfig = {
        ollama_base_urls: webuiOllamaUrls,
        port: parseInt(webuiPort) || 8080,
        data_dir: "/app/open-webui-data",
        webui_name: webuiName,
        enable_signup: webuiEnableSignup,
        default_models: webuiDefaultModels,
        webui_secret_key: "privateai-secret-key",
        enable_rag: webuiEnableRag,
      };
      const result = await updateOpenWebuiConfig(config);
      webuiFeedback.show(
        result.restarted
          ? "Configuration saved and Open WebUI restarted"
          : "Configuration saved",
      );
    } catch {
      webuiFeedback.show("Failed to save configuration");
    } finally {
      setWebuiLoading(false);
    }
  }, [webuiOllamaUrls, webuiPort, webuiName, webuiEnableSignup, webuiDefaultModels, webuiEnableRag, webuiFeedback]);

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
            3. Cost Budget
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.16s both" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <IconDollar size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-foreground">
              Cost Budget
            </h2>
          </div>

          <p className="mb-4 text-sm text-muted">
            Set spending limits to automatically shut down resources when
            exceeded. The backend monitors costs in real-time.
          </p>

          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center gap-3">
              <label htmlFor="budget-enabled" className="text-sm font-medium text-muted">
                Cost monitoring
              </label>
              <button
                id="budget-enabled"
                type="button"
                role="switch"
                aria-checked={budgetEnabled}
                onClick={() => setBudgetEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  budgetEnabled ? "bg-[var(--accent)]" : "bg-[var(--border-color)]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    budgetEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-xs text-muted">
                {budgetEnabled ? "Active" : "Disabled"}
              </span>
            </div>

            {/* Max total spend */}
            <div>
              <label
                htmlFor="budget-total"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Maximum Total Spend (USD)
              </label>
              <input
                id="budget-total"
                type="number"
                className="input"
                placeholder="e.g. 100.00 (0 = unlimited)"
                value={maxTotalSpend}
                onChange={(e) => setMaxTotalSpend(e.target.value)}
                min="0"
                step="1"
              />
              <p className="mt-1 text-xs text-muted">
                Total spending limit across all deployments. Set to 0 or leave
                empty for no limit.
              </p>
            </div>

            {/* Max per-deployment spend */}
            <div>
              <label
                htmlFor="budget-per-deploy"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Max Per-Deployment Spend (USD)
              </label>
              <input
                id="budget-per-deploy"
                type="number"
                className="input"
                placeholder="e.g. 50.00 (0 = unlimited)"
                value={maxPerDeploySpend}
                onChange={(e) => setMaxPerDeploySpend(e.target.value)}
                min="0"
                step="1"
              />
              <p className="mt-1 text-xs text-muted">
                Individual deployment spending cap (overridable per-deployment)
              </p>
            </div>

            {/* Max hourly rate */}
            <div>
              <label
                htmlFor="budget-hourly"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Max Hourly Rate (USD/hr)
              </label>
              <input
                id="budget-hourly"
                type="number"
                className="input"
                placeholder="e.g. 40.00 (0 = unlimited)"
                value={maxHourlyRate}
                onChange={(e) => setMaxHourlyRate(e.target.value)}
                min="0"
                step="0.01"
              />
              <p className="mt-1 text-xs text-muted">
                Alert when combined hourly rate of all running VMs exceeds this
              </p>
            </div>

            {/* Action at 100% */}
            <div>
              <label
                htmlFor="budget-action"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Action When Budget Exceeded
              </label>
              <select
                id="budget-action"
                className="input"
                value={budgetActionAt100}
                onChange={(e) => setBudgetActionAt100(e.target.value as BudgetAction)}
              >
                <option value="alert">Alert only (notify but keep running)</option>
                <option value="stop">Stop VMs (deallocate, preserves disks)</option>
                <option value="destroy">Destroy all resources (irreversible)</option>
              </select>
              <p className="mt-1 text-xs text-muted">
                What happens when 100% of the budget is reached. Alerts at 50%
                and 80% are always sent.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveBudget}
                disabled={budgetLoading}
              >
                {budgetLoading ? (
                  <IconLoader size={14} />
                ) : (
                  <IconCheck size={14} />
                )}
                Save Budget
              </button>
              {budgetFeedback.message && (
                <FeedbackText text={budgetFeedback.message} />
              )}
            </div>
          </div>
        </section>

        {/* ================================================================
            4. Open WebUI Configuration
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.24s both" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <IconChat size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-foreground">
              Open WebUI
            </h2>
          </div>

          <p className="mb-4 text-sm text-muted">
            Configure the local Open WebUI instance. Changes to a running
            instance trigger an automatic restart.
          </p>

          <div className="space-y-4">
            {/* Ollama URL */}
            <div>
              <label
                htmlFor="webui-ollama-urls"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Ollama Server URL(s)
              </label>
              <input
                id="webui-ollama-urls"
                type="text"
                className="input"
                placeholder="http://20.42.83.157:11434"
                value={webuiOllamaUrls}
                onChange={(e) => setWebuiOllamaUrls(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                The Ollama API base URL from your provisioned cloud VM.
                Semicolon-separated for multiple servers.
              </p>
            </div>

            {/* Port */}
            <div>
              <label
                htmlFor="webui-port"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Local Port
              </label>
              <input
                id="webui-port"
                type="number"
                className="input"
                value={webuiPort}
                onChange={(e) => setWebuiPort(e.target.value)}
                min="1024"
                max="65535"
              />
              <p className="mt-1 text-xs text-muted">
                Port Open WebUI listens on locally (default: 8080)
              </p>
            </div>

            {/* Display name */}
            <div>
              <label
                htmlFor="webui-name"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Display Name
              </label>
              <input
                id="webui-name"
                type="text"
                className="input"
                value={webuiName}
                onChange={(e) => setWebuiName(e.target.value)}
              />
            </div>

            {/* Default model */}
            <div>
              <label
                htmlFor="webui-default-models"
                className="mb-1.5 block text-sm font-medium text-muted"
              >
                Default Model
              </label>
              <input
                id="webui-default-models"
                type="text"
                className="input"
                placeholder="e.g. gemma3:4b"
                value={webuiDefaultModels}
                onChange={(e) => setWebuiDefaultModels(e.target.value)}
              />
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label htmlFor="webui-signup" className="text-sm font-medium text-muted">
                  Allow signups
                </label>
                <button
                  id="webui-signup"
                  type="button"
                  role="switch"
                  aria-checked={webuiEnableSignup}
                  onClick={() => setWebuiEnableSignup((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    webuiEnableSignup ? "bg-[var(--accent)]" : "bg-[var(--border-color)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      webuiEnableSignup ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor="webui-rag" className="text-sm font-medium text-muted">
                  Enable RAG (document upload)
                </label>
                <button
                  id="webui-rag"
                  type="button"
                  role="switch"
                  aria-checked={webuiEnableRag}
                  onClick={() => setWebuiEnableRag((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    webuiEnableRag ? "bg-[var(--accent)]" : "bg-[var(--border-color)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      webuiEnableRag ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveWebuiConfig}
                disabled={webuiLoading}
              >
                {webuiLoading ? (
                  <IconLoader size={14} />
                ) : (
                  <IconCheck size={14} />
                )}
                Save Configuration
              </button>
              {webuiFeedback.message && (
                <FeedbackText text={webuiFeedback.message} />
              )}
            </div>
          </div>
        </section>

        {/* ================================================================
            5. Deployment History
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.32s both" }}
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
            6. About
            ================================================================ */}
        <section
          className="card p-5"
          style={{ animation: "slide-up 0.3s ease-out 0.40s both" }}
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
