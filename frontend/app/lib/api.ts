import type {
  AzureCredentials,
  BudgetConfig,
  CostAlert,
  CostReport,
  Deployment,
  DeploymentConfig,
  OpenWebuiEnvConfig,
  OpenWebuiState,
  ProviderInfo,
  ServiceEndpoints,
  VMSize,
} from "./types";

// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const WS_URL = API_URL.replace(/^http/, "ws");

const V1 = "/api/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${V1}${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = await res.json();
      detail = body.detail ?? body.message ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

/** Request without the /api/v1 prefix (for root-level endpoints). */
async function requestRoot<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = await res.json();
      detail = body.detail ?? body.message ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function fetchHealth(): Promise<{ status: string; test_mode: boolean }> {
  return requestRoot("/health");
}

// ---------------------------------------------------------------------------
// Providers & VM sizes
// ---------------------------------------------------------------------------

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const data = await request<{ providers: ProviderInfo[] }>("/providers");
  return data.providers;
}

export async function fetchVMSizes(
  provider: string,
  region?: string,
): Promise<VMSize[]> {
  const params = new URLSearchParams();
  if (region) params.set("region", region);
  const qs = params.toString();
  const data = await request<{ vm_sizes: VMSize[] }>(
    `/providers/${provider}/vm-sizes${qs ? `?${qs}` : ""}`,
  );
  return data.vm_sizes;
}

// ---------------------------------------------------------------------------
// Credentials validation
// ---------------------------------------------------------------------------

export function validateCredentials(
  provider: string,
  credentials: AzureCredentials,
): Promise<{ valid: boolean; message: string }> {
  return request(`/providers/${provider}/validate-credentials`, {
    method: "POST",
    body: JSON.stringify({ credentials }),
  });
}

// ---------------------------------------------------------------------------
// Deployments – CRUD & lifecycle
// ---------------------------------------------------------------------------

export function createDeployment(
  credentials: AzureCredentials,
  config: DeploymentConfig,
): Promise<{ id: string; status: string }> {
  return request("/deployments", {
    method: "POST",
    body: JSON.stringify({ credentials, config }),
  });
}

export async function fetchDeployments(): Promise<Deployment[]> {
  const data = await request<{ deployments: Deployment[] }>("/deployments");
  return data.deployments;
}

export function fetchDeployment(id: string): Promise<Deployment> {
  return request(`/deployments/${id}`);
}

export function fetchDeploymentLive(id: string): Promise<Deployment> {
  return request(`/deployments/${id}/live`);
}

export function startDeployment(
  id: string,
): Promise<{
  success: boolean;
  status: string;
  message: string;
  public_ip: string;
}> {
  return request(`/deployments/${id}/start`, { method: "POST" });
}

export function stopDeployment(
  id: string,
): Promise<{ success: boolean; status: string; message: string }> {
  return request(`/deployments/${id}/stop`, { method: "POST" });
}

export function destroyDeployment(
  id: string,
): Promise<{ success: boolean; status: string; message: string }> {
  return request(`/deployments/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Auto-shutdown
// ---------------------------------------------------------------------------

export function setAutoShutdown(
  id: string,
  timeUtc: string,
): Promise<{ success: boolean; message: string }> {
  return request(`/deployments/${id}/auto-shutdown`, {
    method: "POST",
    body: JSON.stringify({ time_utc: timeUtc }),
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function fetchServices(id: string): Promise<ServiceEndpoints> {
  const data = await request<{ endpoints: ServiceEndpoints }>(
    `/deployments/${id}/services`,
  );
  return data.endpoints;
}

// ---------------------------------------------------------------------------
// Cost monitoring
// ---------------------------------------------------------------------------

export async function fetchBudget(): Promise<BudgetConfig> {
  const data = await request<{ budget: BudgetConfig }>("/cost/budget");
  return data.budget;
}

export function setBudget(
  budget: BudgetConfig,
): Promise<{ success: boolean; message: string; budget: BudgetConfig }> {
  return request("/cost/budget", {
    method: "POST",
    body: JSON.stringify({ budget }),
  });
}

export async function fetchCostReport(): Promise<CostReport> {
  const data = await request<{ report: CostReport }>("/cost/report");
  return data.report;
}

export async function fetchCostAlerts(): Promise<CostAlert[]> {
  const data = await request<{ alerts: CostAlert[] }>("/cost/alerts");
  return data.alerts;
}

export function setDeploymentBudget(
  deploymentId: string,
  maxSpendUsd: number,
): Promise<{ success: boolean; message: string }> {
  return request(`/cost/deployments/${deploymentId}/budget`, {
    method: "POST",
    body: JSON.stringify({ max_spend_usd: maxSpendUsd }),
  });
}

export function acknowledgeAlert(
  alertId: string,
): Promise<{ success: boolean; message: string }> {
  return request(`/cost/alerts/${alertId}/acknowledge`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Open WebUI (local)
// ---------------------------------------------------------------------------

export async function fetchOpenWebuiStatus(): Promise<OpenWebuiState> {
  const data = await request<{ state: OpenWebuiState }>("/open-webui/status");
  return data.state;
}

export async function fetchOpenWebuiHealth(): Promise<{
  healthy: boolean;
  status: string;
  url: string;
}> {
  return request("/open-webui/health");
}

export async function startOpenWebui(
  config?: OpenWebuiEnvConfig,
): Promise<{ success: boolean; message: string; state: OpenWebuiState }> {
  return request("/open-webui/start", {
    method: "POST",
    body: JSON.stringify(config ? { config } : {}),
  });
}

export async function stopOpenWebui(): Promise<{
  success: boolean;
  message: string;
}> {
  return request("/open-webui/stop", { method: "POST" });
}

export async function restartOpenWebui(
  config?: OpenWebuiEnvConfig,
): Promise<{ success: boolean; message: string; state: OpenWebuiState }> {
  return request("/open-webui/restart", {
    method: "POST",
    body: JSON.stringify(config ? { config } : {}),
  });
}

export async function connectOpenWebuiToDeployment(
  deploymentId: string,
  deploymentName: string,
  ollamaUrl: string,
): Promise<{ success: boolean; message: string; state: OpenWebuiState }> {
  return request("/open-webui/connect", {
    method: "POST",
    body: JSON.stringify({
      deployment_id: deploymentId,
      deployment_name: deploymentName,
      ollama_url: ollamaUrl,
    }),
  });
}

export async function fetchOpenWebuiConfig(): Promise<OpenWebuiEnvConfig> {
  const data = await request<{ config: OpenWebuiEnvConfig }>("/open-webui/config");
  return data.config;
}

export async function updateOpenWebuiConfig(
  config: OpenWebuiEnvConfig,
): Promise<{
  success: boolean;
  message: string;
  config: OpenWebuiEnvConfig;
  restarted: boolean;
}> {
  return request("/open-webui/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export function connectDeploymentWS(id: string): WebSocket {
  const url = `${WS_URL}${V1}/deployments/${id}/ws`;
  return new WebSocket(url);
}
