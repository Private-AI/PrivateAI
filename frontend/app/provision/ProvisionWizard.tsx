"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconChat,
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
  fetchAccessibleVMSizes,
  fetchProviders,
  recommendVM,
  setupPermissions,
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

const QUICK_MODELS = ["tinyllama:1.1b", "gemma3:4b", "llama3:8b", "mistral:7b", "llama3:13b"];

/** Compute disk sizes appropriate for a VM profile ID. */
function diskSizesForVM(vmId: string): { os: number; data: number } {
  if (vmId === "micro-cpu" || vmId === "test-no-gpu") return { os: 32, data: 0 };
  if (vmId === "small-cpu") return { os: 32, data: 64 };
  if (vmId === "medium-cpu") return { os: 64, data: 128 };
  return { os: 128, data: 256 };
}

function buildAzureCredentials(form: CredentialFormState): AzureCredentials {
  return {
    provider: "azure",
    subscription_id: form.subscription_id,
    tenant_id: form.tenant_id,
    client_id: form.client_id,
    client_secret: form.client_secret,
  };
}

function getCredentialKey(credentials: AzureCredentials): string {
  return JSON.stringify(credentials);
}

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
  ssh_private_key: string;
  saveCredentials: boolean;
}

function CredentialsStep({
  form,
  onChange,
  onValidate,
  onSetupPermissions,
  validationResult,
  permissionsResult,
  validating,
  settingUpPermissions,
  onBack,
  onNext,
  canProceed,
}: {
  form: CredentialFormState;
  onChange: (update: Partial<CredentialFormState>) => void;
  onValidate: () => void;
  onSetupPermissions: () => void;
  validationResult: { valid: boolean; message: string } | null;
  permissionsResult: { success: boolean; message: string } | null;
  validating: boolean;
  settingUpPermissions: boolean;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
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

        {/* SSH Private Key */}
        <div>
          <label htmlFor="ssh_private_key" className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
            SSH Private Key
          </label>
          <textarea
            id="ssh_private_key"
            className="input font-mono text-sm w-full"
            rows={4}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
            value={form.ssh_private_key}
            onChange={(e) => onChange({ ssh_private_key: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Your SSH private key stays in your browser. It is never stored on the server.
          </p>
        </div>
      </div>

      {/* Validate + Setup Permissions */}
      <div className="flex flex-col gap-2">
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

        {/* Only show Setup Permissions once credentials are valid */}
        {validationResult?.valid && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={settingUpPermissions}
              onClick={onSetupPermissions}
              title="Register Microsoft.Network, Microsoft.Compute, and Microsoft.Storage providers"
            >
              {settingUpPermissions ? <IconLoader size={14} /> : <IconCheck size={14} />}
              Setup Azure Permissions
            </button>
            {permissionsResult && (
              <span className={permissionsResult.success ? "badge badge-success" : "badge badge-error"}>
                {permissionsResult.success ? (
                  <><IconCheck size={12} /> Permissions ready</>
                ) : (
                  <><IconX size={12} /> {permissionsResult.message}</>
                )}
              </span>
            )}
          </div>
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
        <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
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
  vmSizeMessage,
  onBack,
  onDeploy,
  onModelChange,
}: {
  provider: ProviderInfo;
  form: ConfigFormState;
  onChange: (update: Partial<ConfigFormState>) => void;
  vmSizes: VMSize[];
  vmSizesLoading: boolean;
  vmSizeMessage: string | null;
  onBack: () => void;
  onDeploy: () => void;
  onModelChange: (model: string) => void;
}) {
  const selectedVM = vmSizes.find((v) => v.id === form.vmSize);
  const canDeploy =
    form.region.length > 0 &&
    form.vmSize.length > 0 &&
    form.model.trim().length > 0 &&
    selectedVM?.available === true;

  return (
    <div className="flex flex-col gap-5 animate-[slide-up_0.25s_ease-out]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Configuration</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose a region, model, and VM. The app auto-selects the cheapest VM for your model.
        </p>
      </div>

      {/* Model first — drives VM recommendation */}
      <div>
        <label htmlFor="model" className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
          AI Model
        </label>
        <input
          id="model"
          type="text"
          className="input text-sm font-mono"
          placeholder="e.g. llama3:8b"
          value={form.model}
          onChange={(e) => onModelChange(e.target.value)}
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {QUICK_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              className={[
                "btn btn-sm",
                form.model === m ? "btn-primary" : "btn-ghost",
              ].join(" ")}
              onClick={() => onModelChange(m)}
            >
              {m}
            </button>
          ))}
        </div>
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
            {selectedVM && (
              <span className="ml-2 font-normal text-[var(--accent)]">
                ~${selectedVM.cost_per_hour.toFixed(2)}/hr
              </span>
            )}
          </label>
          {vmSizesLoading && <IconLoader size={14} className="text-[var(--muted)]" />}
        </div>
        {vmSizes.length === 0 && !vmSizesLoading && form.region && (
          <p className="text-xs text-[var(--muted)] py-2">
            {vmSizeMessage ?? "No VM sizes available for this region."}
          </p>
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
                "card p-3 text-left transition-all duration-200",
                vm.available ? "cursor-pointer" : "opacity-55 cursor-not-allowed",
                form.vmSize === vm.id
                  ? "border-[var(--accent)] ring-1 ring-[var(--ring-color)]"
                  : "",
              ].join(" ")}
              disabled={!vm.available}
              onClick={() => onChange({ vmSize: vm.id })}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--fg)]">{vm.display_name}</p>
                  {!vm.available && <span className="badge badge-error">Unavailable</span>}
                </div>
                <span className="text-xs font-medium text-[var(--accent)]">
                  ${vm.cost_per_hour.toFixed(2)}/hr
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                {vm.gpu_model && vm.gpu_model !== "None" && <span>{vm.gpu_model}</span>}
                <span>{vm.vcpus} vCPUs</span>
                <span>{vm.memory_gb} GB RAM</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{vm.description}</p>
              {!vm.available && vm.availability_reason && (
                <p className="mt-2 text-xs text-[var(--error)]">{vm.availability_reason}</p>
              )}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          VM auto-selected based on model size. Traffic to Ollama is encrypted via SSH tunnel.
        </p>
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

      {/* Success state */}
      {isComplete && (
        <div className="flex flex-col gap-3">
          {/* Chat CTA */}
          <div className="card p-4 flex flex-col gap-3 border-[var(--accent)] bg-[var(--accent-subtle)]">
            <p className="text-sm font-semibold text-[var(--fg)]">Your private AI is ready</p>
            <p className="text-xs text-[var(--muted)]">
              Open WebUI is running and connected to Ollama via SSH tunnel. Click below to start chatting.
            </p>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => onNavigate("dashboard")}
            >
              <IconChat size={14} />
              Connect &amp; Chat
            </button>
          </div>

          {/* SSH access (collapsed/secondary) */}
          {endpoints?.ssh && (
            <div className="flex items-center gap-2 text-xs px-1">
              <IconTerminal size={14} className="shrink-0 text-[var(--muted)]" />
              <code className="flex-1 truncate font-mono text-[var(--muted)]">
                {endpoints.ssh}
              </code>
              <CopyButton text={endpoints.ssh} />
            </div>
          )}
        </div>
      )}

      {/* Bottom actions */}
      {(isComplete || isFailed) && (
        <div className="flex justify-end pt-2">
          {isFailed && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate("dashboard")}
            >
              Go to Dashboard
              <IconChevronRight size={14} />
            </button>
          )}
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
    ssh_private_key: "",
    saveCredentials: false,
  });
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [validatedCredentialsKey, setValidatedCredentialsKey] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [permissionsResult, setPermissionsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [settingUpPermissions, setSettingUpPermissions] = useState(false);

  // --- Step 3: Configuration ---
  const [configForm, setConfigForm] = useState<ConfigFormState>({
    region: "",
    vmSize: "",
    securityLevel: "standard",
    model: "",
  });
  const [vmSizes, setVmSizes] = useState<VMSize[]>([]);
  const [vmSizesLoading, setVmSizesLoading] = useState(false);
  const [vmSizeMessage, setVmSizeMessage] = useState<string | null>(null);

  // --- Step 4: Deploy ---
  const [provisionSteps, setProvisionSteps] = useState<StepProgress[]>([]);
  const [setupSteps, setSetupSteps] = useState<StepProgress[]>([]);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployEndpoints, setDeployEndpoints] = useState<ServiceEndpoints | null>(null);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const currentCredentials = buildAzureCredentials(credForm);
  const currentCredentialsKey = getCredentialKey(currentCredentials);
  const credentialsVerified = validatedCredentialsKey === currentCredentialsKey;

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
      region: settings.defaultRegion || "centralus",
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
      setVmSizeMessage(null);
      setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
      return;
    }

    if (!credentialsVerified) {
      setVmSizes([]);
      setVmSizeMessage("Validate credentials to load deployable VM sizes for this region.");
      setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
      return;
    }

    let cancelled = false;
    setVmSizesLoading(true);
    setVmSizeMessage(null);
    const regionCredentials = buildAzureCredentials(credForm);

    fetchAccessibleVMSizes(selectedProvider.id, configForm.region, regionCredentials)
      .then((data) => {
        if (cancelled) return;
        setVmSizes(data);
        const firstAvailable = data.find((vm) => vm.available);
        if (!firstAvailable) {
          setVmSizeMessage(
            `No deployable VM sizes are available in ${configForm.region} for this subscription.`,
          );
          setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
          return;
        }

        if (!data.find((vm) => vm.id === configForm.vmSize && vm.available)) {
          setConfigForm((prev) => ({ ...prev, vmSize: firstAvailable.id }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVmSizes([]);
          setVmSizeMessage(
            err instanceof Error ? err.message : "Failed to load deployable VM sizes.",
          );
          setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
        }
      })
      .finally(() => {
        if (!cancelled) setVmSizesLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedProvider, configForm.region, configForm.vmSize, credForm, credentialsVerified, currentCredentialsKey]);

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
    setPermissionsResult(null);
    try {
      const result = await validateCredentials(selectedProvider.id, currentCredentials);
      setValidationResult(result);
      setValidatedCredentialsKey(result.valid ? currentCredentialsKey : null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Validation failed";
      setValidationResult({ valid: false, message });
      setValidatedCredentialsKey(null);
    } finally {
      setValidating(false);
    }
  }, [selectedProvider, currentCredentials, currentCredentialsKey]);

  const handleSetupPermissions = useCallback(async () => {
    if (!selectedProvider) return;
    setSettingUpPermissions(true);
    setPermissionsResult(null);
    try {
      const result = await setupPermissions(selectedProvider.id, currentCredentials);
      setPermissionsResult({ success: result.success, message: result.message });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Permission setup failed";
      setPermissionsResult({ success: false, message });
    } finally {
      setSettingUpPermissions(false);
    }
  }, [selectedProvider, currentCredentials]);

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

    const credentials = currentCredentials;

    const selectedVM = vmSizes.find((v) => v.id === configForm.vmSize);
    const disks = diskSizesForVM(configForm.vmSize);

    const config: DeploymentConfig = {
      provider: selectedProvider.id as CloudProvider,
      region: configForm.region,
      vm_name: `privateai-${Date.now().toString(36)}`,
      resource_group: `privateai-rg-${Date.now().toString(36)}`,
      vm_size: selectedVM?.vm_size ?? configForm.vmSize,
      gpu_enabled: (selectedVM?.gpus ?? 0) > 0,
      security_level: "standard",   // Always TrustedLaunch — no TEE
      os_disk_size_gb: disks.os,
      data_disk_size_gb: disks.data,
      allowed_ssh_sources: ["*"],
      allowed_api_sources: [],       // Ollama not exposed publicly; only SSH
      setup: {
        models: [configForm.model],
      },
      provider_options: {
        ssh_key_path: credForm.ssh_private_key ? "/tmp/privateai_ssh_key" : "~/.ssh/id_ed25519",
      },
    };

    try {
      const result = await createDeployment(credentials, config);

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

      // Pre-populate step lists so the UI shows pending steps immediately
      const hasDisk = disks.data > 0;
      setProvisionSteps([
        { step: "resource_group", label: "Creating resource group",         status: "pending", detail: "" },
        { step: "nsg",            label: "Creating security group",          status: "pending", detail: "" },
        { step: "vnet",           label: "Creating virtual network",         status: "pending", detail: "" },
        { step: "public_ip",      label: "Allocating public IP",             status: "pending", detail: "" },
        { step: "nic",            label: "Creating network interface",       status: "pending", detail: "" },
        { step: "vm",             label: "Creating virtual machine",         status: "pending", detail: "" },
        ...(hasDisk ? [{ step: "data_disk", label: "Attaching data disk",   status: "pending" as const, detail: "" }] : []),
      ]);
      setSetupSteps([
        { step: "connect",        label: "Connecting via SSH",               status: "pending", detail: "" },
        { step: "update_system",  label: "Updating system packages",         status: "pending", detail: "" },
        { step: "mount_disk",     label: "Preparing model storage",          status: "pending", detail: "" },
        { step: "nvidia_driver",  label: "NVIDIA driver (skipped on CPU)",   status: "pending", detail: "" },
        { step: "install_ollama", label: "Installing Ollama",                status: "pending", detail: "" },
        { step: "pull_models",    label: `Pulling ${config.setup?.models?.join(", ") ?? "models"}`, status: "pending", detail: "" },
      ]);

      // Connect WebSocket for live progress
      const ws = connectDeploymentWS(result.id);
      wsRef.current = ws;

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            step?: string;
            status?: string;
            message?: string;
            error?: string | null;
            error_detail?: string | null;
            endpoints?: ServiceEndpoints | null;
            public_ip?: string | null;
          };

          // Individual step progress (provision phase)
          if (data.type === "provision_progress" && data.step) {
            setProvisionSteps(prev => prev.map(s =>
              s.step === data.step
                ? { ...s, status: (data.status ?? "in_progress") as StepProgress["status"], detail: data.message ?? s.detail }
                : s
            ));
          }

          // Individual step progress (setup phase)
          if (data.type === "setup_progress" && data.step) {
            setSetupSteps(prev => prev.map(s =>
              s.step === data.step
                ? { ...s, status: (data.status ?? "in_progress") as StepProgress["status"], detail: data.message ?? s.detail }
                : s
            ));
          }

          if (data.type === "provision_complete" || data.endpoints) {
            if (data.endpoints) setDeployEndpoints(data.endpoints);
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
  }, [selectedProvider, currentCredentials, configForm, vmSizes, goToStep]);

  // --- Model change with VM auto-recommendation ---
  const handleModelChange = useCallback(async (model: string) => {
    setConfigForm((prev) => ({ ...prev, model }));
    if (!model.trim() || !selectedProvider) return;
    try {
      const rec = await recommendVM(selectedProvider.id, model);
      setConfigForm((prev) => {
        const match = vmSizes.find((v) => v.id === rec.vm_profile_id && v.available);
        if (!match) return { ...prev, model };
        return { ...prev, model, vmSize: rec.vm_profile_id };
      });
    } catch {
      // Silently ignore — user can still select VM manually
    }
  }, [selectedProvider, vmSizes]);

  const handleCredentialChange = useCallback((update: Partial<CredentialFormState>) => {
    const touchesCredentials =
      "subscription_id" in update ||
      "tenant_id" in update ||
      "client_id" in update ||
      "client_secret" in update;

    if (touchesCredentials) {
      setValidationResult(null);
      setPermissionsResult(null);
      setValidatedCredentialsKey(null);
      setVmSizes([]);
      setVmSizeMessage(null);
    }

    setCredForm((prev) => ({ ...prev, ...update }));
  }, []);

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
            onChange={handleCredentialChange}
            onValidate={handleCredValidate}
            onSetupPermissions={handleSetupPermissions}
            validationResult={validationResult}
            permissionsResult={permissionsResult}
            validating={validating}
            settingUpPermissions={settingUpPermissions}
            onBack={() => handleBack(1)}
            onNext={handleCredNext}
            canProceed={credentialsVerified && validationResult?.valid === true}
          />
        )}

        {step === 2 && selectedProvider && (
          <ConfigStep
            provider={selectedProvider}
            form={configForm}
            onChange={(update) => setConfigForm((prev) => ({ ...prev, ...update }))}
            vmSizes={vmSizes}
            vmSizesLoading={vmSizesLoading}
            vmSizeMessage={vmSizeMessage}
            onBack={() => handleBack(2)}
            onDeploy={handleDeploy}
            onModelChange={handleModelChange}
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
