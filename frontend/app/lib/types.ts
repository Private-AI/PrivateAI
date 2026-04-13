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
  deploy_open_webui: boolean;
  open_webui_port: number;
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
  open_webui: string | null;
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
}
