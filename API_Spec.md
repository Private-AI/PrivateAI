# PrivateAI Backend API Specification

**Version:** 0.2.0
**Base URL:** `http://localhost:8000`
**Protocol:** HTTP/1.1 + WebSocket
**Content-Type:** `application/json`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication & Credentials](#authentication--credentials)
3. [Endpoints](#endpoints)
   - [Health](#health)
   - [Providers](#providers)
   - [Deployments](#deployments)
   - [Lifecycle](#lifecycle)
   - [VM Setup](#vm-setup)
   - [Validation](#validation)
   - [Services](#services)
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
│                      │  POST    │  /api/v1/deployments                 │
│  Config Form ────────┼─────────►│    ├── Orchestrator                  │
│                      │          │    │     ├── DeploymentStore          │
│  Progress Panel ◄────┼──── WS ──│    │     └── CloudProvider(azure)    │
│                      │          │    │           ├── provision()        │
│  Management Panel ───┼─────────►│    │           ├── setup_vm()        │
│                      │  REST    │    │           ├── start/stop/destroy │
│  Service Links ◄─────┼──────── │    │           └── validate()        │
└──────────────────────┘          └──────────────────────────────────────┘
```

The backend follows a **provider pattern** — all cloud-specific logic lives behind
an abstract `CloudProvider` interface.  Currently Azure is implemented; GCP and
AWS can be added by implementing the same interface.

The frontend sends a **single JSON** with the full deployment configuration and
cloud credentials when the user clicks "Provision".  Progress is streamed
back over a WebSocket connection.

---

## Authentication & Credentials

Credentials are sent **per-request** in the JSON body (not as headers or cookies).
They are held in memory only for the duration of the deployment and are never
persisted to disk.

### Azure Credentials

| Field           | Type       | Required | Description                            |
|-----------------|------------|----------|----------------------------------------|
| `provider`      | `"azure"`  | Yes      | Discriminator field                    |
| `subscription_id` | `string` | Yes     | Azure subscription UUID (36 chars)     |
| `tenant_id`     | `string`   | Yes      | Azure AD tenant UUID (36 chars)        |
| `client_id`     | `string`   | Yes      | Service principal app client UUID      |
| `client_secret` | `string`   | Yes      | Service principal secret (write-only)  |

### GCP Credentials (future)

| Field                   | Type       | Required | Description                   |
|-------------------------|------------|----------|-------------------------------|
| `provider`              | `"gcp"`    | Yes      | Discriminator field           |
| `project_id`            | `string`   | Yes      | GCP project ID                |
| `service_account_json`  | `string`   | Yes      | Service account key JSON      |

### AWS Credentials (future)

| Field               | Type       | Required | Description                      |
|---------------------|------------|----------|----------------------------------|
| `provider`          | `"aws"`    | Yes      | Discriminator field              |
| `access_key_id`     | `string`   | Yes      | AWS access key ID                |
| `secret_access_key` | `string`   | Yes      | AWS secret access key            |
| `region`            | `string`   | No       | Default: `us-east-1`            |

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
  "status": "healthy"
}
```

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
        {"id": "eastus", "name": "East US"},
        {"id": "westeurope", "name": "West Europe"}
      ]
    }
  ]
}
```

#### `GET /api/v1/providers/{provider}/vm-sizes`

List available VM sizes / GPU profiles for a provider.

**Query parameters:**

| Param    | Type   | Default    | Description        |
|----------|--------|------------|--------------------|
| `region` | string | `eastus`   | Cloud region       |

**Response:** `200 OK`
```json
{
  "vm_sizes": [
    {
      "id": "h100-confidential",
      "display_name": "NVIDIA H100 (Confidential)",
      "vm_size": "Standard_NCC40ads_H100_v5",
      "gpus": 1,
      "gpu_model": "H100 80GB",
      "vcpus": 40,
      "memory_gb": 320,
      "confidential": true,
      "description": "H100 GPU with AMD SEV-SNP confidential computing."
    }
  ]
}
```

#### `POST /api/v1/providers/{provider}/validate-credentials`

Test whether cloud credentials are valid before starting a deployment.

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
  "credentials": {
    "provider": "azure",
    "subscription_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "tenant_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_secret": "your-secret-value"
  },
  "config": {
    "provider": "azure",
    "region": "eastus",
    "vm_name": "privateai-vm",
    "resource_group": "privateai-rg",
    "vm_size": "Standard_NCC40ads_H100_v5",
    "gpu_enabled": true,
    "security_level": "confidential",
    "os_disk_size_gb": 256,
    "data_disk_size_gb": 1024,
    "allowed_ssh_sources": ["1.2.3.4/32"],
    "allowed_api_sources": ["1.2.3.4/32"],
    "setup": {
      "models": ["gemma3:27b-fp16", "gemma3:4b"]
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

**Response:** `200 OK`
```json
{
  "deployments": [
    {
      "id": "a1b2c3d4-...",
      "status": "running",
      "config": { "..." },
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:45:00Z",
      "public_ip": "20.1.2.3",
      "vm_id": "/subscriptions/.../virtualMachines/privateai-vm",
      "provision_steps": [ "..." ],
      "setup_steps": [ "..." ],
      "endpoints": {
        "ssh": "ssh azureuser@20.1.2.3",
        "ollama_api": "http://20.1.2.3:11434",
        "open_webui": "http://20.1.2.3:3000"
      },
      "error": "",
      "error_detail": "",
      "provider_metadata": {}
    }
  ]
}
```

#### `GET /api/v1/deployments/{id}`

Get the cached status of a specific deployment.

**Response:** `200 OK` — same shape as a single item in the list above.

#### `GET /api/v1/deployments/{id}/live`

Get deployment status with a **live query** to the cloud provider (more
expensive, but gives real-time VM power state).

**Response:** `200 OK` — same shape, with `provider_metadata.live_status` populated.

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

**Response:** `200 OK`
```json
{
  "success": true,
  "status": "stopped",
  "message": "VM deallocated",
  "public_ip": ""
}
```

#### `POST /api/v1/deployments/{id}/auto-shutdown`

Set a daily auto-shutdown schedule (cost safety mechanism).

**Request body:**
```json
{
  "time_utc": "1800"
}
```

| Field      | Type   | Default | Description                                        |
|------------|--------|---------|----------------------------------------------------|
| `time_utc` | string | `1800`  | Daily shutdown time in HHMM UTC (e.g. `"1800"` = 6pm) |

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Auto-shutdown set to 1800 UTC daily"
}
```

#### `DELETE /api/v1/deployments/{id}`

**Permanently destroy** all cloud resources for this deployment
(deletes the entire resource group).

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

### VM Setup

#### `POST /api/v1/deployments/{id}/setup`

Re-run VM software setup.  Useful after a VM reboot (e.g. for GPU driver
activation) or to update model selection.

Uses the stored config and credentials — no request body needed.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Setup complete"
}
```

---

### Validation

#### `POST /api/v1/deployments/{id}/validate`

Run health checks against the deployed VM over SSH.

**Query parameters:**

| Param       | Type   | Default | Description               |
|-------------|--------|---------|---------------------------|
| `check_gpu` | bool   | `false` | Include GPU-specific checks |

**Response:** `200 OK`
```json
{
  "all_passed": true,
  "checks": [
    {"name": "SSH connectivity", "passed": true, "message": "Connected to 20.1.2.3", "detail": ""},
    {"name": "System info", "passed": true, "message": "Ubuntu 22.04, 40 CPUs, 320 GB RAM", "detail": ""},
    {"name": "Data disk mount", "passed": true, "message": "/models mounted (1007G)", "detail": ""},
    {"name": "Ollama installed", "passed": true, "message": "ollama version 0.6.2", "detail": ""},
    {"name": "Ollama service", "passed": true, "message": "active", "detail": ""},
    {"name": "Ollama API (local)", "passed": true, "message": "responding on :11434", "detail": ""},
    {"name": "Ollama API (remote)", "passed": true, "message": "http://20.1.2.3:11434 reachable", "detail": ""}
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

Get access URLs for the deployed services.

**Response:** `200 OK`
```json
{
  "deployment_id": "a1b2c3d4-...",
  "status": "running",
  "endpoints": {
    "ssh": "ssh azureuser@20.1.2.3",
    "ollama_api": "http://20.1.2.3:11434",
    "open_webui": "http://20.1.2.3:3000"
  }
}
```

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
{
  "type": "status_change",
  "status": "running"
}

// Provisioning complete (IP now available)
{
  "type": "provision_complete",
  "public_ip": "20.1.2.3"
}

// Reboot required for GPU drivers
{
  "type": "reboot_required",
  "message": "VM needs a reboot for NVIDIA drivers. Reboot and re-run setup."
}

// Error
{
  "type": "status_change",
  "status": "failed",
  "error": "..."
}
```

---

## Data Models

### DeploymentConfig

| Field                  | Type              | Default          | Description                                             |
|------------------------|-------------------|------------------|---------------------------------------------------------|
| `provider`             | `string`          | —                | `"azure"` / `"gcp"` / `"aws"`                         |
| `region`               | `string`          | —                | Cloud region (e.g. `"eastus"`)                         |
| `vm_name`              | `string`          | `"privateai-vm"` | VM resource name                                        |
| `resource_group`       | `string`          | `"privateai-rg"` | Resource group / project grouping                       |
| `vm_size`              | `string`          | —                | VM SKU (e.g. `"Standard_NCC40ads_H100_v5"`)           |
| `gpu_enabled`          | `boolean`         | `true`           | Whether the VM has a GPU                                |
| `security_level`       | `string`          | `"confidential"` | `"standard"` (TrustedLaunch) or `"confidential"` (SEV-SNP) |
| `os_disk_size_gb`      | `integer`         | `256`            | OS disk size (30–4096)                                  |
| `data_disk_size_gb`    | `integer`         | `1024`           | Data disk for models (32–16384)                         |
| `allowed_ssh_sources`  | `string[]`        | `["*"]`          | IP CIDRs for SSH access                                |
| `allowed_api_sources`  | `string[]`        | `["*"]`          | IP CIDRs for API access                                |
| `setup`                | `SetupConfig`     | see below        | Software setup options                                  |
| `provider_options`     | `object`          | `{}`             | Provider-specific overrides (advanced users)            |

### SetupConfig

| Field    | Type       | Default         | Description                  |
|----------|------------|-----------------|------------------------------|
| `models` | `string[]` | `["gemma3:4b"]` | Ollama model tags to pull    |

Open WebUI is *not* installed on the cloud VM — it is a locally managed
subprocess on the backend host. See the `/api/v1/open-webui/*`
endpoints for Open WebUI lifecycle, configuration, and connect flows.

### DeploymentStatus (enum)

| Value          | Description                                |
|----------------|--------------------------------------------|
| `pending`      | Created, not yet started                   |
| `provisioning` | Infrastructure being created               |
| `configuring`  | VM software being installed                |
| `running`      | Fully operational                          |
| `stopping`     | Being deallocated                          |
| `stopped`      | VM deallocated (disks remain)              |
| `starting`     | Being started                              |
| `destroying`   | Being torn down                            |
| `destroyed`    | Fully removed                              |
| `failed`       | Error during any phase                     |

### SecurityLevel (enum)

| Value          | Description                                          |
|----------------|------------------------------------------------------|
| `standard`     | TrustedLaunch — Secure Boot + vTPM only              |
| `confidential` | Full Confidential VM — AMD SEV-SNP encrypted memory  |

### StepProgress

| Field          | Type       | Description                        |
|----------------|------------|------------------------------------|
| `step`         | `string`   | Step identifier                    |
| `label`        | `string`   | Human-readable step name           |
| `status`       | `string`   | `pending` / `in_progress` / `completed` / `failed` |
| `detail`       | `string`   | Additional context                 |
| `started_at`   | `datetime` | When step started (nullable)       |
| `completed_at` | `datetime` | When step finished (nullable)      |

### ServiceEndpoints

| Field        | Type     | Description                |
|--------------|----------|----------------------------|
| `ssh`        | `string` | SSH connection string      |
| `ollama_api` | `string` | Ollama REST API URL        |

Open WebUI is a local subprocess reachable at `http://localhost:8080`
(default port). Its URL and status come from
`GET /api/v1/open-webui/status`, not from `ServiceEndpoints`.

---

## Provisioning Flow

This is the complete sequence the frontend should follow:

```
1. GET  /api/v1/providers                      ← Populate provider dropdown
2. GET  /api/v1/providers/azure/vm-sizes       ← Populate VM size dropdown
3. POST /api/v1/providers/azure/validate-credentials  ← Test creds (optional)
4. POST /api/v1/deployments                    ← User clicks "Provision"
     → Returns { id, status: "pending" }
5. WS   /api/v1/deployments/{id}/ws            ← Connect for live progress
     ← Receives provision_progress messages (7 steps)
     ← Receives setup_progress messages (7 steps)
     ← Receives status_change → "running"
6. GET  /api/v1/deployments/{id}/services      ← Show Ollama/OpenWebUI links
7. GET  /api/v1/deployments/{id}/live          ← Periodic status refresh

Management:
   POST /api/v1/deployments/{id}/auto-shutdown ← Set daily auto-shutdown (cost safety)
   POST /api/v1/deployments/{id}/stop          ← Deallocate (save cost)
   POST /api/v1/deployments/{id}/start         ← Resume
   POST /api/v1/deployments/{id}/validate      ← Health check
   POST /api/v1/deployments/{id}/setup         ← Re-run setup after reboot
   DELETE /api/v1/deployments/{id}             ← Destroy all resources
```

### Infrastructure provisioning steps (Phase 1)

| # | Step             | Description                                          |
|---|------------------|------------------------------------------------------|
| 1 | resource_group   | Create Azure resource group with tags                |
| 2 | nsg              | Create NSG with SSH (22) and Ollama (11434) rules    |
| 3 | vnet             | Create VNet (10.0.0.0/16) + subnet                   |
| 4 | public_ip        | Create static Standard public IP                     |
| 5 | nic              | Create NIC with accelerated networking               |
| 6 | vm               | Create VM (Confidential/TrustedLaunch, SSH key auth) |
| 7 | data_disk        | Attach empty data disk for models                    |

### VM software setup steps (Phase 2)

| # | Step            | Description                                       |
|---|-----------------|---------------------------------------------------|
| 1 | connect         | SSH into VM (12 retries, 5s intervals)            |
| 2 | update_system   | apt-get update && upgrade                         |
| 3 | mount_disk      | Detect, format, mount data disk at /models        |
| 4 | nvidia_driver   | Install NVIDIA GPU driver (may require reboot; skipped on non-GPU SKUs) |
| 5 | install_ollama  | Install Ollama, configure systemd                 |
| 6 | pull_models     | Pull requested Ollama models                      |

Open WebUI is not part of the VM setup sequence. It is managed locally
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

| HTTP Status | Meaning                        |
|-------------|--------------------------------|
| 400         | Invalid request body           |
| 404         | Deployment or provider not found |
| 422         | Validation error (Pydantic)    |
| 500         | Internal server error          |

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
