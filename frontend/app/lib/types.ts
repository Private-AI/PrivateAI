// ---------------------------------------------------------------------------
// Types mirroring the backend Pydantic models
// ---------------------------------------------------------------------------

export type DeploymentStatus =
  | "pending"
  | "provisioning"
  | "configuring"
  | "running"
  | "stopping"
  | "stopped"
  | "starting"
  | "destroying"
  | "destroyed"
  | "failed";

export type SecurityLevel = "standard" | "confidential";

export type CloudProvider = "azure" | "gcp" | "aws";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface AzureCredentials {
  provider: "azure";
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
}

// ---------------------------------------------------------------------------
// Setup & deployment configuration
// ---------------------------------------------------------------------------

export interface SetupConfig {
  models: string[];
}

export interface DeploymentConfig {
  provider: CloudProvider;
  region: string;
  vm_name: string;
  resource_group: string;
  vm_size: string;
  gpu_enabled: boolean;
  security_level: SecurityLevel;
  os_disk_size_gb: number;
  data_disk_size_gb: number;
  allowed_ssh_sources: string[];
  allowed_api_sources: string[];
  setup: SetupConfig;
  provider_options: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Progress & endpoints
// ---------------------------------------------------------------------------

export interface StepProgress {
  step: string;
  label: string;
  status: string;
  detail: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ServiceEndpoints {
  ssh: string | null;
  ollama_api: string | null;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export interface Deployment {
  id: string;
  status: DeploymentStatus;
  config: DeploymentConfig;
  created_at: string;
  updated_at: string;
  public_ip: string | null;
  vm_id: string | null;
  provision_steps: StepProgress[];
  setup_steps: StepProgress[];
  endpoints: ServiceEndpoints | null;
  error: string | null;
  error_detail: string | null;
  provider_metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

export interface ProviderRegion {
  id: string;
  name: string;
}

export interface ProviderInfo {
  id: string;
  display_name: string;
  regions: ProviderRegion[];
}

export interface VMSize {
  id: string;
  display_name: string;
  vm_size: string;
  gpus: number;
  gpu_model: string | null;
  vcpus: number;
  memory_gb: number;
  confidential: boolean;
  description: string;
  cost_per_hour: number;
}

// ---------------------------------------------------------------------------
// Cost monitoring
// ---------------------------------------------------------------------------

export type BudgetAction = "alert" | "stop" | "destroy";

export type CostAlertLevel = "info" | "warning" | "critical";

export interface BudgetThreshold {
  percent: number;
  action: BudgetAction;
  triggered: boolean;
  triggered_at: string | null;
}

export interface BudgetConfig {
  max_total_spend_usd: number;
  max_per_deployment_spend_usd: number;
  max_hourly_rate_usd: number;
  thresholds: BudgetThreshold[];
  enabled: boolean;
}

export interface CostReportDeployment {
  deployment_id: string;
  vm_name: string;
  vm_size: string;
  cost_per_hour: number;
  accrued_cost_usd: number;
  is_running: boolean;
  started_at: string | null;
  per_deployment_limit_usd: number;
}

export interface CostReport {
  total_accrued_usd: number;
  total_hourly_rate_usd: number;
  budget: BudgetConfig;
  deployments: CostReportDeployment[];
  alerts: CostAlert[];
  budget_remaining_usd: number | null;
  estimated_hours_remaining: number | null;
  percent_used: number;
}

export interface CostAlert {
  id: string;
  level: CostAlertLevel;
  deployment_id: string;
  message: string;
  threshold_percent: number;
  current_spend_usd: number;
  budget_limit_usd: number;
  action_taken: BudgetAction;
  created_at: string;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Open WebUI (local)
// ---------------------------------------------------------------------------

export type OpenWebuiStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error"
  | "not_installed";

export interface OpenWebuiEnvConfig {
  ollama_base_urls: string;
  port: number;
  data_dir: string;
  webui_name: string;
  webui_auth: boolean;
  enable_signup: boolean;
  default_models: string;
  webui_secret_key: string;
  enable_rag: boolean;
}

export interface OpenWebuiState {
  status: OpenWebuiStatus;
  pid: number | null;
  url: string;
  config: OpenWebuiEnvConfig;
  error: string;
  uptime_seconds: number;
  venv_path: string;
  installed: boolean;
  connected_deployment_id: string;
  connected_deployment_name: string;
}
