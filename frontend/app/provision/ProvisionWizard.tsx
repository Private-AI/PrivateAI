"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectDeploymentWS,
  connectOpenWebuiToDeployment,
  createDeployment,
  fetchAccessibleVMSizes,
  fetchProviders,
  recommendVM,
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
  StepProgress,
  ServiceEndpoints,
  VMSize,
} from "@/app/lib/types";
import WizardStep1 from "./WizardStep1";
import WizardStep2, { type CredentialFormState } from "./WizardStep2";
import WizardStep3, { type ConfigFormState } from "./WizardStep3";
import WizardStep4 from "./WizardStep4";
import type { AzureCliResult } from "./AzureLoginOverlay";

type WizardStep = 0 | 1 | 2 | 3;

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

interface ProvisionWizardProps {
  onNavigate: (page: string) => void;
}

export default function ProvisionWizard({ onNavigate }: ProvisionWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);

  // Step 1: Provider
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);

  // Step 2: Credentials
  const [credForm, setCredForm] = useState<CredentialFormState>({
    subscription_id: "", tenant_id: "", client_id: "", client_secret: "", saveCredentials: true,
  });
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [validatedCredentialsKey, setValidatedCredentialsKey] = useState<string | null>(null);
  const [connectedVia, setConnectedVia] = useState<string | null>(null);

  // Step 3: Config
  const [configForm, setConfigForm] = useState<ConfigFormState>({
    region: "", vmSize: "", model: "", securityLevel: "standard",
  });
  const [vmSizes, setVmSizes] = useState<VMSize[]>([]);
  const [vmSizesLoading, setVmSizesLoading] = useState(false);
  const [vmSizeMessage, setVmSizeMessage] = useState<string | null>(null);

  const [validating, setValidating] = useState(false);

  // Step 4: Deploy
  const [provisionSteps, setProvisionSteps] = useState<StepProgress[]>([]);
  const [setupSteps, setSetupSteps] = useState<StepProgress[]>([]);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const deployedProviderRef = useRef<string>("Microsoft Azure");
  const deployedModelRef = useRef<string>("");

  const currentCredentials = buildAzureCredentials(credForm);
  const currentCredentialsKey = getCredentialKey(currentCredentials);
  const credentialsVerified = validatedCredentialsKey === currentCredentialsKey;
  const canProceedCreds = credentialsVerified && (validationResult?.valid === true);

  // Load saved settings
  useEffect(() => {
    const settings = getSettings();
    if (settings.savedCredentials) {
      setCredForm((prev) => ({
        ...prev,
        subscription_id: settings.savedCredentials!.subscription_id,
        tenant_id: settings.savedCredentials!.tenant_id,
        client_id: settings.savedCredentials!.client_id,
        client_secret: settings.savedCredentials!.client_secret,
      }));
    }
    setConfigForm((prev) => ({
      ...prev,
      region: settings.defaultRegion || "centralus",
      model: settings.defaultModels?.[0] || "",
    }));
  }, []);

  // Load providers
  useEffect(() => {
    let cancelled = false;
    setProvidersLoading(true);
    fetchProviders()
      .then((data) => {
        if (cancelled) return;
        setProviders(data);
        const settings = getSettings();
        const last = data.find((p) => p.id === settings.lastProvider);
        if (last) setSelectedProvider(last);
      })
      .catch((err: Error) => { if (!cancelled) setProvidersError(err.message); })
      .finally(() => { if (!cancelled) setProvidersLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load VM sizes when region or credentials change
  useEffect(() => {
    if (!selectedProvider || !configForm.region || !credentialsVerified) {
      setVmSizes([]);
      setVmSizeMessage(credentialsVerified ? null : "Validate credentials to load deployable VM sizes.");
      setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
      return;
    }
    let cancelled = false;
    setVmSizesLoading(true);
    setVmSizeMessage(null);
    fetchAccessibleVMSizes(selectedProvider.id, configForm.region, buildAzureCredentials(credForm))
      .then((data) => {
        if (cancelled) return;
        setVmSizes(data);
        const first = data.find((vm) => vm.available);
        if (!first) {
          setVmSizeMessage(`No deployable VM sizes in ${configForm.region} for this subscription.`);
          setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
          return;
        }
        if (!data.find((vm) => vm.id === configForm.vmSize && vm.available)) {
          setConfigForm((prev) => ({ ...prev, vmSize: first.id }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVmSizes([]);
          setVmSizeMessage(err instanceof Error ? err.message : "Failed to load VM sizes.");
          setConfigForm((prev) => (prev.vmSize ? { ...prev, vmSize: "" } : prev));
        }
      })
      .finally(() => { if (!cancelled) setVmSizesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, configForm.region, credentialsVerified, currentCredentialsKey]);

  // Cleanup websocket
  useEffect(() => {
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  // Handlers
  const handleProviderSelect = useCallback((provider: ProviderInfo) => {
    setSelectedProvider(provider);
    saveSettings({ lastProvider: provider.id });
    setStep(1);
  }, []);

  const handleCredChange = useCallback((update: Partial<CredentialFormState>) => {
    const touchesCreds = "subscription_id" in update || "tenant_id" in update || "client_id" in update || "client_secret" in update;
    if (touchesCreds) {
      setValidationResult(null);
      setValidatedCredentialsKey(null);
      setVmSizes([]);
      setVmSizeMessage(null);
      setConnectedVia(null);
    }
    setCredForm((prev) => ({ ...prev, ...update }));
  }, []);

  const handleAzureCliConnect = useCallback((result: AzureCliResult) => {
    const newForm: CredentialFormState = {
      subscription_id: result.subscription_id,
      tenant_id: result.tenant_id,
      client_id: result.client_id,
      client_secret: result.client_secret,
      saveCredentials: true,
    };
    setCredForm(newForm);
    const key = getCredentialKey(buildAzureCredentials(newForm));
    setValidatedCredentialsKey(key);
    setValidationResult({ valid: true, message: "Connected via Azure CLI" });
    setConnectedVia(result.user_name ?? result.display_name);
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnectedVia(null);
    setCredForm({ subscription_id: "", tenant_id: "", client_id: "", client_secret: "", saveCredentials: true });
    setValidationResult(null);
    setValidatedCredentialsKey(null);
  }, []);

  const handleCredNext = useCallback(() => {
    // Auto-validate if connected via CLI (already trusted)
    const effectiveKey = connectedVia ? getCredentialKey(buildAzureCredentials(credForm)) : validatedCredentialsKey;
    if (effectiveKey) {
      if (credForm.saveCredentials) {
        saveSettings({ savedCredentials: buildAzureCredentials(credForm) });
      }
    }
    setStep(2);
  }, [credForm, connectedVia, validatedCredentialsKey]);

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
    } catch { /* ignore */ }
  }, [selectedProvider, vmSizes]);

  const handleDeploy = useCallback(async () => {
    if (!selectedProvider) return;
    setStep(3);

    const credentials = currentCredentials;
    const selectedVM = vmSizes.find((v) => v.id === configForm.vmSize);
    const disks = diskSizesForVM(configForm.vmSize);
    deployedProviderRef.current = selectedProvider.display_name;
    deployedModelRef.current = configForm.model;

    const config: DeploymentConfig = {
      provider: selectedProvider.id as CloudProvider,
      region: configForm.region,
      vm_name: `privateai-${Date.now().toString(36)}`,
      resource_group: `privateai-rg-${Date.now().toString(36)}`,
      vm_size: selectedVM?.vm_size ?? configForm.vmSize,
      gpu_enabled: (selectedVM?.gpus ?? 0) > 0,
      security_level: "standard",
      os_disk_size_gb: disks.os,
      data_disk_size_gb: disks.data,
      allowed_ssh_sources: ["*"],
      allowed_api_sources: [],
      setup: { models: [configForm.model] },
      provider_options: {},
    };

    try {
      const result = await createDeployment(credentials, config);
      addDeploymentToHistory({
        id: result.id, name: config.vm_name, provider: config.provider, region: config.region,
        vm_size: config.vm_size, status: "provisioning", created_at: new Date().toISOString(),
        public_ip: "", endpoints: { ssh: null, ollama_api: null },
      });

      const hasDisk = disks.data > 0;
      setProvisionSteps([
        { step: "resource_group", label: "Reserving your private cloud space",  status: "pending", detail: "" },
        { step: "nsg",            label: "Locking down your AI server",          status: "pending", detail: "" },
        { step: "vnet",           label: "Building your private network",        status: "pending", detail: "" },
        { step: "public_ip",      label: "Getting your server online",           status: "pending", detail: "" },
        { step: "nic",            label: "Connecting the network",               status: "pending", detail: "" },
        { step: "vm",             label: "Booting up your AI server",            status: "pending", detail: "" },
        ...(hasDisk ? [{ step: "data_disk", label: "Adding storage for your models", status: "pending" as const, detail: "" }] : []),
      ]);
      setSetupSteps([
        { step: "connect",        label: "Securely connecting to your server",   status: "pending", detail: "" },
        { step: "update_system",  label: "Getting the system up to date",        status: "pending", detail: "" },
        { step: "mount_disk",     label: "Preparing storage for your AI",        status: "pending", detail: "" },
        { step: "nvidia_driver",  label: "Setting up GPU acceleration",          status: "pending", detail: "" },
        { step: "install_ollama", label: "Installing your AI engine",            status: "pending", detail: "" },
        { step: "pull_models",    label: `Downloading ${configForm.model}`,      status: "pending", detail: "" },
      ]);

      const ws = connectDeploymentWS(result.id);
      wsRef.current = ws;

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string; step?: string; status?: string; message?: string;
            error?: string | null; error_detail?: string | null;
            endpoints?: ServiceEndpoints | null; public_ip?: string | null;
          };

          if (data.type === "provision_progress" && data.step) {
            setProvisionSteps((prev) => prev.map((s) =>
              s.step === data.step ? { ...s, status: (data.status ?? "in_progress") as StepProgress["status"], detail: data.message ?? s.detail } : s
            ));
          }
          if (data.type === "setup_progress" && data.step) {
            setSetupSteps((prev) => prev.map((s) =>
              s.step === data.step ? { ...s, status: (data.status ?? "in_progress") as StepProgress["status"], detail: data.message ?? s.detail } : s
            ));
          }
          if (data.status === "running") {
            setDeployComplete(true);
            try {
              localStorage.setItem("_privateai_last_deploy", JSON.stringify({
                provider: deployedProviderRef.current,
                model: deployedModelRef.current,
              }));
            } catch {}
            addDeploymentToHistory({
              id: result.id, name: config.vm_name, provider: config.provider, region: config.region,
              vm_size: config.vm_size, status: "running", created_at: new Date().toISOString(),
              public_ip: data.public_ip ?? "", endpoints: data.endpoints ?? { ssh: null, ollama_api: null },
            });
            ws.close();

            // Navigate immediately — connection happens in background
            onNavigate("chat");
            connectOpenWebuiToDeployment(result.id, config.vm_name)
              .then((r) => {
                if (r.success && r.state?.url) {
                  try { localStorage.setItem("_privateai_chat_url", r.state.url); } catch {}
                }
              })
              .catch(() => {});
          }
          if (data.status === "failed") {
            setDeployFailed(true);
            setDeployError(data.error ?? data.error_detail ?? "Unknown error");
            addDeploymentToHistory({
              id: result.id, name: config.vm_name, provider: config.provider, region: config.region,
              vm_size: config.vm_size, status: "failed", created_at: new Date().toISOString(),
              public_ip: "", endpoints: { ssh: null, ollama_api: null },
            });
            ws.close();
          }
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => { setDeployFailed(true); setDeployError("WebSocket connection lost."); };
      ws.onclose = () => { wsRef.current = null; };
    } catch (err: unknown) {
      setDeployFailed(true);
      setDeployError(err instanceof Error ? err.message : "Failed to create deployment");
    }
  }, [selectedProvider, currentCredentials, configForm, vmSizes]);

  const handleValidateCredentials = useCallback(async () => {
    if (!selectedProvider) return;
    setValidating(true);
    try {
      const result = await validateCredentials(selectedProvider.id, currentCredentials);
      setValidationResult(result);
      setValidatedCredentialsKey(result.valid ? currentCredentialsKey : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Validation failed";
      setValidationResult({ valid: false, message: msg });
      setValidatedCredentialsKey(null);
    } finally {
      setValidating(false);
    }
  }, [selectedProvider, currentCredentials, currentCredentialsKey]);

  // Render
  if (step === 0) {
    return (
      <WizardStep1
        providers={providers}
        loading={providersLoading}
        error={providersError}
        selected={selectedProvider}
        onSelect={handleProviderSelect}
        onBack={() => onNavigate("dashboard")}
      />
    );
  }

  if (step === 1) {
    return (
      <WizardStep2
        form={credForm}
        onChange={handleCredChange}
        canProceed={canProceedCreds || !!connectedVia}
        connectedVia={connectedVia}
        onAzureCliConnect={handleAzureCliConnect}
        onDisconnect={handleDisconnect}
        onBack={() => setStep(0)}
        onNext={handleCredNext}
        onValidate={handleValidateCredentials}
        validating={validating}
        validationResult={validationResult}
      />
    );
  }

  if (step === 2 && selectedProvider) {
    return (
      <WizardStep3
        provider={selectedProvider}
        form={configForm}
        onChange={(update) => setConfigForm((prev) => ({ ...prev, ...update }))}
        vmSizes={vmSizes}
        vmSizesLoading={vmSizesLoading}
        vmSizeMessage={vmSizeMessage}
        onModelChange={handleModelChange}
        onBack={() => setStep(1)}
        onDeploy={handleDeploy}
      />
    );
  }

  return (
    <WizardStep4
      provisionSteps={provisionSteps}
      setupSteps={setupSteps}
      error={deployError}
      isComplete={deployComplete}
      isFailed={deployFailed}
      onComplete={() => onNavigate("chat")}
    />
  );
}
