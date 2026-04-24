# PrivateAI Backend API Specification

**Version:** 0.2.0
**Base URL:** `http://localhost:8000`
**Protocol:** HTTP/1.1 + WebSocket
**Content-Type:** `application/json`
**Interactive docs:** `GET /docs` (Swagger UI) · `GET /openapi.json`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication & Credentials](#authentication--credentials)
3. [Endpoints](#endpoints)
   - [Health](#health)
   - [Azure CLI device-code auth](#azure-cli-device-code-auth)
   - [Providers](#providers)
   - [Deployments](#deployments)
   - [Lifecycle](#lifecycle)
   - [Bulk cleanup](#bulk-cleanup)
   - [VM Setup](#vm-setup)
   - [Validation](#validation)
   - [Services](#services)
   - [Model management](#model-management)
   - [Open WebUI](#open-webui)
   - [Cost & Budget](#cost--budget)
   - [WebSocket](#websocket)
4. [Data Models](#data-models)
5. [Provisioning Flow](#provisioning-flow)
6. [Error Handling](#error-handling)
7. [Adding a New Cloud Provider](#adding-a-new-cloud-provider)

---

## Architecture Overview

```
┌──────────────────────┐          ┌──────────────────────────────────────┐
│   Electron + Next.js │          │          FastAPI Backend             │
│     Frontend         │          │                                      │
│                      │  POST    │  /api/v1/azure/cli/*   ◄── NEW       │
│  Azure CLI Wizard ───┼─────────►│    ├── AzureCliAuthManager           │
│                      │          │    │     └── az login / create-sp    │
│  Config Form ────────┼─────────►│  /api/v1/deployments                 │
│                      │          │    ├── Orchestrator                  │
│  Progress Panel ◄────┼──── WS ──│    │     ├── DeploymentStore          │
│                      │          │    │     └── CloudProvider(azure)    │
│  Management Panel ───┼─────────►│    │           ├── provision()        │
│                      │  REST    │    │           ├── setup_vm()        │
│  Service Links ◄─────┼──────────│    │           └── start/stop/destroy │
└──────────────────────┘          └──────────────────────────────────────┘
```

The backend follows a **provider pattern** — all cloud-specific logic lives behind
an abstract `CloudProvider` interface.  Currently Azure is implemented; GCP and
AWS can be added by implementing the same interface.

The frontend sends a **single JSON** with the full deployment configuration and
cloud credentials when the user clicks "Provision".  Progress is streamed
back over a WebSocket connection.

**New in 0.2.0:** Azure credentials can be produced automatically by the
`/api/v1/azure/cli/*` endpoints using a browser-based device-code login flow,
so the user no longer has to create a Service Principal manually in the Azure
portal.

---

## Authentication & Credentials

Credentials are sent **per-request** in the JSON body (not as headers or cookies).
They are held in memory for the duration of the deployment and persisted to
`/app/open-webui-data/deployments.json` alongside the deployment records so the
app can recover across restarts. The most recently validated provider
credentials are also cached by the backend as the active credentials for that
provider, which lifecycle and status endpoints prefer over stale per-deployment
values.

There are two ways to obtain Azure credentials:

1. **Manual** — user creates a Service Principal in the Azure portal and types
   the four values into the credentials form. Used by the legacy credentials
   step of the wizard.
2. **Automated (recommended)** — user clicks "Connect to Azure". The backend
   drives `az login --use-device-code` and `az ad sp create-for-rbac` to
   produce the credentials with no manual portal steps. See
   [Azure CLI device-code auth](#azure-cli-device-code-auth).

### Azure Credentials

| Field             | Type      | Required | Description                           |
|-------------------|-----------|----------|---------------------------------------|
| `provider`        | `"azure"` | Yes      | Discriminator field                   |
| `subscription_id` | `string`  | Yes      | Azure subscription UUID (36 chars)    |
| `tenant_id`       | `string`  | Yes      | Azure AD tenant UUID (36 chars)       |
| `client_id`       | `string`  | Yes      | Service principal app client UUID     |
| `client_secret`   | `string`  | Yes      | Service principal secret (write-only) |

### GCP Credentials (future)

| Field                  | Type      | Required | Description                |
|------------------------|-----------|----------|----------------------------|
| `provider`             | `"gcp"`   | Yes      | Discriminator field        |
| `project_id`           | `string`  | Yes      | GCP project ID             |
| `service_account_json` | `string`  | Yes      | Service account key JSON   |

### AWS Credentials (future)

| Field               | Type      | Required | Description            |
|---------------------|-----------|----------|------------------------|
| `provider`          | `"aws"`   | Yes      | Discriminator field    |
| `access_key_id`     | `string`  | Yes      | AWS access key ID      |
| `secret_access_key` | `string`  | Yes      | AWS secret access key  |
| `region`            | `string`  | No       | Default: `us-east-1`   |

---

## Endpoints

### Health

#### `GET /`

Root endpoint — confirms the backend is running.

**Response:** `200 OK`
```json
{
  "message": "PrivateAI Backend is running",
  "version": "0.2.0",
  "docs": "/docs"
}
```

#### `GET /health`

Health check for monitoring / load balancers.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "test_mode": false
}
```

---

### Azure CLI device-code auth

A four-endpoint flow that lets the frontend produce a Service Principal without
asking the user to touch the Azure portal. Internally the backend drives the
`az` CLI binary (installed in the Docker image via the official Microsoft apt
repo) with an isolated `AZURE_CONFIG_DIR` per session. See
[`docs/azure_cli_frontend_integration.md`](azure_cli_frontend_integration.md)
for the full UX walkthrough.

**Session lifecycle:** Each call to `/login/start` creates a new session id.
Subsequent calls on the same flow must pass the same `session_id`.
Sessions idle for more than 30 minutes are garbage-collected automatically.

#### `POST /api/v1/azure/cli/login/start`

Starts `az login --use-device-code` in the background and returns the device
code + verification URL for the user to open in their browser.

The response is returned as soon as the CLI emits the device code line (~1 s).
The subprocess continues running until the user authenticates in the browser
or `/login/cancel` is called.

**Request body:** none.

**Response:** `200 OK`
```json
{
  "session_id": "43834da785ca41bda7a88ce7521f232f",
  "verification_url": "https://login.microsoft.com/device",
  "user_code": "PNQFW8L4H",
  "message": "To sign in, use a web browser to open the page https://login.microsoft.com/device and enter the code PNQFW8L4H to authenticate."
}
```

**Errors:**

| Status | Meaning |
|--------|---------|
| `503`  | The `az` binary is not available in the container (rebuild the Docker image). |
| `500`  | The CLI did not emit a device code within 30 s, or a lower-level subprocess error. |

#### `GET /api/v1/azure/cli/login/status`

Non-blocking poll of the device-code login flow.  Call this every 2–3 seconds
after `/login/start`.

**Query parameters:**

| Param        | Type   | Required | Description                            |
|--------------|--------|----------|----------------------------------------|
| `session_id` | string | Yes      | Session id returned by `/login/start`  |

**Response:** `200 OK`
```json
{
  "session_id": "43834da785ca41bda7a88ce7521f232f",
  "status": "authenticated",
  "subscription_id": "12345678-1234-1234-1234-123456789012",
  "subscription_name": "Pay-As-You-Go",
  "tenant_id": "00000000-0000-0000-0000-000000000000",
  "user_name": "user@example.com",
  "error": ""
}
```

Status values:

| Value           | Meaning                                                          |
|-----------------|------------------------------------------------------------------|
| `pending`       | Subprocess still running, awaiting the user.                     |
| `authenticated` | User completed login, SP not yet created.                        |
| `provisioned`   | SP has been created via `/provision` on this session.            |
| `failed`        | Login failed (user cancelled, code expired, CLI error).          |
| `expired`       | Session was garbage-collected (idle > 30 min).                   |

**Errors:**

| Status | Meaning |
|--------|---------|
| `404`  | `session_id` unknown or already cancelled / expired. |

#### `POST /api/v1/azure/cli/provision`

Create an Azure App Registration + Client Secret + Contributor role
assignment in a single atomic call. Must be called after `/login/status`
reports `authenticated`.

On success, the returned `AzureCredentials` are **also persisted** by the
backend as the active Azure provider credentials, so the subsequent
`/api/v1/providers/azure/*` and `/api/v1/deployments` calls don't need the
frontend to re-send them (though sending them is still supported and is the
source of truth if the frontend decides to).

Calling this twice with the same `session_id` is idempotent — the same
credentials are returned, no duplicate SP is created.

**Request body:**
```json
{
  "session_id": "43834da785ca41bda7a88ce7521f232f",
  "name": "PrivateAI-Provisioner",
  "role": "Contributor"
}
```

| Field        | Type   | Default                 | Description |
|--------------|--------|-------------------------|-------------|
| `session_id` | string | required                | Session id from `/login/start`. |
| `name`       | string | `PrivateAI-Provisioner` | Display name for the App Registration / SP. |
| `role`       | string | `Contributor`           | RBAC role to grant, scoped to the current subscription. |

**Response:** `200 OK`
```json
{
  "session_id": "43834da785ca41bda7a88ce7521f232f",
  "status": "provisioned",
  "client_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tenant_id": "00000000-0000-0000-0000-000000000000",
  "subscription_id": "12345678-1234-1234-1234-123456789012",
  "display_name": "PrivateAI-Provisioner"
}
```

**Errors:**

| Status | Meaning |
|--------|---------|
| `400`  | Session status is not `authenticated` / `provisioned` (login not complete). |
| `404`  | Unknown or expired `session_id`. |
| `500`  | `az ad sp create-for-rbac` failed. |

> ⚠️ The `client_secret` is returned **once**. Azure cannot show it again. The frontend must persist it immediately.

#### `POST /api/v1/azure/cli/login/cancel`

Abort an in-flight device-code login (e.g. user closed the modal) and
clean up the subprocess + isolated config directory.

**Query parameters:**

| Param        | Type   | Required | Description                            |
|--------------|--------|----------|----------------------------------------|
| `session_id` | string | Yes      | Session id returned by `/login/start`  |

**Response:** `200 OK`
```json
{
  "session_id": "43834da785ca41bda7a88ce7521f232f",
  "cancelled": true,
  "message": "Session cancelled and resources cleaned up."
}
```

**Errors:**

| Status | Meaning |
|--------|---------|
| `404`  | `session_id` unknown. |

---

### Providers

#### `GET /api/v1/providers`

List all available cloud providers and their supported regions.

**Response:** `200 OK`
```json
{
  "providers": [
    {
      "id": "azure",
      "display_name": "Microsoft Azure",
      "regions": [
        {"id": "centralus", "name": "Central US"},
        {"id": "westeurope", "name": "West Europe"}
      ]
    }
  ]
}
```

#### `GET /api/v1/providers/{provider}/vm-sizes`

Static catalog of VM sizes / GPU profiles for a provider.

**Query parameters:**

| Param    | Type   | Default      | Description   |
|----------|--------|--------------|---------------|
| `region` | string | `eastus`     | Cloud region  |

**Response:** `200 OK`
```json
{
  "vm_sizes": [
    {
      "id": "micro-cpu",
      "display_name": "Micro CPU",
      "vm_size": "Standard_D2as_v5",
      "gpus": 0,
      "gpu_model": "None",
      "vcpus": 2,
      "memory_gb": 8,
      "confidential": false,
      "description": "2 vCPU / 8 GB — cheapest test profile.",
      "cost_per_hour": 0.10
    }
  ]
}
```

#### `POST /api/v1/providers/{provider}/accessible-vm-sizes`

Returns the same catalog as `/vm-sizes` annotated with per-subscription
**deployability**: each VM profile carries an `available: bool` and an
`availability_reason: string | null` based on live Azure quota / SKU
availability data.  This is what the Configuration step of the wizard uses.

**Request body:**
```json
{
  "region": "centralus",
  "credentials": { "provider": "azure", "...": "..." }
}
```

**Response:** `200 OK`
```json
{
  "vm_sizes": [
    {
      "id": "t4-gpu",
      "vm_size": "Standard_NC4as_T4_v3",
      "gpus": 1,
      "gpu_model": "T4 16GB",
      "confidential": false,
      "available": false,
      "availability_reason": "No approved NCASv3_T4 quota is visible in centralus."
    }
  ]
}
```

#### `POST /api/v1/providers/{provider}/validate-credentials`

Test whether cloud credentials are valid.  On success, the credentials are
cached as the active provider credentials so subsequent lifecycle calls use
fresh values instead of whatever was persisted at deployment creation time.

**Request body:**
```json
{
  "credentials": {
    "provider": "azure",
    "subscription_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "tenant_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_secret": "your-secret-value"
  }
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "message": "Authenticated. 3 resource group(s) visible."
}
```

#### `POST /api/v1/providers/{provider}/setup-permissions`

Register required cloud provider resource namespaces / APIs for the
subscription so the first deployment doesn't fail with
`MissingSubscriptionRegistration`.  For Azure this registers
`Microsoft.Network`, `Microsoft.Compute`, and `Microsoft.Storage`.

**Request body:** same shape as `/validate-credentials`.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Registered 3 resource provider(s).",
  "providers": {
    "Microsoft.Network": "Registered",
    "Microsoft.Compute": "Registered",
    "Microsoft.Storage": "Registered"
  }
}
```

#### `GET /api/v1/providers/{provider}/recommend-vm`

Return the cheapest VM profile that can comfortably run a given Ollama model
(used by the wizard to auto-select the right VM size when the user picks a
model).

**Query parameters:**

| Param   | Type   | Default       | Description      |
|---------|--------|---------------|------------------|
| `model` | string | `llama3:8b`   | Ollama model tag |

**Response:** `200 OK`
```json
{
  "vm_profile_id": "t4-gpu",
  "reason": "T4 GPU — fits 8B models at fp16."
}
```

---

### Deployments

#### `POST /api/v1/deployments`

**Create a new deployment.** This is the primary endpoint the frontend calls
when the user clicks "Provision".

Returns immediately with a deployment ID (HTTP 202).  Provisioning runs
in the background.

**Request body:**
```json
{
  "credentials": { "provider": "azure", "...": "..." },
  "config": {
    "provider": "azure",
    "region": "centralus",
    "vm_name": "privateai-vm",
    "resource_group": "privateai-rg",
    "vm_size": "Standard_D2as_v5",
    "gpu_enabled": false,
    "security_level": "standard",
    "os_disk_size_gb": 64,
    "data_disk_size_gb": 0,
    "allowed_ssh_sources": ["1.2.3.4/32"],
    "allowed_api_sources": ["1.2.3.4/32"],
    "setup": {
      "models": ["gemma3:4b"]
    },
    "provider_options": {}
  }
}
```

**Response:** `202 Accepted`
```json
{
  "id": "a1b2c3d4-...",
  "status": "pending",
  "created_at": "2025-01-15T10:30:00Z",
  "message": "Deployment created. Poll status or connect via WebSocket."
}
```

#### `GET /api/v1/deployments`

List all deployments.

**Response:** `200 OK` — `{ "deployments": [ DeploymentStatusResponse, ... ] }`

#### `GET /api/v1/deployments/{id}`

Get the cached status of a specific deployment.

#### `GET /api/v1/deployments/{id}/live`

Get deployment status with a **live query** to the cloud provider (slower, but
gives real-time VM power state).  The result includes
`provider_metadata.live_status`.

---

### Lifecycle

#### `POST /api/v1/deployments/{id}/start`

Start a stopped VM.

**Response:** `200 OK`
```json
{
  "success": true,
  "status": "running",
  "message": "VM started at 20.1.2.3",
  "public_ip": "20.1.2.3"
}
```

#### `POST /api/v1/deployments/{id}/stop`

Deallocate a running VM (stops compute billing; disks are retained).

#### `POST /api/v1/deployments/{id}/auto-shutdown`

Set a daily auto-shutdown schedule (cost safety mechanism).

**Request body:**
```json
{ "time_utc": "1800" }
```

| Field      | Type   | Default | Description                                        |
|------------|--------|---------|----------------------------------------------------|
| `time_utc` | string | `1800`  | Daily shutdown time in HHMM UTC (e.g. `1800` = 6pm)|

#### `DELETE /api/v1/deployments/{id}`

Permanently destroy all cloud resources for this deployment (deletes the
entire resource group).  The caller may include replacement credentials in
the request body to overwrite stale persisted credentials before destroy.

**Request body (optional):**
```json
{ "credentials": { "provider": "azure", "...": "..." } }
```

**Response:** `200 OK`
```json
{
  "success": true,
  "status": "destroyed",
  "message": "Resources destroyed",
  "public_ip": ""
}
```

---

### Bulk cleanup

#### `POST /api/v1/deployments/destroy-managed-resources`

Destroy all PrivateAI-managed resource groups for a provider.  Only targets
resource groups tagged with `project=privateai` and
`created-by=privateai-backend` — avoids subscription-wide deletion.

Used by the "Destroy All Managed Azure Resources" button on the dashboard
for recovering from stuck `destroying` states.

**Request body:**
```json
{
  "provider": "azure",
  "credentials": { "provider": "azure", "...": "..." }
}
```

`credentials` is optional if valid provider credentials have been cached by a
prior `validate-credentials` call.

**Response:** `200 OK`
```json
{
  "success": true,
  "provider": "azure",
  "message": "Destroyed 2 managed resource group(s).",
  "matched_resource_groups": ["privateai-rg-a", "privateai-rg-b"],
  "deleted_resource_groups": ["privateai-rg-a", "privateai-rg-b"],
  "failed_resource_groups": [],
  "removed_deployment_ids": ["id-1", "id-2"]
}
```

---

### VM Setup

#### `POST /api/v1/deployments/{id}/setup`

Re-run VM software setup.  Useful after a VM reboot (e.g. for GPU driver
activation) or to update model selection.

Uses the stored config and credentials — no request body needed.

---

### Validation

#### `POST /api/v1/deployments/{id}/validate`

Run health checks against the deployed VM over SSH.

**Query parameters:**

| Param       | Type   | Default | Description                 |
|-------------|--------|---------|-----------------------------|
| `check_gpu` | bool   | `false` | Include GPU-specific checks |

**Response:** `200 OK`
```json
{
  "all_passed": true,
  "checks": [
    {"name": "SSH connectivity", "passed": true, "message": "Connected to 20.1.2.3", "detail": ""},
    {"name": "Ollama service", "passed": true, "message": "active", "detail": ""}
  ],
  "system_info": {
    "os": "Ubuntu 22.04.4 LTS",
    "cpus": "40",
    "memory_gb": "320"
  }
}
```

---

### Services

#### `GET /api/v1/deployments/{id}/services`

Get access URLs for the deployed services.  Note: for Azure, `ollama_api`
is intentionally empty — Ollama is only reachable via the SSH tunnel the
backend sets up.  Open WebUI runs locally on the backend host; its URL
comes from `/api/v1/open-webui/status`.

**Response:** `200 OK`
```json
{
  "deployment_id": "a1b2c3d4-...",
  "status": "running",
  "endpoints": {
    "ssh": "ssh azureuser@20.1.2.3",
    "ollama_api": ""
  }
}
```

---

### Model management

#### `GET /api/v1/deployments/{id}/models`

List Ollama models installed on the VM.

**Response:** `200 OK`
```json
{
  "models": [
    {
      "name": "gemma3:4b",
      "size": 2650000000,
      "digest": "sha256:...",
      "modified_at": "2025-01-15T10:30:00Z",
      "details": {}
    }
  ]
}
```

#### `POST /api/v1/deployments/{id}/models`

Pull (download) a new Ollama model onto the VM.

**Request body:**
```json
{ "model": "llama3:8b" }
```

**Response:** `200 OK`
```json
{ "success": true, "model": "llama3:8b", "message": "Model pulled successfully" }
```

#### `DELETE /api/v1/deployments/{id}/models/{model}`

Delete a model from the VM.

**Response:** `200 OK`
```json
{ "success": true, "model": "llama3:8b", "message": "Model deleted" }
```

---

### Open WebUI

Open WebUI runs as a local subprocess on the backend host (not on the
cloud VM). These endpoints control its lifecycle and route it to the
Ollama instance on a running deployment via an SSH tunnel.

#### `GET /api/v1/open-webui/status`

Current state of the local Open WebUI process.

**Response:** `200 OK`
```json
{
  "state": {
    "status": "running",
    "url": "http://localhost:8080",
    "port": 8080,
    "data_dir": "/app/open-webui-data",
    "config": { "ollama_base_urls": "http://127.0.0.1:51234" },
    "connected_deployment_id": "a1b2c3d4-...",
    "connected_deployment_name": "privateai-vm",
    "error": "",
    "started_at": 1705316400.0
  }
}
```

#### `GET /api/v1/open-webui/health`

Quick reachability check.  Returns `{ "healthy": true, "status": "...", "url": "..." }`.

#### `POST /api/v1/open-webui/start`

Start the Open WebUI process.  Accepts an optional config override.

**Request body (optional):** `{ "config": { "port": 8080, "ollama_base_urls": "...", "...": "..." } }`

#### `POST /api/v1/open-webui/stop`

Stop the Open WebUI process.  No body.

#### `POST /api/v1/open-webui/restart`

Stop + start, optionally with a new config.

#### `POST /api/v1/open-webui/connect`

Set up an SSH tunnel to the deployment's Ollama instance and restart Open
WebUI with `OLLAMA_BASE_URLS` pointing at the tunnel.  The VM IP is read
from the deployment record — never sent from the frontend.

**Request body:**
```json
{ "deployment_id": "a1b2c3d4-...", "deployment_name": "privateai-vm" }
```

**Response:** `200 OK` with an `OpenWebuiStartResponse` (same shape as `/start`).

Errors: `400` (deployment not found / no IP), `502` (SSH tunnel setup failed — Open WebUI is *not* silently left pointing at `localhost`).

#### `GET /api/v1/open-webui/config`

Return the currently applied Open WebUI environment config.

#### `PUT /api/v1/open-webui/config`

Update config.  If Open WebUI is running it will be restarted automatically.

**Request body:** `{ "config": { "port": 8080, "...": "..." } }`

---

### Cost & Budget

#### `GET /api/v1/cost/budget`

Return the current global budget config.

#### `POST /api/v1/cost/budget`

Set global budget limits and the action to take when thresholds are crossed.

**Request body:**
```json
{
  "budget": {
    "max_monthly_spend_usd": 500,
    "warn_at_pct": 80,
    "action_at_pct": 95,
    "action": "stop"
  }
}
```

#### `POST /api/v1/cost/deployments/{id}/budget`

Set a per-deployment spending limit.  `0` reverts to the global limit.

**Request body:** `{ "max_spend_usd": 50 }`

#### `GET /api/v1/cost/report`

Get a full cost report (per-deployment breakdown, totals, projections).

#### `GET /api/v1/cost/alerts`

List unacknowledged cost alerts.

#### `POST /api/v1/cost/alerts/{alert_id}/acknowledge`

Mark an alert as acknowledged (removes it from the dashboard banner).

---

### WebSocket

#### `WS /api/v1/deployments/{id}/ws`

Real-time deployment progress stream.  Connect after creating a
deployment to receive live updates.

**Message types sent by server:**

```jsonc
// Infrastructure provisioning progress
{
  "type": "provision_progress",
  "step": "vm",
  "current": 6,
  "total": 7,
  "message": "this takes 3-8 minutes"
}

// VM software setup progress
{
  "type": "setup_progress",
  "step": "pull_models",
  "current": 6,
  "total": 7,
  "message": "pulling gemma3:27b-fp16..."
}

// Status transitions
{ "type": "status_change", "status": "running" }

// Provisioning complete (IP now available)
{ "type": "provision_complete", "public_ip": "20.1.2.3" }

// Reboot required for GPU drivers
{
  "type": "reboot_required",
  "message": "VM needs a reboot for NVIDIA drivers. Reboot and re-run setup."
}

// Error
{ "type": "status_change", "status": "failed", "error": "..." }
```

---

## Data Models

### DeploymentConfig

| Field                 | Type          | Default          | Description                                               |
|-----------------------|---------------|------------------|-----------------------------------------------------------|
| `provider`            | `string`      | —                | `"azure"` / `"gcp"` / `"aws"`                            |
| `region`              | `string`      | —                | Cloud region (e.g. `"centralus"`)                        |
| `vm_name`             | `string`      | `"privateai-vm"` | VM resource name                                          |
| `resource_group`      | `string`      | `"privateai-rg"` | Resource group / project grouping                         |
| `vm_size`             | `string`      | —                | VM SKU (e.g. `"Standard_D2as_v5"`)                       |
| `gpu_enabled`         | `boolean`     | `false`          | Whether the VM has a GPU                                  |
| `security_level`      | `string`      | `"standard"`     | `"standard"` (TrustedLaunch) or `"confidential"` (SEV-SNP)|
| `os_disk_size_gb`     | `integer`     | `256`            | OS disk size (30–4096)                                    |
| `data_disk_size_gb`   | `integer`     | `1024`           | Data disk for models (0–16384, `0` = no data disk)       |
| `allowed_ssh_sources` | `string[]`    | `["*"]`          | IP CIDRs for SSH access                                   |
| `allowed_api_sources` | `string[]`    | `["*"]`          | IP CIDRs for API access                                   |
| `setup`               | `SetupConfig` | see below        | Software setup options                                    |
| `provider_options`    | `object`      | `{}`             | Provider-specific overrides (advanced users)              |

### SetupConfig

| Field    | Type       | Default         | Description                 |
|----------|------------|-----------------|-----------------------------|
| `models` | `string[]` | `["gemma3:4b"]` | Ollama model tags to pull   |

Open WebUI is *not* installed on the cloud VM — it is a locally managed
subprocess on the backend host.  See the `/api/v1/open-webui/*` endpoints.

### DeploymentStatus (enum)

| Value          | Description                   |
|----------------|-------------------------------|
| `pending`      | Created, not yet started      |
| `provisioning` | Infrastructure being created  |
| `configuring`  | VM software being installed   |
| `running`      | Fully operational             |
| `stopping`     | Being deallocated             |
| `stopped`      | VM deallocated (disks remain) |
| `starting`     | Being started                 |
| `destroying`   | Being torn down               |
| `destroyed`    | Fully removed                 |
| `failed`       | Error during any phase        |

### SecurityLevel (enum)

| Value          | Description                                         |
|----------------|-----------------------------------------------------|
| `standard`     | TrustedLaunch — Secure Boot + vTPM only             |
| `confidential` | Full Confidential VM — AMD SEV-SNP encrypted memory |

### AzureCliAuthStatus (enum)

Used by `/api/v1/azure/cli/login/status`.

| Value           | Description                                                 |
|-----------------|-------------------------------------------------------------|
| `pending`       | Awaiting user to authenticate in the browser.               |
| `authenticated` | User finished login; ready to call `/provision`.            |
| `provisioned`   | Service Principal has been created on this session.         |
| `failed`        | Login failed or was cancelled.                              |
| `expired`       | Session was garbage-collected (idle > 30 min).              |

### StepProgress

| Field          | Type       | Description                                         |
|----------------|------------|-----------------------------------------------------|
| `step`         | `string`   | Step identifier                                     |
| `label`        | `string`   | Human-readable step name                            |
| `status`       | `string`   | `pending` / `in_progress` / `completed` / `failed`  |
| `detail`       | `string`   | Additional context                                  |
| `started_at`   | `datetime` | When step started (nullable)                        |
| `completed_at` | `datetime` | When step finished (nullable)                       |

### ServiceEndpoints

| Field        | Type     | Description                                                    |
|--------------|----------|----------------------------------------------------------------|
| `ssh`        | `string` | SSH connection string                                          |
| `ollama_api` | `string` | Always empty for Azure (reachable only via backend SSH tunnel) |

### VM profile (item in `/vm-sizes` / `/accessible-vm-sizes` arrays)

| Field                 | Type                | Description                                                       |
|-----------------------|---------------------|-------------------------------------------------------------------|
| `id`                  | `string`            | Internal profile id (e.g. `micro-cpu`, `t4-gpu`)                  |
| `display_name`        | `string`            | User-facing label                                                 |
| `vm_size`             | `string`            | Azure SKU (e.g. `Standard_D2as_v5`)                               |
| `gpus`                | `integer`           | Number of GPUs                                                    |
| `gpu_model`           | `string`            | `None` for CPU profiles                                           |
| `vcpus`               | `integer`           | Virtual CPUs                                                      |
| `memory_gb`           | `integer`           | RAM                                                               |
| `confidential`        | `boolean`           | Whether this profile uses AMD SEV-SNP                             |
| `description`         | `string`            | One-line description                                              |
| `cost_per_hour`       | `float`             | Approximate USD / hour                                            |
| `available`           | `boolean` *         | Only on `/accessible-vm-sizes` — deployable in the user's account |
| `availability_reason` | `string \| null` *  | Only on `/accessible-vm-sizes` — quota / SKU explanation          |

\* Only present on the `/accessible-vm-sizes` endpoint.

---

## Provisioning Flow

This is the complete sequence the frontend should follow for a "new user from
zero" experience using the automated Azure CLI path.

```
┌─ Onboarding (Azure CLI device-code) ───────────────────────────────────┐
│ 1. POST /api/v1/azure/cli/login/start                                  │
│    → { session_id, verification_url, user_code }                       │
│    Show modal: "Open {url}, enter code {code}"                         │
│                                                                        │
│ 2. Poll GET /api/v1/azure/cli/login/status?session_id=… every 3s       │
│    → status == "authenticated"                                          │
│                                                                        │
│ 3. POST /api/v1/azure/cli/provision { session_id }                     │
│    → { client_id, client_secret, tenant_id, subscription_id }          │
│    Credentials are also cached server-side as the active Azure creds.  │
└────────────────────────────────────────────────────────────────────────┘

┌─ Deployment ────────────────────────────────────────────────────────────┐
│ 4. POST /api/v1/providers/azure/validate-credentials { credentials }    │
│    (optional — /provision already validated)                            │
│                                                                         │
│ 5. POST /api/v1/providers/azure/accessible-vm-sizes                     │
│    { region, credentials }                                              │
│    → VM catalog annotated with .available / .availability_reason        │
│                                                                         │
│ 6. POST /api/v1/deployments { credentials, config }                     │
│    → { id, status: "pending" }                                          │
│                                                                         │
│ 7. WS /api/v1/deployments/{id}/ws                                       │
│    ← provision_progress (7 steps)                                       │
│    ← setup_progress     (6 steps)                                       │
│    ← status_change → "running"                                          │
│                                                                         │
│ 8. GET /api/v1/deployments/{id}/services                                │
│    → SSH command + (empty) Ollama URL for display                       │
│                                                                         │
│ 9. POST /api/v1/open-webui/connect { deployment_id, deployment_name }   │
│    → opens SSH tunnel, restarts Open WebUI pointed at the tunnel        │
│    Frontend can now redirect user to http://localhost:8080              │
└─────────────────────────────────────────────────────────────────────────┘

Management:
   POST   /api/v1/deployments/{id}/auto-shutdown     Daily cost safety
   POST   /api/v1/deployments/{id}/stop              Deallocate (save cost)
   POST   /api/v1/deployments/{id}/start             Resume
   POST   /api/v1/deployments/{id}/validate          Health check
   POST   /api/v1/deployments/{id}/setup             Re-run setup after reboot
   DELETE /api/v1/deployments/{id}                   Destroy this deployment
   POST   /api/v1/deployments/destroy-managed-resources  Bulk cleanup
```

### Infrastructure provisioning steps (Phase 1)

| # | Step           | Description                                          |
|---|----------------|------------------------------------------------------|
| 1 | resource_group | Create Azure resource group with tags                |
| 2 | nsg            | Create NSG with SSH (22) rule — port 11434 **never** |
|   |                | exposed publicly                                     |
| 3 | vnet           | Create VNet (10.0.0.0/16) + subnet                   |
| 4 | public_ip      | Create static Standard public IP                     |
| 5 | nic            | Create NIC with accelerated networking               |
| 6 | vm             | Create VM (Confidential/TrustedLaunch, SSH key auth) |
| 7 | data_disk      | Attach empty data disk for models (skipped if `data_disk_size_gb=0`) |

### VM software setup steps (Phase 2)

| # | Step           | Description                                                      |
|---|----------------|------------------------------------------------------------------|
| 1 | connect        | SSH into VM (12 retries, 5s intervals)                           |
| 2 | update_system  | apt-get update && upgrade                                        |
| 3 | mount_disk     | Detect, format, mount data disk at /models (skipped if no disk)  |
| 4 | nvidia_driver  | Install NVIDIA GPU driver (skipped on CPU SKUs)                  |
| 5 | install_ollama | Install Ollama, configure systemd, chown /models/ollama          |
| 6 | pull_models    | Pull requested Ollama models                                     |

Open WebUI is not part of the VM setup sequence.  It is managed locally
on the backend host via the `/api/v1/open-webui/*` endpoints.

---

## Error Handling

All error responses use this envelope:

```json
{
  "error": "Human-readable error message",
  "detail": "Optional stack trace or extended details"
}
```

FastAPI validation errors (422) use a different shape — a `detail` array of
objects with `msg`, `loc`, `type`. The frontend collapses these into a
semicolon-joined string for display.

| HTTP Status | Meaning                                                          |
|-------------|------------------------------------------------------------------|
| 202         | Deployment created, background provisioning started              |
| 400         | Invalid request (e.g. mismatched credential provider on destroy) |
| 404         | Deployment / session / provider not found                        |
| 422         | Pydantic validation error                                        |
| 500         | Internal server error                                            |
| 502         | Upstream failure (cloud SDK, SSH tunnel, Ollama API)             |
| 503         | `az` binary missing from the container                           |

Deployment-level errors are also stored on the deployment record (`error`
and `error_detail` fields) and broadcast over WebSocket so the frontend
can display contextual error messages without polling.

---

## Adding a New Cloud Provider

To add GCP or AWS support:

1. **Create** `backend/app/providers/gcp/` (or `aws/`) with:
   - `provider.py` — class implementing `CloudProvider` (see `base.py`)
   - `config.py` — region lists, VM profiles, parameter translation
   - `vm_setup.py` — SSH-based software installation
   - `validator.py` — SSH-based health checks

2. **Add credentials model** in `backend/app/models/credentials.py`
   (GCP and AWS stubs already exist).

3. **Register** the provider in `backend/app/providers/registry.py`:
   ```python
   from app.providers.gcp.provider import GCPProvider
   _PROVIDERS[CloudProviderEnum.GCP] = GCPProvider()
   ```

4. The REST API automatically picks up the new provider — no router
   changes needed.  The frontend will see it in `GET /api/v1/providers`.

The Azure CLI device-code flow (`/api/v1/azure/cli/*`) is Azure-specific.
The equivalent GCP flow would be `gcloud auth login` + creating a service
account and key with the cloud IAM CLI.
