```
 ____       _            _            _    ___
|  _ \ _ __(_)_   ____ _| |_ ___     / \  |_ _|
| |_) | '__| \ \ / / _` | __/ _ \   / _ \  | |
|  __/| |  | |\ V / (_| | ||  __/  / ___ \ | |
|_|   |_|  |_| \_/ \__,_|\__\___| /_/   \_\___|

         Private AI Infrastructure Manager
```

Deploy private, self-hosted AI models on secure cloud infrastructure with
hardware-level encryption. One click to provision, one dashboard to manage.

---

## What is PrivateAI?

PrivateAI is a desktop application that lets you deploy open-weight large
language models (LLMs) on confidential cloud VMs where **your data stays
encrypted in memory at the hardware level** using AMD SEV-SNP. It handles
the entire lifecycle: provisioning infrastructure, installing GPU drivers,
setting up [Ollama](https://ollama.com) for model serving, and optionally
deploying [Open WebUI](https://docs.openwebui.com/) for a browser-based
chat interface.

**No cloud expertise required.** The wizard guides you through selecting a
GPU, entering credentials, and clicking deploy. The dashboard shows your
running infrastructure with one-click access to SSH terminals, the Ollama
API, and Open WebUI — all without leaving the app.

## Who is it for?

- **Researchers and engineers** who need GPU inference but cannot send data
  to third-party APIs due to compliance, privacy, or IP concerns
- **Organisations** evaluating self-hosted AI and want a turnkey deployment
  that handles the infrastructure complexity
- **Developers** building on top of Ollama who want a confidential
  computing environment provisioned in minutes

## Supported Infrastructure

| Profile | GPU | vCPUs | RAM | Confidential | Use Case |
|---------|-----|-------|-----|:------------:|----------|
| NVIDIA H100 | H100 80GB HBM3 | 40 | 320 GB | Yes | Production inference with full memory encryption |
| NVIDIA A100 | A100 80GB | 24 | 220 GB | No | Large model inference |
| NVIDIA T4 | T4 16GB | 4 | 28 GB | No | Budget inference for smaller models |
| Test VM | None | 2 | 8 GB | No | Pipeline testing (~$0.10/hr) |

**Cloud provider:** Microsoft Azure (GCP and AWS planned).

---

## Architecture

```
 Electron Shell
 +---------------------------------------------------------------+
 |                                                                |
 |   Next.js Frontend (React 19, Tailwind v4)                    |
 |   +------------------+  +----------------------------------+  |
 |   |    Sidebar        |  |  Dashboard / Wizard / Settings   |  |
 |   |  - Home           |  |                                  |  |
 |   |  - New Deployment  |  |  +------- Deployment Card ----+ |  |
 |   |  - Settings       |  |  | Status  SSH  Ollama  WebUI  | |  |
 |   +------------------+  |  | [Open Terminal] [Open Chat]  | |  |
 |                          |  +------------------------------+ |  |
 |                          +----------------------------------+  |
 |                                     |                          |
 +------------------------------ WS + REST -----------------------+
                                       |
 +---------------------------------------------------------------+
 |                    FastAPI Backend (Python)                    |
 |                                                                |
 |   Routers          Services            Providers               |
 |   /deployments     Orchestrator        CloudProvider (ABC)     |
 |   /providers       DeploymentStore     +-- AzureProvider       |
 |   /services        WebSocketManager    +-- MockProvider        |
 |   /terminal                            +-- (GCPProvider)       |
 |                                        +-- (AWSProvider)       |
 +---------------------------------------------------------------+
                                       |
                              Azure SDK / Paramiko SSH
                                       |
                              +--------+--------+
                              | Azure Cloud VM  |
                              | NVIDIA GPU      |
                              | Ollama          |
                              | Open WebUI      |
                              +-----------------+
```

The frontend is a Next.js app wrapped in Electron for desktop use. It
communicates with a FastAPI backend over REST and WebSocket. The backend
uses a **provider pattern** — all cloud-specific logic is behind an
abstract `CloudProvider` interface, making it straightforward to add new
cloud providers.

### Key design decisions

- **Single JSON provisioning** — the frontend sends one `POST /api/v1/deployments`
  with the full config and credentials; provisioning runs asynchronously in
  the background
- **Real-time progress** — a WebSocket streams step-by-step updates during
  the 7-step infrastructure provisioning and 7-step software setup
- **Credentials never persisted server-side** — credentials live only in
  memory for the duration of the operation. Client-side persistence uses
  localStorage (with Electron `safeStorage` encryption planned)
- **Embedded terminal** — xterm.js in the frontend connects to a backend
  WebSocket that bridges to the VM via Paramiko SSH
- **Test mode** — setting `PRIVATEAI_TEST_MODE=true` swaps all cloud
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

### Run with real Azure credentials

```bash
docker compose up combined
```

Open **http://localhost:3000**, walk through the wizard, and enter your
Azure service principal credentials (Subscription ID, Tenant ID, Client
ID, Client Secret). The backend will provision real cloud resources.

### Run frontend and backend separately

```bash
# Terminal 1 — backend
docker compose up backend

# Terminal 2 — frontend
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
| `backend` | 8000 | FastAPI backend only |
| `frontend` | 3000 | Next.js frontend only (needs backend running) |
| `combined` | 3000, 8000 | Both services in one container |
| `test` | 3000, 8000 | Both services with `PRIVATEAI_TEST_MODE=true` |
| `dev` | 3000, 8000, 9229 | Interactive shell for development |
| `electron` | — | Runs Electron in a virtual framebuffer (headless) |

---

## API Overview

The backend exposes a RESTful API at `/api/v1/` plus WebSocket endpoints
for real-time features. Full documentation is in
[API_Spec.md](API_Spec.md).

### Provisioning flow

```
GET  /api/v1/providers                           List providers + regions
GET  /api/v1/providers/{p}/vm-sizes              List GPU profiles
POST /api/v1/providers/{p}/validate-credentials  Test credentials
POST /api/v1/deployments                         Create deployment (async)
WS   /api/v1/deployments/{id}/ws                 Real-time progress stream
GET  /api/v1/deployments/{id}/services           Get Ollama/WebUI/SSH URLs
```

### Management

```
POST   /api/v1/deployments/{id}/start            Start stopped VM
POST   /api/v1/deployments/{id}/stop             Deallocate (stops billing)
POST   /api/v1/deployments/{id}/auto-shutdown    Set daily shutdown schedule
POST   /api/v1/deployments/{id}/validate         Run health checks over SSH
POST   /api/v1/deployments/{id}/setup            Re-run software setup
DELETE /api/v1/deployments/{id}                  Destroy all resources
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
|   +-- main.py                         FastAPI entry point
|   +-- app/
|   |   +-- models/                     Pydantic models (config, creds, schemas)
|   |   +-- providers/
|   |   |   +-- base.py                 Abstract CloudProvider interface
|   |   |   +-- registry.py             Provider factory + test mode switch
|   |   |   +-- azure/                  Azure SDK implementation
|   |   |   +-- mock/                   Mock provider for testing
|   |   +-- services/
|   |   |   +-- orchestrator.py         Deployment lifecycle coordinator
|   |   |   +-- deployment_store.py     In-memory state store
|   |   |   +-- ws_manager.py           WebSocket broadcast manager
|   |   +-- routers/
|   |       +-- deployments.py          CRUD + lifecycle endpoints
|   |       +-- providers.py            Provider info + credential validation
|   |       +-- services.py             Service access URLs
|   |       +-- terminal.py             SSH terminal WebSocket bridge
|   +-- tests/                          126 tests across 5 phases
|   +-- testing_procedure.md            Test guide
|
+-- frontend/
|   +-- app/
|   |   +-- page.tsx                    App shell with sidebar routing
|   |   +-- layout.tsx                  Root layout (dark theme, Geist fonts)
|   |   +-- globals.css                 Design system (dark-first, animations)
|   |   +-- lib/                        API client, types, localStorage
|   |   +-- components/
|   |   |   +-- Sidebar.tsx             Collapsible navigation
|   |   |   +-- WelcomeScreen.tsx       Onboarding landing
|   |   |   +-- TerminalPanel.tsx       Embedded xterm.js SSH terminal
|   |   |   +-- WebUIPanel.tsx          Embedded Open WebUI iframe
|   |   |   +-- icons/                  22 SVG icon components
|   |   +-- dashboard/Dashboard.tsx     Deployment cards + lifecycle actions
|   |   +-- provision/ProvisionWizard.tsx   4-step deployment wizard
|   |   +-- settings/Settings.tsx       Preferences + credential management
|   +-- electron/
|       +-- main.ts                     Electron main process
|       +-- preload.js                  IPC bridge
|
+-- docker-compose.yml                  6 service configurations
+-- Dockerfile                          Python 3.12 + Node 20 base
+-- API_Spec.md                         Full API documentation
+-- improvements.md                     Planned feature roadmap
```

---

## Tech Stack

### Backend (~4,000 lines Python)

- **FastAPI** — async REST + WebSocket API
- **Pydantic v2** — request/response validation and serialization
- **Azure SDK** — `azure-mgmt-compute`, `azure-mgmt-network`,
  `azure-mgmt-resource`, `azure-identity`
- **Paramiko** — SSH for VM setup, validation, and terminal bridging
- **pytest** — 126 tests across 5 phases (free through ~$35/hr)

### Frontend (~3,600 lines TypeScript)

- **Next.js 16** — React framework with App Router
- **React 19** — UI rendering
- **Tailwind CSS v4** — utility-first styling with CSS-first configuration
- **Electron** — desktop app shell (macOS, Windows, Linux)
- **xterm.js** — embedded SSH terminal

---

## Testing

Tests are organized into five phases by cost. Phases 1-2 are free and
should run in CI. See [testing_procedure.md](backend/testing_procedure.md)
for the full guide.

```bash
cd backend

# Phase 1 — static analysis (free, <1s)
pytest tests/test_lint.py -m phase1 -v

# Phase 2 — config logic + API shapes (free, <1s)
pytest tests/test_dry_run.py tests/test_api.py -m phase2 -v

# Phase 3 — cheap VM integration (~$0.10/hr, requires Azure creds)
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Phase 4 — remote validation (free, needs a running VM)
AZURE_TEST_VM_IP=<IP> pytest tests/test_validate_remote.py -m phase4 -v -s
```

---

## Adding a New Cloud Provider

The backend is designed for multi-cloud. To add GCP or AWS:

1. Create `backend/app/providers/gcp/provider.py` implementing the
   `CloudProvider` abstract base class (10 methods: `provision`,
   `setup_vm`, `start_vm`, `stop_vm`, `destroy`, `validate`, etc.)
2. Add the credential model to `backend/app/models/credentials.py`
   (stubs for GCP and AWS already exist)
3. Register the provider in `backend/app/providers/registry.py`

No router or schema changes needed — the frontend discovers providers
dynamically via `GET /api/v1/providers`.

---

## Security Model

- **AMD SEV-SNP** — the H100 Confidential VM profile uses AMD Secure
  Encrypted Virtualization with Secure Nested Paging, encrypting all VM
  memory at the hardware level. The cloud provider cannot access your data.
- **Secure Boot + vTPM** — all VM profiles use UEFI Secure Boot and a
  virtual Trusted Platform Module
- **SSH key authentication** — password auth is disabled; only ed25519 key
  pairs are used
- **NSG firewall** — only ports 22 (SSH), 11434 (Ollama), and optionally
  3000 (Open WebUI) are opened, with configurable IP source restrictions
- **No credential persistence on the server** — credentials exist in
  memory only for the duration of the provisioning operation
- **Electron context isolation** — `nodeIntegration` is disabled;
  `contextIsolation` is enabled with a whitelisted IPC bridge

---

## License

This project is not yet licensed. All rights reserved.
