"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconExternalLink,
  IconChat,
  IconGlobe,
  IconLoader,
  IconServer,
  IconShield,
  IconTerminal,
  IconX,
  IconAlert,
} from "@/app/components/icons";
import {
  connectDeploymentWS,
  createDeployment,
  fetchProviders,
  fetchVMSizes,
  validateCredentials,
} from "@/app/lib/api";
import {
  getSettings,
  saveSettings,
  addDeploymentToHistory,
} from "@/app/lib/storage";
import type {
  AzureCredentials,
  CloudProvider,
  DeploymentConfig,
  ProviderInfo,
  SecurityLevel,
  StepProgress,
  ServiceEndpoints,
  VMSize,
} from "@/app/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ["Provider", "Credentials", "Configuration", "Deploy"] as const;
type WizardStep = 0 | 1 | 2 | 3;

const QUICK_MODELS = ["gemma3:4b", "llama3:8b", "mistral:7b"];

const COMING_SOON_PROVIDERS: { id: string; name: string }[] = [
  { id: "gcp", name: "Google Cloud" },
  { id: "aws", name: "Amazon Web Services" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProvisionWizardProps {
  onNavigate: (page: string) => void;
}

// ---------------------------------------------------------------------------
// Step progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, completed }: { current: WizardStep; completed: Set<number> }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {WIZARD_STEPS.map((label, i) => {
        const isCompleted = completed.has(i);
        const isCurrent = i === current;
        const isFuture = !isCompleted && !isCurrent;

        return (
          <div key={label} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className={[
                  "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all duration-300",
                  isCompleted
                    ? "bg-[var(--accent)] text-white"
                    : isCurrent
                      ? "bg-[var(--accent)] text-white ring-4 ring-[var(--ring-color)]"
                      : "bg-[var(--surface)] text-[var(--muted)] border border-[var(--border-color)]",
                ].join(" ")}
              >
                {isCompleted ? <IconCheck size={14} /> : i + 1}
              </div>
              <span
                className={[
                  "mt-1.5 text-xs transition-colors duration-300",
                  isCurrent ? "text-[var(--accent)] font-medium" : isFuture ? "text-[var(--muted)]" : "text-[var(--fg-secondary)]",
                ].join(" ")}
              >
                {label}
              </span>
            </div>

            {/* Connector line */}
            {i < WIZARD_STEPS.length - 1 && (
              <div
                className={[
                  "w-12 h-px mx-2 mb-5 transition-colors duration-300",
                  completed.has(i) ? "bg-[var(--accent)]" : "bg-[var(--border-color)]",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={handleCopy} className="btn btn-ghost btn-sm" aria-label="Copy">
        <IconCopy size={14} />
      </button>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-[var(--surface-hover)] px-2 py-0.5 text-xs text-[var(--fg)] shadow-lg animate-[fade-in_0.15s_ease-out] whitespace-nowrap pointer-events-none">
          Copied
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Provider Selection
// ---------------------------------------------------------------------------

function ProviderStep({
  providers,
  loading,
  error,
  onSelect,
}: {
  providers: ProviderInfo[];
  loading: boolean;
  error: string | null;
  onSelect: (provider: ProviderInfo) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 animate-[fade-in_0.2s_ease-out]">
        <IconLoader size={24} className="text-[var(--muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 animate-[slide-up_0.25s_ease-out]">
        <IconAlert size={24} className="text-[var(--error)]" />
        <p className="text-sm text-[var(--error)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-[slide-up_0.25s_ease-out]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Select Cloud Provider</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose where to deploy your private AI infrastructure.
        </p>
      </div>

      <div className="grid gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="card card-interactive flex items-center gap-4 p-4 text-left cursor-pointer"
            onClick={() => onSelect(p)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-subtle)]">
              <IconServer size={20} className="text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--fg)]">{p.display_name}</p>
              <p className="text-xs text-[var(--muted)]">{p.regions.length} regions available</p>
            </div>
            <IconChevronRight size={16} className="text-[var(--muted)]" />
          </button>
        ))}

        {COMING_SOON_PROVIDERS.map((p) => (
          <div
            key={p.id}
            className="card flex items-center gap-4 p-4 opacity-50 cursor-not-allowed"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-hover)]">
              <IconServer size={20} className="text-[var(--muted)]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--fg)]">{p.name}</p>
              <p className="text-xs text-[var(--muted)]">Coming soon</p>
            </div>
            <span className="badge badge-muted">Soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Credentials
// ---------------------------------------------------------------------------

interface CredentialFormState {
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  saveCredentials: boolean;
}

function CredentialsStep({
  form,
  onChange,
  onValidate,
  validationResult,
  validating,
  onBack,
  onNext,
}: {
  form: CredentialFormState;
  onChange: (update: Partial<CredentialFormState>) => void;
  onValidate: () => void;
  validationResult: { valid: boolean; message: string } | null;
  validating: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const fields: { key: keyof Omit<CredentialFormState, "saveCredentials">; label: string; placeholder: string; type?: string }[] = [
    { key: "subscription_id", label: "Subscription ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { key: "tenant_id", label: "Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { key: "client_id", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { key: "client_secret", label: "Client Secret", placeholder: "Enter client secret", type: "password" },
  ];

  const allFilled = fields.every((f) => form[f.key].trim().length > 0);

  return (
    <div className="flex flex-col gap-5 animate-[slide-up_0.25s_ease-out]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Azure Credentials</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter your Azure service principal credentials.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
              {f.label}
            </label>
            <input
              id={f.key}
              type={f.type ?? "text"}
              className="input font-mono text-sm"
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      {/* Validate */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!allFilled || validating}
          onClick={onValidate}
        >
          {validating ? <IconLoader size={14} /> : <IconShield size={14} />}
          Test Credentials
        </button>
        {validationResult && (
          <span className={validationResult.valid ? "badge badge-success" : "badge badge-error"}>
            {validationResult.valid ? (
              <><IconCheck size={12} /> Valid</>
            ) : (
              <><IconX size={12} /> {validationResult.message}</>
            )}
          </span>
        )}
      </div>

      {/* Save checkbox */}
      <label className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.saveCredentials}
          onChange={(e) => onChange({ saveCredentials: e.target.checked })}
          className="w-4 h-4 accent-[var(--accent)] rounded"
        />
        Save credentials for next time
      </label>

      {/* Nav */}
      <div className="flex items-center justify-between pt-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" disabled={!allFilled} onClick={onNext}>
          Next
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Configuration
// ---------------------------------------------------------------------------

interface ConfigFormState {
  region: string;
  vmSize: string;
  securityLevel: SecurityLevel;
  model: string;
}

function ConfigStep({
  provider,
  form,
  onChange,
  vmSizes,
  vmSizesLoading,
  onBack,
  onDeploy,
}: {
  provider: ProviderInfo;
  form: ConfigFormState;
  onChange: (update: Partial<ConfigFormState>) => void;
  vmSizes: VMSize[];
  vmSizesLoading: boolean;
  onBack: () => void;
  onDeploy: () => void;
}) {
  const selectedVM = vmSizes.find((v) => v.id === form.vmSize);
  const canDeploy = form.region.length > 0 && form.vmSize.length > 0 && form.model.trim().length > 0;

  return (
    <div className="flex flex-col gap-5 animate-[slide-up_0.25s_ease-out]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Configuration</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure your deployment parameters.
        </p>
      </div>

      {/* Region */}
      <div>
        <label htmlFor="region" className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
          Region
        </label>
        <select
          id="region"
          className="input"
          value={form.region}
          onChange={(e) => onChange({ region: e.target.value })}
        >
          <option value="">Select region</option>
          {provider.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* VM Size */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-[var(--fg-secondary)]">
            VM Size
          </label>
          {vmSizesLoading && <IconLoader size={14} className="text-[var(--muted)]" />}
        </div>
        {vmSizes.length === 0 && !vmSizesLoading && form.region && (
          <p className="text-xs text-[var(--muted)] py-2">No VM sizes available for this region.</p>
        )}
        {vmSizes.length === 0 && !form.region && (
          <p className="text-xs text-[var(--muted)] py-2">Select a region first.</p>
        )}
        <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
          {vmSizes.map((vm) => (
            <button
              key={vm.id}
              type="button"
              className={[
                "card p-3 text-left cursor-pointer transition-all duration-200",
                form.vmSize === vm.id
                  ? "border-[var(--accent)] ring-1 ring-[var(--ring-color)]"
                  : "",
              ].join(" ")}
              onClick={() => onChange({ vmSize: vm.id })}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--fg)]">{vm.display_name}</p>
                <div className="flex items-center gap-1.5">
                  {vm.confidential && (
                    <span className="badge badge-accent">
                      <IconShield size={10} />
                      Confidential
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                {vm.gpu_model && <span>{vm.gpu_model}</span>}
                <span>{vm.vcpus} vCPUs</span>
                <span>{vm.memory_gb} GB RAM</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Hardware Encryption */}
      {selectedVM?.confidential && (
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-2">
            Hardware Encryption
          </label>
          <div className="flex gap-3">
            <label className={[
              "card flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-all duration-200",
              form.securityLevel === "confidential"
                ? "border-[var(--accent)] ring-1 ring-[var(--ring-color)]"
                : "",
            ].join(" ")}>
              <input
                type="radio"
                name="security"
                value="confidential"
                checked={form.securityLevel === "confidential"}
                onChange={() => onChange({ securityLevel: "confidential" })}
                className="accent-[var(--accent)]"
              />
              <div>
                <p className="text-sm font-medium text-[var(--fg)]">Confidential</p>
                <p className="text-xs text-[var(--muted)]">Recommended</p>
              </div>
            </label>
            <label className={[
              "card flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-all duration-200",
              form.securityLevel === "standard"
                ? "border-[var(--accent)] ring-1 ring-[var(--ring-color)]"
                : "",
            ].join(" ")}>
              <input
                type="radio"
                name="security"
                value="standard"
                checked={form.securityLevel === "standard"}
                onChange={() => onChange({ securityLevel: "standard" })}
                className="accent-[var(--accent)]"
              />
              <div>
                <p className="text-sm font-medium text-[var(--fg)]">Standard</p>
                <p className="text-xs text-[var(--muted)]">No TEE</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Model */}
      <div>
        <label htmlFor="model" className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
          Model
        </label>
        <input
          id="model"
          type="text"
          className="input text-sm font-mono"
          placeholder="e.g. llama3:8b"
          value={form.model}
          onChange={(e) => onChange({ model: e.target.value })}
          spellCheck={false}
        />
        <div className="flex gap-2 mt-2">
          {QUICK_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              className={[
                "btn btn-sm",
                form.model === m ? "btn-primary" : "btn-ghost",
              ].join(" ")}
              onClick={() => onChange({ model: m })}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between pt-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!canDeploy}
          onClick={onDeploy}
        >
          Deploy
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Deploy
// ---------------------------------------------------------------------------

function stepStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <IconCheck size={16} className="text-[var(--success)]" />;
    case "in_progress":
      return <IconLoader size={16} className="text-[var(--accent)]" />;
    case "failed":
      return <IconX size={16} className="text-[var(--error)]" />;
    default:
      return (
        <div className="w-4 h-4 rounded-full border border-[var(--border-color)]" />
      );
  }
}

function DeployStep({
  provisionSteps,
  setupSteps,
  error,
  endpoints,
  isComplete,
  isFailed,
  onNavigate,
}: {
  provisionSteps: StepProgress[];
  setupSteps: StepProgress[];
  error: string | null;
  endpoints: ServiceEndpoints | null;
  isComplete: boolean;
  isFailed: boolean;
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 animate-[slide-up_0.25s_ease-out]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">
          {isComplete ? "Deployment Complete" : isFailed ? "Deployment Failed" : "Deploying..."}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isComplete
            ? "Your private AI infrastructure is ready."
            : isFailed
              ? "An error occurred during provisioning."
              : "Setting up your private AI infrastructure. This may take several minutes."}
        </p>
      </div>

      {/* Progress steps */}
      <div className="card p-4">
        {provisionSteps.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
              Infrastructure
            </p>
            <div className="flex flex-col gap-1">
              {provisionSteps.map((s) => (
                <div
                  key={s.step}
                  className={[
                    "flex items-center gap-3 px-2 py-1.5 rounded transition-colors",
                    s.status === "in_progress" ? "bg-[var(--accent-subtle)]" : "",
                    s.status === "failed" ? "bg-[var(--error-subtle)]" : "",
                  ].join(" ")}
                >
                  {stepStatusIcon(s.status)}
                  <span className={[
                    "text-sm flex-1",
                    s.status === "pending" ? "text-[var(--muted)]" : "text-[var(--fg)]",
                  ].join(" ")}>
                    {s.label}
                  </span>
                  {s.detail && s.status !== "pending" && (
                    <span className="text-xs text-[var(--muted)] truncate max-w-48">
                      {s.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {setupSteps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
              Software Setup
            </p>
            <div className="flex flex-col gap-1">
              {setupSteps.map((s) => (
                <div
                  key={s.step}
                  className={[
                    "flex items-center gap-3 px-2 py-1.5 rounded transition-colors",
                    s.status === "in_progress" ? "bg-[var(--accent-subtle)]" : "",
                    s.status === "failed" ? "bg-[var(--error-subtle)]" : "",
                  ].join(" ")}
                >
                  {stepStatusIcon(s.status)}
                  <span className={[
                    "text-sm flex-1",
                    s.status === "pending" ? "text-[var(--muted)]" : "text-[var(--fg)]",
                  ].join(" ")}>
                    {s.label}
                  </span>
                  {s.detail && s.status !== "pending" && (
                    <span className="text-xs text-[var(--muted)] truncate max-w-48">
                      {s.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {provisionSteps.length === 0 && setupSteps.length === 0 && !isFailed && (
          <div className="flex items-center justify-center py-6">
            <IconLoader size={20} className="text-[var(--muted)]" />
            <span className="ml-2 text-sm text-[var(--muted)]">Initializing deployment...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {isFailed && error && (
        <div className="card border-[var(--error)] bg-[var(--error-subtle)] p-4">
          <div className="flex items-start gap-3">
            <IconAlert size={16} className="text-[var(--error)] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--error)]">Deployment failed</p>
              <p className="text-xs text-[var(--error)] mt-1 opacity-80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success endpoints */}
      {isComplete && endpoints && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
            Service Endpoints
          </p>
          {endpoints.ssh && (
            <div className="flex items-center gap-2 text-xs">
              <IconTerminal size={14} className="shrink-0 text-[var(--muted)]" />
              <code className="flex-1 truncate font-mono text-[var(--fg-secondary)]">
                {endpoints.ssh}
              </code>
              <CopyButton text={endpoints.ssh} />
            </div>
          )}
          {endpoints.ollama_api && (
            <div className="flex items-center gap-2 text-xs">
              <IconGlobe size={14} className="shrink-0 text-[var(--muted)]" />
              <a
                href={endpoints.ollama_api}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate font-mono text-[var(--accent)] hover:underline"
              >
                {endpoints.ollama_api}
              </a>
              <a
                href={endpoints.ollama_api}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                aria-label="Open Ollama API"
              >
                <IconExternalLink size={14} />
              </a>
            </div>
          )}

        </div>
      )}

      {/* Bottom actions */}
      {(isComplete || isFailed) && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate("dashboard")}
          >
            Go to Dashboard
            <IconChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export default function ProvisionWizard({ onNavigate }: ProvisionWizardProps) {
  // --- Wizard navigation ---
  const [step, setStep] = useState<WizardStep>(0);
  const completedSteps = useRef(new Set<number>());

  // --- Step 1: Provider ---
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);

  // --- Step 2: Credentials ---
  const [credForm, setCredForm] = useState<CredentialFormState>({
    subscription_id: "",
    tenant_id: "",
    client_id: "",
    client_secret: "",
    saveCredentials: false,
  });
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [validating, setValidating] = useState(false);

  // --- Step 3: Configuration ---
  const [configForm, setConfigForm] = useState<ConfigFormState>({
    region: "",
    vmSize: "",
    securityLevel: "confidential",
    model: "",
  });
  const [vmSizes, setVmSizes] = useState<VMSize[]>([]);
  const [vmSizesLoading, setVmSizesLoading] = useState(false);

  // --- Step 4: Deploy ---
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [provisionSteps, setProvisionSteps] = useState<StepProgress[]>([]);
  const [setupSteps, setSetupSteps] = useState<StepProgress[]>([]);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployEndpoints, setDeployEndpoints] = useState<ServiceEndpoints | null>(null);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // --- Load settings on mount ---
  useEffect(() => {
    const settings = getSettings();

    // Pre-fill credentials if saved
    if (settings.savedCredentials) {
      setCredForm((prev) => ({
        ...prev,
        subscription_id: settings.savedCredentials!.subscription_id,
        tenant_id: settings.savedCredentials!.tenant_id,
        client_id: settings.savedCredentials!.client_id,
        client_secret: settings.savedCredentials!.client_secret,
        saveCredentials: true,
      }));
    }

    // Pre-fill config defaults
    setConfigForm((prev) => ({
      ...prev,
      region: settings.defaultRegion || "eastus",
      model: settings.defaultModels?.[0] || "",
    }));
  }, []);

  // --- Load providers ---
  useEffect(() => {
    let cancelled = false;
    setProvidersLoading(true);
    setProvidersError(null);

    fetchProviders()
      .then((data) => {
        if (cancelled) return;
        setProviders(data);

        // Auto-select last used provider
        const settings = getSettings();
        const last = data.find((p) => p.id === settings.lastProvider);
        if (last) setSelectedProvider(last);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setProvidersError(err.message);
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // --- Load VM sizes when region changes ---
  useEffect(() => {
    if (!selectedProvider || !configForm.region) {
      setVmSizes([]);
      return;
    }

    let cancelled = false;
    setVmSizesLoading(true);

    fetchVMSizes(selectedProvider.id, configForm.region)
      .then((data) => {
        if (cancelled) return;
        setVmSizes(data);
        // Auto-select first if nothing selected
        if (data.length > 0 && !data.find((v) => v.id === configForm.vmSize)) {
          setConfigForm((prev) => ({ ...prev, vmSize: data[0].id }));
        }
      })
      .catch(() => {
        if (!cancelled) setVmSizes([]);
      })
      .finally(() => {
        if (!cancelled) setVmSizesLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedProvider, configForm.region]);

  // --- Cleanup websocket ---
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // --- Navigation helpers ---
  const goToStep = useCallback((target: WizardStep) => {
    setStep(target);
  }, []);

  const handleProviderSelect = useCallback((provider: ProviderInfo) => {
    setSelectedProvider(provider);
    saveSettings({ lastProvider: provider.id });
    completedSteps.current.add(0);
    goToStep(1);
  }, [goToStep]);

  const handleCredValidate = useCallback(async () => {
    if (!selectedProvider) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const creds: AzureCredentials = {
        provider: "azure",
        subscription_id: credForm.subscription_id,
        tenant_id: credForm.tenant_id,
        client_id: credForm.client_id,
        client_secret: credForm.client_secret,
      };
      const result = await validateCredentials(selectedProvider.id, creds);
      setValidationResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Validation failed";
      setValidationResult({ valid: false, message });
    } finally {
      setValidating(false);
    }
  }, [selectedProvider, credForm]);

  const handleCredNext = useCallback(() => {
    // Save credentials if checkbox is checked
    if (credForm.saveCredentials) {
      saveSettings({
        savedCredentials: {
          provider: "azure",
          subscription_id: credForm.subscription_id,
          tenant_id: credForm.tenant_id,
          client_id: credForm.client_id,
          client_secret: credForm.client_secret,
        },
      });
    } else {
      saveSettings({ savedCredentials: null });
    }
    completedSteps.current.add(1);
    goToStep(2);
  }, [credForm, goToStep]);

  const handleDeploy = useCallback(async () => {
    if (!selectedProvider) return;

    completedSteps.current.add(2);
    goToStep(3);

    const credentials: AzureCredentials = {
      provider: "azure",
      subscription_id: credForm.subscription_id,
      tenant_id: credForm.tenant_id,
      client_id: credForm.client_id,
      client_secret: credForm.client_secret,
    };

    const selectedVM = vmSizes.find((v) => v.id === configForm.vmSize);

    const config: DeploymentConfig = {
      provider: selectedProvider.id as CloudProvider,
      region: configForm.region,
      vm_name: `privateai-${Date.now().toString(36)}`,
      resource_group: `privateai-rg-${Date.now().toString(36)}`,
      vm_size: selectedVM?.vm_size ?? configForm.vmSize,
      gpu_enabled: (selectedVM?.gpus ?? 0) > 0,
      security_level: configForm.securityLevel,
      os_disk_size_gb: 128,
      data_disk_size_gb: 256,
      allowed_ssh_sources: ["*"],
      allowed_api_sources: ["*"],
      setup: {
        models: [configForm.model],
      },
      provider_options: {},
    };

    try {
      const result = await createDeployment(credentials, config);
      setDeploymentId(result.id);

      // Save to history immediately with pending status
      addDeploymentToHistory({
        id: result.id,
        name: config.vm_name,
        provider: config.provider,
        region: config.region,
        vm_size: config.vm_size,
        status: "provisioning",
        created_at: new Date().toISOString(),
        public_ip: "",
        endpoints: { ssh: null, ollama_api: null },
      });

      // Connect WebSocket for live progress
      const ws = connectDeploymentWS(result.id);
      wsRef.current = ws;

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as {
            status?: string;
            provision_steps?: StepProgress[];
            setup_steps?: StepProgress[];
            error?: string | null;
            error_detail?: string | null;
            endpoints?: ServiceEndpoints | null;
            public_ip?: string | null;
          };

          if (data.provision_steps) {
            setProvisionSteps(data.provision_steps);
          }
          if (data.setup_steps) {
            setSetupSteps(data.setup_steps);
          }
          if (data.endpoints) {
            setDeployEndpoints(data.endpoints);
          }

          if (data.status === "running") {
            setDeployComplete(true);
            // Update history with final data
            addDeploymentToHistory({
              id: result.id,
              name: config.vm_name,
              provider: config.provider,
              region: config.region,
              vm_size: config.vm_size,
              status: "running",
              created_at: new Date().toISOString(),
              public_ip: data.public_ip ?? "",
              endpoints: data.endpoints ?? { ssh: null, ollama_api: null },
            });
            ws.close();
          }

          if (data.status === "failed") {
            setDeployFailed(true);
            setDeployError(data.error ?? data.error_detail ?? "Unknown error");
            addDeploymentToHistory({
              id: result.id,
              name: config.vm_name,
              provider: config.provider,
              region: config.region,
              vm_size: config.vm_size,
              status: "failed",
              created_at: new Date().toISOString(),
              public_ip: "",
              endpoints: { ssh: null, ollama_api: null },
            });
            ws.close();
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        setDeployFailed(true);
        setDeployError("WebSocket connection lost. Check deployment status on the dashboard.");
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create deployment";
      setDeployFailed(true);
      setDeployError(message);
    }
  }, [selectedProvider, credForm, configForm, vmSizes, goToStep]);

  // --- Back navigation ---
  const handleBack = useCallback(
    (from: WizardStep) => {
      if (from === 0) {
        onNavigate("dashboard");
      } else {
        goToStep((from - 1) as WizardStep);
      }
    },
    [onNavigate, goToStep],
  );

  // --- Render ---
  return (
    <div className="flex flex-col items-center px-4 py-8 animate-[fade-in_0.2s_ease-out]">
      <div className="w-full max-w-[640px]">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--fg)]">New Deployment</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Configure and deploy a new private AI instance.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} completed={completedSteps.current} />

        {/* Step content */}
        {step === 0 && (
          <div>
            <ProviderStep
              providers={providers}
              loading={providersLoading}
              error={providersError}
              onSelect={handleProviderSelect}
            />
            <div className="flex pt-4">
              <button type="button" className="btn btn-ghost" onClick={() => handleBack(0)}>
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <CredentialsStep
            form={credForm}
            onChange={(update) => setCredForm((prev) => ({ ...prev, ...update }))}
            onValidate={handleCredValidate}
            validationResult={validationResult}
            validating={validating}
            onBack={() => handleBack(1)}
            onNext={handleCredNext}
          />
        )}

        {step === 2 && selectedProvider && (
          <ConfigStep
            provider={selectedProvider}
            form={configForm}
            onChange={(update) => setConfigForm((prev) => ({ ...prev, ...update }))}
            vmSizes={vmSizes}
            vmSizesLoading={vmSizesLoading}
            onBack={() => handleBack(2)}
            onDeploy={handleDeploy}
          />
        )}

        {step === 3 && (
          <DeployStep
            provisionSteps={provisionSteps}
            setupSteps={setupSteps}
            error={deployError}
            endpoints={deployEndpoints}
            isComplete={deployComplete}
            isFailed={deployFailed}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}
