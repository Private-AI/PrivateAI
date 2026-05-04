<div align="center">

<br>

<img src="frontend/app/logos/logo-wordmark-dark.svg" alt="PrivateAI" width="320">

<br>
<br>

### Your AI. Completely private.

**One click to deploy your own private AI server on your own cloud.**  
No cloud expertise. No data on our servers. Hardware-level encryption.

<br>

[![GitHub Stars](https://img.shields.io/github/stars/Aheadz/PrivateAI?style=flat-square&color=6366f1&logo=github)](https://github.com/Aheadz/PrivateAI/stargazers)
[![License](https://img.shields.io/badge/license-MIT-6366f1?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?style=flat-square&logo=fastapi&logoColor=white)](backend/)
[![Next.js](https://img.shields.io/badge/Next.js-frontend-black?style=flat-square&logo=nextdotjs&logoColor=white)](frontend/)

<br>

<!-- Cloud provider support -->
<img src="https://img.shields.io/badge/Microsoft_Azure-Supported-0078D4?style=for-the-badge&logo=microsoftazure&logoColor=white" alt="Azure: Supported">
&nbsp;
<img src="https://img.shields.io/badge/AWS-Coming_Soon-9ca3af?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS: Coming Soon">
&nbsp;
<img src="https://img.shields.io/badge/Google_Cloud-Coming_Soon-9ca3af?style=for-the-badge&logo=googlecloud&logoColor=white" alt="GCP: Coming Soon">

<br>
<br>

> ⚠️ **Experimental:** PrivateAI has been tested and is safe to use with Microsoft Azure.
> It is still experimental software — we make no guarantees. Use at your own risk.

</div>

---

## What is PrivateAI?

PrivateAI is a full-stack application that provisions and manages **private AI servers on your own cloud account** — no shared infrastructure, no third-party data access. It handles the entire lifecycle from a guided wizard: provisioning infrastructure, installing GPU drivers, deploying [Ollama](https://ollama.com) for model serving, and launching [Open WebUI](https://docs.openwebui.com/) locally as a private chat interface that connects directly to your cloud VM.

**The problem it solves:** Every prompt you send to ChatGPT, Claude, or Gemini is logged and stored on someone else's server. For doctors, lawyers, journalists, and engineers handling sensitive IP — this is a dealbreaker. The DIY alternative means days of cloud console work and one mistake leaves your data exposed. PrivateAI bridges that gap.

**Your data never touches our infrastructure.** Your prompts, your models, your conversations — all on hardware you control.

---

## Demo

### Deploy — Zero to private AI

<video src="docs/videos/Deploy.mp4" controls width="100%"></video>

> *Walk through the provision wizard: choose a VM profile, enter Azure credentials, and watch the 13-step live deployment progress stream.*

### Connect & Chat — Fully private

<video src="docs/videos/Azure.mp4" controls width="100%"></video>

> *Click "Connect & Chat" on a running deployment to open the embedded Open WebUI interface. Prompts go directly to your VM — nothing stored anywhere else.*

### Dashboard — Full control, zero surprises

<video src="docs/videos/Dashboard.mp4" controls width="100%"></video>

> *Manage multiple deployments, watch the real-time cost monitor bar, set budget limits with auto-shutdown, and open an embedded SSH terminal — all without leaving the app.*

---

## Key Features

| | Feature |
|---|---|
| ⚡ | **One-click deployment** — guided 4-step wizard from credentials to running GPU VM |
| 🔒 | **Hardware-level encryption** — H100 Confidential VM uses AMD SEV-SNP to encrypt all VM memory |
| 📡 | **Real-time progress** — 13-step WebSocket stream shows exactly what's happening during deploy |
| 💬 | **Embedded chat** — Open WebUI runs locally and connects via SSH tunnel to your Ollama server |
| 💰 | **Budget monitor** — background cost tracker with configurable auto-shutdown before bills spiral |
| 🖥️ | **Embedded terminal** — xterm.js SSH terminal in the dashboard, no external client needed |
| 🔄 | **Full lifecycle** — start, stop, restart, destroy VMs from one dashboard |
| 🧪 | **Test mode** — run the full UI without cloud credentials using a mock provider |
| 💻 | **Desktop app** — ships as an Electron app for macOS, Windows, and Linux |
| 🔌 | **Provider pattern** — clean abstraction layer ready for AWS and GCP backends |

---

## Supported Infrastructure

> **Currently supported: Microsoft Azure.** AWS and GCP providers are planned.

| Profile | GPU | vCPUs | RAM | Est. $/hr | Confidential Computing | Use Case |
|---------|-----|:-----:|:---:|:---------:|:----------------------:|----------|
| **NVIDIA H100** | H100 80GB HBM3 | 40 | 320 GB | ~$35.00 | ✅ AMD SEV-SNP | Production inference with full memory encryption |
| **NVIDIA A100** | A100 80GB | 24 | 220 GB | ~$3.67 | — | Large model inference |
| **NVIDIA T4** | T4 16GB | 4 | 28 GB | ~$0.53 | — | Budget GPU inference |
| **Test VM** | None | 2 | 8 GB | ~$0.10 | — | UI testing, small models, pipeline dev |

Pricing is estimated and varies by Azure region. The cost monitor tracks your actual spend in real-time.

---

## Architecture

```
 Electron Shell (or Browser)
 ┌─────────────────────────────────────────────────────────────────┐
 │  Next.js Frontend (React 19, Tailwind CSS v4)                   │
 │  ┌─────────────────┐  ┌──────────────────────────────────────┐  │
 │  │   Sidebar       │  │  Dashboard / Wizard / Settings       │  │
 │  │  - Dashboard    │  │                                      │  │
 │  │  - New Deploy   │  │  ┌── Deployment Card ─────────────┐  │  │
 │  │  - Settings     │  │  │  Status  ·  SSH  ·  Ollama     │  │  │
 │  │  - Open WebUI   │  │  │  [ Open Terminal ]             │  │  │
 │  │    status widget│  │  │  [ Connect & Chat ]            │  │  │
 │  └─────────────────┘  │  └────────────────────────────────┘  │  │
 │                        │  ┌── Cost Monitor Bar ─────────────┐ │  │
 │                        │  │  $4.21 spent · $0.53/hr · 42%  │ │  │
 │                        │  └────────────────────────────────┘ │  │
 │                        └──────────────────────────────────────┘  │
 └─────────────────────── WebSocket + REST ────────────────────────┘
                                    │
 ┌──────────────────────────────────────────────────────────────────┐
 │                    FastAPI Backend (Python)                       │
 │                                                                  │
 │  Routers              Services             Providers             │
 │  /deployments         Orchestrator         CloudProvider (ABC)   │
 │  /providers           DeploymentStore      ├── AzureProvider     │
 │  /services            WebSocketManager     ├── MockProvider      │
 │  /terminal            CostMonitor          ├── (AWSProvider)     │
 │  /cost                OpenWebuiManager     └── (GCPProvider)     │
 │  /open-webui                                                     │
 │  /azure/cli                                                      │
 └────────────────────────────┬─────────────────────┬──────────────┘
                               │                     │
              Azure SDK + Paramiko SSH    Open WebUI subprocess
                               │         (isolated uv venv,
              ┌────────────────┴───┐      CPU-only PyTorch)
              │  Azure Cloud VM    │               │
              │  NVIDIA GPU        │      http://localhost:8080
              │  Ollama :11434     │
              └────────────────────┘
```

- The **frontend** (Next.js) runs in a browser or Electron shell and communicates with the backend over REST and WebSocket.
- The **backend** (FastAPI) uses a provider pattern — all cloud logic sits behind a `CloudProvider` interface, making new providers straightforward to add.
- **Open WebUI** runs locally inside the same Docker container as the backend, in an isolated Python venv. It connects to your cloud VM's Ollama server through an SSH tunnel — port 11434 is never publicly exposed.
- **Credentials** live in memory only during provisioning. Nothing is transmitted to PrivateAI's infrastructure.

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- An **Azure account** with a service principal — see [Azure Setup](#azure-setup) below

---

### 1. Try it without cloud credentials (Test Mode)

The `test` service runs the full UI against a mock provider that simulates deployments with realistic delays. No Azure account required — great for exploring the app or developing UI.

```bash
git clone https://github.com/Aheadz/PrivateAI.git
cd PrivateAI

docker compose up test
```

Open **http://localhost:3000** in your browser.  
API docs: **http://localhost:8000/docs**  
Open WebUI: **http://localhost:8080** (after starting from the app)

---

### 2. Deploy a real AI server on Azure

```bash
docker compose up combined
```

Open **http://localhost:3000** and follow the wizard:

1. **Choose provider** — select Azure
2. **Connect credentials** — use the one-click Microsoft login (device-code flow), or enter your service principal credentials manually
3. **Configure VM** — pick a GPU profile, region, and Ollama models to pre-install
4. **Deploy** — watch the 13-step live progress stream

Once deployed, click **"Connect & Chat"** on the dashboard card to open the embedded Open WebUI interface.

---

### 3. Run frontend and backend separately

```bash
# Terminal 1 — backend only
docker compose up backend

# Terminal 2 — frontend only
docker compose up frontend
```

---

### 4. Run as an Electron desktop app (development)

```bash
cd frontend
npm install
npm run dev:electron
```

The Next.js dev server starts and Electron launches once it is ready. The backend must be running separately.

### Build a distributable desktop app

```bash
cd frontend
npm run build:all
npm run dist
```

This produces platform-specific installers in `frontend/dist/` — `.app` for macOS, NSIS installer for Windows, AppImage for Linux.

---

## Azure Setup

PrivateAI needs four credentials to provision VMs on your Azure account. You can get them via the **one-click login flow** inside the app (recommended), or set them up manually.

### Option A: One-click login (recommended)

In the provision wizard, click **"Sign in with Microsoft"**. PrivateAI opens a device-code login flow — you authenticate in your browser, and the app automatically creates a Service Principal and assigns the necessary RBAC role. No portal navigation required.

### Option B: Manual setup

> For a detailed walkthrough see [docs/azure_guide.md](docs/azure_guide.md).

**Step 1:** Install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) and log in:

```bash
az login
az account show  # note your Subscription ID
```

**Step 2:** Create a Service Principal with Contributor access:

```bash
az ad sp create-for-rbac \
  --name privateai-provisioner \
  --role Contributor \
  --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID>
```

This returns:

```json
{
  "appId":    "<AZURE_CLIENT_ID>",
  "password": "<AZURE_CLIENT_SECRET>",
  "tenant":   "<AZURE_TENANT_ID>"
}
```

**Step 3:** Collect your four credentials:

| Credential | Where to find it |
|---|---|
| **Subscription ID** | `az account show --query id -o tsv` |
| **Tenant ID** | `tenant` field from the command above |
| **Client ID** | `appId` field from the command above |
| **Client Secret** | `password` field — shown **once only**, save it immediately |

Enter these in the PrivateAI settings or the provision wizard. They are stored locally in a Docker volume only — never transmitted to our servers.

> ⚠️ The client secret is displayed only once by Azure. Copy it before closing the terminal.

---

## Docker Compose Services

| Service | Ports | Description |
|---------|:-----:|-------------|
| `test` | 3000, 8000, 8080 | Frontend + backend with mock provider — no Azure credentials needed |
| `combined` | 3000, 8000, 8080 | Frontend + backend with real Azure cloud |
| `backend` | 8000, 8080 | FastAPI backend + Open WebUI only |
| `frontend` | 3000 | Next.js frontend only (requires backend running) |
| `dev` | 3000, 8000, 8080, 9229 | Interactive shell for development |
| `electron` | — | Electron in a virtual framebuffer (headless, for CI) |

All services mount `./open-webui-data/` as a Docker volume for Open WebUI's persistent storage (SQLite database, chat history, uploaded files).

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` for local development. For production deployments, copy `.env.prod.example` to `.env.prod` on your server.

| Variable | Default | Description |
|---|---|---|
| `PRIVATEAI_TEST_MODE` | `false` | Use mock provider — no Azure calls made |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins (comma-separated) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL as seen by the browser |
| `OPEN_WEBUI_PORT` | `8080` | Local port for the Open WebUI subprocess |

---

## API Overview

The backend serves a REST + WebSocket API at `/api/v1/`. Interactive docs are at **http://localhost:8000/docs**.

### Provisioning

```
GET  /api/v1/providers                               List providers and regions
POST /api/v1/providers/{p}/validate-credentials      Validate Azure credentials
POST /api/v1/providers/{p}/accessible-vm-sizes       Quota-aware VM size list for your subscription
POST /api/v1/deployments                             Create deployment (async, returns 202)
WS   /api/v1/deployments/{id}/ws                     Live 13-step progress stream
```

### Lifecycle management

```
POST   /api/v1/deployments/{id}/start                Start a stopped VM
POST   /api/v1/deployments/{id}/stop                 Deallocate VM (pauses billing)
DELETE /api/v1/deployments/{id}                      Destroy all Azure resources
POST   /api/v1/deployments/destroy-managed-resources Bulk-destroy all PrivateAI-tagged resource groups
WS     /api/v1/deployments/{id}/terminal             Embedded SSH terminal bridge
```

### Cost monitoring

```
GET  /api/v1/cost/budget                             Current budget configuration
POST /api/v1/cost/budget                             Set global budget limits + auto-shutdown thresholds
GET  /api/v1/cost/report                             Full cost report with per-deployment breakdown
GET  /api/v1/cost/alerts                             Recent budget alerts
POST /api/v1/cost/deployments/{id}/budget            Set per-deployment spending cap
```

### Open WebUI

```
GET  /api/v1/open-webui/status                       Status + currently connected deployment
POST /api/v1/open-webui/connect                      Connect to a deployment's Ollama over SSH tunnel
POST /api/v1/open-webui/start                        Start the Open WebUI subprocess
POST /api/v1/open-webui/stop                         Stop the Open WebUI subprocess
PUT  /api/v1/open-webui/config                       Update configuration and restart
```

### Azure CLI (one-click login)

```
POST /api/v1/azure/cli/login/start                   Begin device-code login flow
GET  /api/v1/azure/cli/login/status?session_id=…     Poll for authentication completion
POST /api/v1/azure/cli/provision                     Create Service Principal + assign RBAC
POST /api/v1/azure/cli/login/cancel?session_id=…     Cancel an in-progress login session
```

---

## Project Structure

```
PrivateAI/
├── backend/
│   ├── main.py                        FastAPI entry point (6 routers, startup/shutdown hooks)
│   ├── requirements.txt               Python dependencies
│   └── app/
│       ├── models/                    Pydantic models (deployment, credentials, cost, open-webui)
│       ├── providers/
│       │   ├── base.py                Abstract CloudProvider interface (15 methods)
│       │   ├── registry.py            Provider factory + PRIVATEAI_TEST_MODE switch
│       │   ├── azure/
│       │   │   ├── provider.py        Full Azure SDK provisioning lifecycle
│       │   │   ├── config.py          VM profiles with pricing and region support
│       │   │   ├── vm_setup.py        SSH automation: GPU drivers, Ollama, model pulls
│       │   │   └── validator.py       SSH health checks (10 checks)
│       │   └── mock/
│       │       └── provider.py        Mock provider for test mode
│       ├── services/
│       │   ├── orchestrator.py        Deployment lifecycle coordinator
│       │   ├── deployment_store.py    JSON-persisted deployment state store
│       │   ├── ws_manager.py          Per-deployment WebSocket broadcast manager
│       │   ├── cost_monitor.py        Background cost tracking + auto-shutdown (30s tick)
│       │   └── open_webui_manager.py  Open WebUI subprocess lifecycle
│       └── routers/                   HTTP + WebSocket route handlers
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                   App shell + sidebar routing
│   │   ├── dashboard/Dashboard.tsx    Deployment cards, cost bar, terminal/chat panels
│   │   ├── provision/ProvisionWizard.tsx  4-step deployment wizard
│   │   ├── settings/Settings.tsx      Credentials, preferences, budget, Open WebUI config
│   │   ├── components/                Sidebar, TerminalPanel, WebUIPanel, CostMonitor, icons
│   │   └── lib/                       API client (28 functions), TypeScript types, localStorage
│   └── electron/                      Electron main process + whitelisted IPC bridge
│
├── docs/                              Guides, API spec, architecture docs
│   └── videos/                        Demo screen recordings
├── docker-compose.yml                 Six service configurations
├── Dockerfile                         Python 3.12 + Node 20 + Open WebUI venv
└── Caddyfile                          Caddy reverse proxy config for production HTTPS
```

---

## Tech Stack

**Backend (~5,000 lines Python)**

- [FastAPI](https://fastapi.tiangolo.com/) — async REST + WebSocket API
- [Azure SDK](https://github.com/Azure/azure-sdk-for-python) — `azure-mgmt-compute`, `azure-mgmt-network`, `azure-mgmt-resource`, `azure-identity`
- [Paramiko](https://www.paramiko.org/) — SSH for VM setup, validation, and live terminal bridging
- [Open WebUI](https://docs.openwebui.com/) — managed subprocess in an isolated `uv` venv with CPU-only PyTorch

**Frontend (~4,500 lines TypeScript)**

- [Next.js 16](https://nextjs.org/) with React 19 and the App Router
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first, dark-first design system
- [Electron 41](https://www.electronjs.org/) — desktop app shell (macOS, Windows, Linux)
- [xterm.js](https://xtermjs.org/) — embedded SSH terminal

---

## Security Model

| Mechanism | Detail |
|---|---|
| **AMD SEV-SNP** | H100 Confidential VM profile encrypts all VM memory at the hardware level — even the hypervisor cannot read it |
| **Secure Boot + vTPM** | All VM profiles use UEFI Secure Boot and a virtual Trusted Platform Module |
| **SSH tunnel for Ollama** | Port 11434 is never opened in the Azure NSG; all Ollama traffic flows through the encrypted SSH tunnel |
| **SSH ed25519 keys** | Password authentication is disabled on all cloud VMs |
| **NSG firewall** | Only port 22 (SSH) is opened; configurable IP source restrictions available |
| **No external credential storage** | Credentials live in memory during provisioning and are then persisted only to a local Docker volume — never transmitted externally |
| **Electron context isolation** | `nodeIntegration` disabled; `contextIsolation` enabled with a whitelisted IPC bridge |
| **Open WebUI single-user mode** | `WEBUI_AUTH=False`; bound to `localhost` only; no public port exposed |
| **Isolated Azure CLI sessions** | Each login flow uses its own temp `AZURE_CONFIG_DIR`; PrivateAI never touches `~/.azure/` on the host |

---

## Testing

Tests are organized into phases by cost and environment requirements. Phases 1 and 2 are free and run offline.

```bash
cd backend

# Phase 1 — static analysis (free, <1s)
pytest tests/test_lint.py -m phase1 -v

# Phase 2 — config logic and API shape checks (free, <1s)
pytest tests/test_dry_run.py tests/test_api.py -m phase2 -v

# Phase 3 — real Azure integration test with a cheap CPU VM (~$0.10/hr)
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Phase 4 — remote validation (free, requires a running VM)
AZURE_TEST_VM_IP=<IP> pytest tests/test_validate_remote.py -m phase4 -v -s

# Manual — full Azure device-code login flow (requires human interaction)
pytest tests/test_azure_cli_setup.py -m manual -v -s
```

---

## Adding a New Cloud Provider

The backend is built for multi-cloud from day one. To add AWS or GCP:

1. Implement `CloudProvider` in `backend/app/providers/gcp/provider.py` — the abstract base class defines 15 methods
2. Add the credential model to `backend/app/models/credentials.py` (stubs for GCP and AWS already exist)
3. Register the provider in `backend/app/providers/registry.py`

No router or schema changes needed — the frontend discovers providers dynamically via `GET /api/v1/providers`.

---

## Contributing

Contributions are welcome and we'd love your help making PrivateAI better. Feel free to open a pull request!

### How to contribute

1. **Fork** the repository and create a feature branch from `main`
2. **Make your changes** — keep them focused; one feature or fix per PR works best
3. **Run the tests** — at minimum Phase 1 and Phase 2 before submitting
4. **Open a Pull Request** — describe what you changed and why, and link any relevant issues

We review all pull requests. If you're planning something substantial, open an issue first to discuss the approach — this avoids duplicate effort and helps us give early feedback.

### Good places to start

- Adding a new Ollama model to the built-in preset list
- Improving error messages in the provision wizard
- Writing tests for uncovered code paths
- Documentation improvements
- UI polish and accessibility fixes

### What we're working toward

- **AWS provider** — EC2 GPU instances with the same one-click experience
- **GCP provider** — Vertex AI-compatible GPU VMs
- **Model management UI** — browse, pull, and delete Ollama models from the dashboard
- **Multi-user mode** — shared team deployments with per-user access control
- **Signed Electron builds** — code-signed macOS and Windows desktop installers

---

## Disclaimer

> ⚠️ **Experimental Software**
>
> PrivateAI has been tested end-to-end and is safe to use with **Microsoft Azure**. However, it is still experimental software under active development. Cloud infrastructure provisioning carries inherent risk — misconfigured resources can result in unexpected costs, data loss, or security exposure.
>
> **We make no guarantees.** You are responsible for the cloud resources provisioned in your account, the costs they incur, and the security of your credentials. Always review the resources PrivateAI creates in your Azure portal and configure a budget limit within the app before deploying.
>
> Use at your own risk.

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with care for everyone who needs AI to stay private.

<br>

<img src="frontend/app/logos/logo-icon-transparent.svg" alt="PrivateAI" width="48">

</div>
