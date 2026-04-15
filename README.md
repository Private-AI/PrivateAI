```
 ____       _            _            _    ___
|  _ \ _ __(_)_   ____ _| |_ ___     / \  |_ _|
| |_) | '__| \ \ / / _` | __/ _ \   / _ \  | |
|  __/| |  | |\ V / (_| | ||  __/  / ___ \ | |
|_|   |_|  |_| \_/ \__,_|\__\___| /_/   \_\___|

         Private AI Infrastructure Manager
```

Deploy private, self-hosted AI models on secure cloud infrastructure with
hardware-level encryption. One click to provision, one dashboard to manage,
one local chat interface to interact.

---

## What is PrivateAI?

PrivateAI is a full-stack application that lets you deploy open-weight
large language models (LLMs) on confidential cloud VMs where **your data
stays encrypted in memory at the hardware level** using AMD SEV-SNP. It
handles the entire lifecycle: provisioning infrastructure, installing GPU
drivers, setting up [Ollama](https://ollama.com) for model serving, and
running [Open WebUI](https://docs.openwebui.com/) locally as a chat
interface that connects to your cloud-provisioned Ollama server.

**No cloud expertise required.** The wizard guides you through selecting a
GPU, entering credentials, and clicking deploy. The dashboard shows your
running infrastructure with one-click access to SSH terminals, the Ollama
API, and a local Open WebUI chat interface -- all without leaving the app.

## Who is it for?

- **Researchers and engineers** who need GPU inference but cannot send data
  to third-party APIs due to compliance, privacy, or IP concerns
- **Organisations** evaluating self-hosted AI and want a turnkey deployment
  that handles the infrastructure complexity
- **Developers** building on top of Ollama who want a confidential
  computing environment provisioned in minutes

## Supported Infrastructure

| Profile | GPU | vCPUs | RAM | $/hr | Confidential | Use Case |
|---------|-----|-------|-----|------|:------------:|----------|
| NVIDIA H100 | H100 80GB HBM3 | 40 | 320 GB | ~$35.00 | Yes | Production inference with full memory encryption |
| NVIDIA A100 | A100 80GB | 24 | 220 GB | ~$3.67 | No | Large model inference |
| NVIDIA T4 | T4 16GB | 4 | 28 GB | ~$0.53 | No | Budget inference for smaller models |
| Test VM | None | 2 | 8 GB | ~$0.10 | No | Pipeline testing |

**Cloud provider:** Microsoft Azure (GCP and AWS planned).

---

## Architecture

```
 Electron Shell (or Browser)
 +---------------------------------------------------------------+
 |                                                                |
 |   Next.js Frontend (React 19, Tailwind v4)                    |
 |   +------------------+  +----------------------------------+  |
 |   |    Sidebar        |  |  Dashboard / Wizard / Settings   |  |
 |   |  - Home           |  |                                  |  |
 |   |  - New Deployment  |  |  +------- Deployment Card ----+ |  |
 |   |  - Settings       |  |  | Status  SSH  Ollama         | |  |
 |   |  - Open WebUI     |  |  | [Open Terminal]             | |  |
 |   |    status widget  |  |  | [Connect & Chat]            | |  |
 |   +------------------+  |  +------------------------------+ |  |
 |                          |                                    |  |
 |                          |  +---- Cost Monitor Bar --------+ |  |
 |                          |  | $4.21 spent | $3.67/hr | 42% | |  |
 |                          |  +------------------------------+ |  |
 |                          +----------------------------------+  |
 |                                     |                          |
 +------------------------------ WS + REST -----------------------+
                                       |
 +---------------------------------------------------------------+
 |                    FastAPI Backend (Python)                    |
 |                                                                |
 |   Routers           Services            Providers              |
 |   /deployments      Orchestrator        CloudProvider (ABC)    |
 |   /providers        DeploymentStore     +-- AzureProvider      |
 |   /services         WebSocketManager    +-- MockProvider       |
 |   /terminal         CostMonitor         +-- (GCPProvider)      |
 |   /cost             OpenWebuiManager    +-- (AWSProvider)      |
 |   /open-webui                                                  |
 +---------------------------------------------------------------+
           |                              |
  Azure SDK / Paramiko SSH      Open WebUI subprocess
           |                     (isolated uv venv,
  +--------+--------+            CPU-only PyTorch)
  | Azure Cloud VM  |                    |
  | NVIDIA GPU      |           http://localhost:8080
  | Ollama          |
  +-----------------+
```

The frontend is a Next.js app that can run in a browser or be wrapped in
Electron for desktop use. It communicates with a FastAPI backend over REST
and WebSocket. The backend uses a **provider pattern** -- all cloud-specific
logic is behind an abstract `CloudProvider` interface, making it
straightforward to add new cloud providers.

Open WebUI runs **locally** inside the same container as the backend, in an
isolated Python virtual environment. It connects to whichever cloud
deployment's Ollama server the user selects, with automatic restart when
switching between deployments.

### Key design decisions

- **Single JSON provisioning** -- the frontend sends one `POST /api/v1/deployments`
  with the full config and credentials; provisioning runs asynchronously in
  the background
- **Real-time progress** -- a WebSocket streams step-by-step updates during
  the 7-step infrastructure provisioning and 6-step software setup
- **Credentials never persisted server-side** -- credentials live only in
  memory for the duration of the operation. Client-side persistence uses
  localStorage (with Electron `safeStorage` encryption planned)
- **Embedded terminal** -- xterm.js in the frontend connects to a backend
  WebSocket that bridges to the VM via Paramiko SSH
- **Local Open WebUI** -- runs as a managed subprocess from an isolated
  `uv` venv with CPU-only PyTorch (~800MB vs ~3GB with CUDA). No login
  screen (`WEBUI_AUTH=False`). Dynamically connects to any deployment's
  Ollama server via the "Connect & Chat" button
- **Cost monitoring** -- background loop tracks per-deployment spend,
  enforces budget thresholds, and auto-stops VMs when limits are exceeded
- **Test mode** -- setting `PRIVATEAI_TEST_MODE=true` swaps all cloud
  providers with a mock that returns realistic dummy data instantly, so the
  full UI can be developed and tested without cloud credentials

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and
  [Docker Compose](https://docs.docker.com/compose/install/)

### Run in test mode (no cloud credentials needed)

The test service runs both the frontend and backend with a mock cloud
provider that returns dummy data. Use this for exploring the UI,
developing, or demos.

```bash
docker compose up test
```

Then open **http://localhost:3000** in your browser.

The backend API docs are at **http://localhost:8000/docs**.

Open WebUI is available at **http://localhost:8080** once started from the
sidebar or via "Connect & Chat" on a deployment card.

### Run with real Azure credentials

```bash
docker compose up combined
```

Open **http://localhost:3000**, walk through the wizard, and enter your
Azure service principal credentials (Subscription ID, Tenant ID, Client
ID, Client Secret). The backend will provision real cloud resources.

### Run frontend and backend separately

```bash
# Terminal 1 -- backend
docker compose up backend

# Terminal 2 -- frontend
docker compose up frontend
```

### Run as an Electron desktop app (development)

```bash
cd frontend
npm install
npm run dev:electron
```

This starts the Next.js dev server and launches Electron once it's ready.
The backend must be running separately.

### Run as an Electron desktop app (packaged)

```bash
cd frontend
npm run build:all
npm run dist
```

This produces platform-specific installers in `frontend/dist/` (macOS
`.app`, Windows NSIS, Linux AppImage).

---

## Docker Compose Services

| Service | Ports | Description |
|---------|-------|-------------|
| `backend` | 8000, 8080 | FastAPI backend + Open WebUI |
| `frontend` | 3000 | Next.js frontend only (needs backend running) |
| `combined` | 3000, 8000, 8080 | Both services in one container |
| `test` | 3000, 8000, 8080 | Both services with `PRIVATEAI_TEST_MODE=true` |
| `dev` | 3000, 8000, 8080, 9229 | Interactive shell for development |
| `electron` | -- | Runs Electron in a virtual framebuffer (headless) |

All services mount `./open-webui-data` for Open WebUI persistent storage
(SQLite database, uploads).

---

## API Overview

The backend exposes a RESTful API at `/api/v1/` plus WebSocket endpoints
for real-time features.

### Provisioning flow

```
GET  /api/v1/providers                           List providers + regions
GET  /api/v1/providers/{p}/vm-sizes              List GPU profiles with $/hr
POST /api/v1/providers/{p}/validate-credentials  Test credentials
POST /api/v1/deployments                         Create deployment (async)
WS   /api/v1/deployments/{id}/ws                 Real-time progress stream
GET  /api/v1/deployments/{id}/services           Get Ollama/SSH URLs
```

### Deployment management

```
POST   /api/v1/deployments/{id}/start            Start stopped VM
POST   /api/v1/deployments/{id}/stop             Deallocate (stops billing)
POST   /api/v1/deployments/{id}/auto-shutdown    Set daily shutdown schedule
POST   /api/v1/deployments/{id}/validate         Run health checks over SSH
POST   /api/v1/deployments/{id}/setup            Re-run software setup
DELETE /api/v1/deployments/{id}                  Destroy all resources
```

### Cost monitoring

```
GET  /api/v1/cost/budget                         Get budget config
POST /api/v1/cost/budget                         Set budget limits
GET  /api/v1/cost/report                         Full cost report
GET  /api/v1/cost/alerts                         Recent alerts
POST /api/v1/cost/alerts/{id}/acknowledge        Acknowledge alert
POST /api/v1/cost/deployments/{id}/budget        Per-deployment limit
```

### Open WebUI (local)

```
GET  /api/v1/open-webui/status                   Current state + connected deployment
GET  /api/v1/open-webui/health                   Liveness probe
POST /api/v1/open-webui/start                    Start process
POST /api/v1/open-webui/stop                     Stop process
POST /api/v1/open-webui/restart                  Restart with new config
POST /api/v1/open-webui/connect                  Connect to a deployment's Ollama
GET  /api/v1/open-webui/config                   Read configuration
PUT  /api/v1/open-webui/config                   Update configuration
```

### Interactive

```
WS   /api/v1/deployments/{id}/terminal           Embedded SSH terminal
```

---

## Project Structure

```
PrivateAI/
+-- backend/
|   +-- main.py                         FastAPI entry point (6 routers, startup/shutdown hooks)
|   +-- requirements.txt                Python dependencies
|   +-- app/
|   |   +-- models/
|   |   |   +-- deployment.py           DeploymentConfig, DeploymentRecord, status enums
|   |   |   +-- credentials.py          Azure/GCP/AWS credential models
|   |   |   +-- cost.py                 BudgetConfig, CostReport, CostAlert
|   |   |   +-- open_webui.py           OpenWebuiEnvConfig, OpenWebuiState
|   |   |   +-- schemas.py             API request/response schemas
|   |   +-- providers/
|   |   |   +-- base.py                 Abstract CloudProvider interface (15 methods)
|   |   |   +-- registry.py             Provider factory + test mode switch
|   |   |   +-- azure/
|   |   |   |   +-- provider.py         Full Azure SDK provisioning lifecycle
|   |   |   |   +-- config.py           VM profiles with pricing, regions
|   |   |   |   +-- vm_setup.py         SSH: drivers, Ollama, model pulls
|   |   |   |   +-- validator.py        SSH: health checks
|   |   |   +-- mock/
|   |   |       +-- provider.py         Mock provider for test mode
|   |   +-- services/
|   |   |   +-- orchestrator.py         Deployment lifecycle coordinator
|   |   |   +-- deployment_store.py     In-memory state store
|   |   |   +-- ws_manager.py           WebSocket broadcast manager
|   |   |   +-- cost_monitor.py         Background cost tracking + auto-shutdown
|   |   |   +-- open_webui_manager.py   Open WebUI subprocess lifecycle
|   |   +-- routers/
|   |       +-- deployments.py          CRUD + lifecycle + WebSocket progress
|   |       +-- providers.py            Provider info + credential validation
|   |       +-- services.py             Service endpoint URLs
|   |       +-- terminal.py             SSH terminal WebSocket bridge
|   |       +-- cost.py                 Budget and cost reporting
|   |       +-- open_webui.py           Open WebUI management + connect
|   +-- tests/
|
+-- frontend/
|   +-- app/
|   |   +-- page.tsx                    App shell with sidebar routing
|   |   +-- layout.tsx                  Root layout (dark theme, Geist fonts)
|   |   +-- globals.css                 Design system (dark-first, animations)
|   |   +-- lib/
|   |   |   +-- api.ts                  28 API client functions + WebSocket
|   |   |   +-- types.ts                TypeScript types mirroring backend models
|   |   |   +-- storage.ts             localStorage persistence layer
|   |   +-- components/
|   |   |   +-- Sidebar.tsx             Navigation + Open WebUI status widget
|   |   |   +-- WelcomeScreen.tsx       Onboarding landing page
|   |   |   +-- TerminalPanel.tsx       Embedded xterm.js SSH terminal
|   |   |   +-- WebUIPanel.tsx          Embedded Open WebUI iframe
|   |   |   +-- cost/CostMonitor.tsx    Cost bar, detail panel, polling hook
|   |   |   +-- icons/                  SVG icon components
|   |   +-- dashboard/Dashboard.tsx     Deployment cards, cost bar, Connect & Chat
|   |   +-- provision/ProvisionWizard.tsx   4-step deployment wizard
|   |   +-- settings/Settings.tsx       Credentials, preferences, budget,
|   |                                   Open WebUI config, history, about
|   +-- electron/
|       +-- main.ts                     Electron main process
|       +-- preload.js                  IPC bridge
|
+-- open-webui-data/                    Open WebUI persistent data (gitignored)
+-- docker-compose.yml                  6 service configurations
+-- Dockerfile                          Python 3.12 + Node 20 + Open WebUI venv
```

---

## Tech Stack

### Backend (~5,000 lines Python)

- **FastAPI** -- async REST + WebSocket API
- **Pydantic v2** -- request/response validation and serialization
- **Azure SDK** -- `azure-mgmt-compute`, `azure-mgmt-network`,
  `azure-mgmt-resource`, `azure-identity`
- **Paramiko** -- SSH for VM setup, validation, and terminal bridging
- **httpx** -- async HTTP client for Open WebUI health checks
- **Open WebUI** -- managed as a subprocess from an isolated `uv` venv
  with CPU-only PyTorch

### Frontend (~4,500 lines TypeScript)

- **Next.js 16** -- React framework with App Router
- **React 19** -- UI rendering
- **Tailwind CSS v4** -- utility-first styling with CSS-first configuration
- **Electron 41** -- desktop app shell (macOS, Windows, Linux)
- **xterm.js** -- embedded SSH terminal

---

## Open WebUI Integration

Open WebUI runs **locally** inside the Docker container, not on the cloud
VM. It is installed into an isolated Python virtual environment at
`/opt/open-webui-env` using `uv` with CPU-only PyTorch (avoids ~2GB of
CUDA/NVIDIA packages that aren't needed for a frontend).

### How it works

1. The Dockerfile builds the isolated venv at image build time
2. The backend's `OpenWebuiManager` service manages the subprocess lifecycle
3. When the user clicks **"Connect & Chat"** on a deployment card, the
   backend starts (or restarts) Open WebUI with `OLLAMA_BASE_URLS` set to
   that deployment's Ollama API endpoint
4. Open WebUI runs in single-user mode (`WEBUI_AUTH=False`) -- no login
   screen
5. The frontend opens an embedded iframe to `http://localhost:8080`
6. Switching deployments automatically restarts Open WebUI with the new URL
7. The sidebar shows the current Open WebUI status and connected deployment

### Configuration

Open WebUI settings can be changed in the Settings page:
- Ollama server URL(s)
- Local port (default 8080)
- Display name
- Default model
- Signup and RAG toggles

Changes trigger an automatic restart if Open WebUI is running.

---

## Cost Monitoring

The backend runs a background cost monitor that:

- Tracks per-deployment accrued costs based on VM hourly rates
- Supports global and per-deployment spending limits
- Fires alerts at configurable thresholds (default: 50%, 80%, 100%)
- Automatically **stops or destroys** VMs when budget limits are exceeded
- Broadcasts cost alerts via WebSocket in real-time

The dashboard shows a cost summary bar with total spend, hourly burn rate,
budget progress, and estimated time remaining.

---

## Testing

Tests are organized into phases by cost. Phases 1-2 are free.

```bash
cd backend

# Phase 1 -- static analysis (free, <1s)
pytest tests/test_lint.py -m phase1 -v

# Phase 2 -- config logic + API shapes (free, <1s)
pytest tests/test_dry_run.py tests/test_api.py -m phase2 -v

# Phase 3 -- cheap VM integration (~$0.10/hr, requires Azure creds)
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Phase 4 -- remote validation (free, needs a running VM)
AZURE_TEST_VM_IP=<IP> pytest tests/test_validate_remote.py -m phase4 -v -s
```

---

## Adding a New Cloud Provider

The backend is designed for multi-cloud. To add GCP or AWS:

1. Create `backend/app/providers/gcp/provider.py` implementing the
   `CloudProvider` abstract base class
2. Add the credential model to `backend/app/models/credentials.py`
   (stubs for GCP and AWS already exist)
3. Register the provider in `backend/app/providers/registry.py`

No router or schema changes needed -- the frontend discovers providers
dynamically via `GET /api/v1/providers`.

---

## Security Model

- **AMD SEV-SNP** -- the H100 Confidential VM profile uses AMD Secure
  Encrypted Virtualization with Secure Nested Paging, encrypting all VM
  memory at the hardware level
- **Secure Boot + vTPM** -- all VM profiles use UEFI Secure Boot and a
  virtual Trusted Platform Module
- **SSH key authentication** -- password auth is disabled; only ed25519 key
  pairs are used
- **NSG firewall** -- only ports 22 (SSH) and 11434 (Ollama) are opened,
  with configurable IP source restrictions
- **No credential persistence on the server** -- credentials exist in
  memory only for the duration of the provisioning operation
- **Electron context isolation** -- `nodeIntegration` is disabled;
  `contextIsolation` is enabled with a whitelisted IPC bridge

---

## License

This project is not yet licensed. All rights reserved.
