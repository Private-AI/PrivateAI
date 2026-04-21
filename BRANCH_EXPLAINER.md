# Branch Explainer: `feat/hosted-demo`

> **Purpose:** This document explains what `feat/hosted-demo` is, how it differs from `main`, and why the divergence exists. It is intended for reviewers, future maintainers, and anyone deciding which branch to use.

---

## One-Sentence Summary

`feat/hosted-demo` is a **privacy-first, hosted web application** that users can deploy on a VPS and share with others. `main` is a **single-binary desktop app** (Electron + PyInstaller) that runs entirely on the user's local machine.

Both branches provision Azure VMs and run AI models via Ollama + Open WebUI, but the delivery model, credential handling, and deployment architecture are completely different.

---

## Why Two Branches?

The project has two distinct product experiments:

| Branch | Product Goal | Deployment Target |
|--------|-------------|-------------------|
| `main` (and `feat/electron-single-binary`) | Personal desktop tool — one user, one machine | Local executable (AppImage / .exe / .dmg) |
| `feat/hosted-demo` | Shared hosted demo — multiple users, one server | VPS / cloud instance via Docker Compose |

We keep them on separate branches because they are **not mergeable** without massive conditional complexity. The frontend build target (Electron vs SSR), the credential storage model (none vs zero-knowledge vault), and the Open WebUI lifecycle (local subprocess vs external container) are fundamentally incompatible.

---

## High-Level Architecture Differences

### `main` — Desktop Single-Binary

```
┌─────────────────────────────────────┐
│  Electron Shell (supervisor)        │
│  ├── Next.js Frontend (static)      │
│  ├── FastAPI Backend (PyInstaller)  │
│  └── Open WebUI (bundled venv)      │
│       ^ runs as child process       │
└─────────────────────────────────────┘
           │
           v
    Azure Cloud VM (Ollama)
```

- **Packaging:** PyInstaller bundles the backend; Electron bundles the frontend; Open WebUI ships as a raw venv. Total size ~811 MB.
- **State:** Data lives in `privateai-data/` next to the executable (`PRIVATEAI_DATA_DIR`).
- **Auth:** None. Single-user desktop app.
- **Credentials:** Sent per-request from the frontend, held in memory only, never persisted server-side.
- **Open WebUI:** Spawned as a local subprocess by `OpenWebuiManager`, CPU-only PyTorch, connects to whichever deployment is active.
- **SSH Keys:** Not applicable — the backend uses Paramiko directly; users open embedded terminals via WebSocket bridge.

### `feat/hosted-demo` — Hosted Web App

```
User A ──┐
User B ──┼──> VPS (Docker Compose)
User C ──┘        ├── nginx :80
                  │   ├── /api/*    → FastAPI
                  │   ├── /open-webui/* → Open WebUI
                  │   └── /*        → Next.js SSR
                  ├── backend (SQLite user + vault DB)
                  └── open-webui (multi-user container)
                           │
                           v
                    User's Azure VM (Ollama)
```

- **Packaging:** Three Docker containers (frontend, backend, open-webui) + nginx reverse proxy. Deployed with `docker-compose.hosted.yml`.
- **State:** SQLite for users and encrypted vault blobs; deployment metadata in memory.
- **Auth:** JWT-based login/register. Short-lived tokens (30 min). bcrypt password hashes.
- **Credentials:** **Zero-knowledge vault** — AES-256-GCM encrypted in the browser with a password-derived key (PBKDF2). The server stores opaque base64 blobs it cannot decrypt.
- **SSH Keys:** **Never sent to the server.** Stored in browser `localStorage`. Used by the frontend to open direct SSH sessions (or copied by the user).
- **Open WebUI:** Runs as an **external Docker container** in multi-user mode. The backend manages its lifecycle (restart, env vars) but it is not a subprocess.

---

## Feature Comparison

| Feature | `main` | `feat/hosted-demo` |
|---------|--------|-------------------|
| **Frontend** | Next.js static export inside Electron | Next.js SSR (standalone server) |
| **Backend** | FastAPI, single process | FastAPI + SQLite + nginx |
| **Packaging** | PyInstaller + Electron | Docker Compose |
| **Multi-user** | No | Yes (JWT auth) |
| **Credential storage** | In-memory only, per-request | Client-side encrypted vault (zero-knowledge) |
| **SSH private keys** | Backend handles SSH | Browser-only; never hits server |
| **Open WebUI** | Local subprocess, CPU-only | External container, GPU-capable host |
| **Cost monitoring** | Not present | Full cost monitor (background + UI) |
| **SSH tunneling** | Not present | Automatic tunnel for secure VM access |
| **Test mode** | `PRIVATEAI_TEST_MODE=true` | Same mock provider, still supported |
| **Privacy endpoint** | No | `/privacy` transparency statement |
| **Embedded terminal** | xterm.js ↔ WebSocket ↔ Paramiko | Same, but SSH keys come from browser |

---

## Major Code Changes

### 1. Authentication System (new + hardened)

**Files added:**
- `backend/app/routers/auth.py` — `POST /register`, `POST /login`, `GET /me`
- `backend/app/models/user.py` — SQLite user DB with bcrypt hashes
- `backend/app/utils/auth.py` — JWT creation/verification, password hashing *(switched from passlib to native `bcrypt` to avoid a Python 3.12 self-test crash)*
- `backend/app/utils/rate_limit.py` — Sliding-window in-memory rate limiter for auth endpoints
- `frontend/components/AuthProvider.tsx` — React context for auth state
- `frontend/app/login/page.tsx` — Login/Register UI

**How it works:**
- Users register with username + password.
- Password is hashed with bcrypt; only the hash is stored in SQLite.
- Login returns a short-lived JWT (30 minutes).
- All deployment endpoints are protected with `Depends(get_current_user)`.
- **Rate limiting:** Auth endpoints are protected by a sliding-window rate limiter (5 requests / 60 seconds per IP) to prevent brute-force attacks.
- **Secret key enforcement:** The app refuses to start if `PRIVATEAI_SECRET_KEY` is missing or shorter than 32 characters.

### 2. Client-Side Encrypted Vault (new)

**Files added:**
- `backend/app/routers/vault.py` — Store/retrieve/delete opaque encrypted blobs
- `frontend/lib/vault.ts` — `vaultEncrypt()` / `vaultDecrypt()` using Web Crypto API *(fixed `btoa` crash for large payloads)*

**How it works:**
1. User enters Azure credentials + SSH private key in the provision wizard.
2. Frontend serializes to JSON, encrypts with AES-256-GCM.
3. Key is derived from the user's password via PBKDF2 (100k iterations, SHA-256, random salt).
4. The encrypted blob (salt + IV + ciphertext, base64) is sent to `/api/v1/vault/store`.
5. Server stores the blob in SQLite. **It cannot decrypt it.**
6. On provision, frontend retrieves the blob, decrypts it in memory, and sends credentials in the deployment request headers.

**Security properties:**
- A full server breach reveals only encrypted blobs. Without the user's password, they are useless.
- The server operator cannot read Azure credentials, cannot access VMs, and cannot charge the user's account.

### 3. Multi-User Isolation (new)

**Files changed:**
- `backend/app/models/deployment.py` — Added `user_id` to `DeploymentRecord`
- `backend/app/services/deployment_store.py` — All CRUD operations filtered by `user_id`
- `backend/app/services/orchestrator.py` — Validates ownership on every action (GET, DELETE, tunnel, logs)

**How it works:**
- Every deployment is tagged with the `user_id` of the user who created it.
- Users can only see, manage, or delete their own deployments.
- Attempting to access another user's deployment returns `404 Not Found` (not 403) to prevent user ID enumeration.

### 4. Cost Monitor (new)

**Files added:**
- `backend/app/services/cost_monitor.py` — Background cost tracker (30-second tick)
- `backend/app/routers/cost.py` — Budget, reports, alerts endpoints
- `backend/app/models/cost.py` — Cost models and per-SKU pricing
- `frontend/app/components/cost/CostMonitor.tsx` — Real-time cost bar in dashboard

**How it works:**
- Cost monitor tracks VM runtime using Azure retail pricing (hardcoded fallback table + live SKU API).
- Budget alerts fire at 50 %, 80 %, 95 %, and 100 % of the user-defined limit.
- Auto-shutdown stops VMs when the budget is exceeded.
- Frontend shows a live cost bar: `$4.21 spent | $3.67/hr | 42 % of budget`.

### 5. Open WebUI as External Service (changed)

**Files changed:**
- `backend/app/routers/open_webui.py` — Simplified to manage an external service instead of a subprocess
- `backend/app/services/open_webui_manager.py` — Removed subprocess spawning; now updates env vars and signals container restart
- `docker-compose.hosted.yml` — Adds `open-webui` service using the official image

**Difference:**
- `main`: `OpenWebuiManager` spawns `python -c "from open_webui import app; app(['serve'])"` in a bundled venv. It runs CPU-only PyTorch and binds to `localhost:8080`.
- `feat/hosted-demo`: Open WebUI runs in its own Docker container. The backend tells it which Ollama URL to connect to via environment variables. Multi-user mode is enabled.

### 6. SSH Tunneling (new)

**Files added:**
- `backend/app/services/ssh_tunnel.py` — Persistent SSH tunnel to remote Ollama API

**How it works:**
- When a deployment is active, the backend establishes a reverse or forward SSH tunnel so the local Open WebUI container can reach the remote Ollama server without exposing Ollama to the public internet.
- Tunnel is torn down on deployment stop or switch.

### 7. SSH Key Handling (hardened)

**Files added:**
- `backend/app/utils/ssh_key.py` — Secure temporary file creation for PEM keys (`0o600` permissions)

**How it works:**
- SSH private keys are collected in the frontend and sent in the deployment payload (memory only).
- The backend writes the key to a temporary file with strict `0o600` permissions for Paramiko to use.
- The file is immediately deleted after the deployment is destroyed or the tunnel is closed.
- Keys are **never** written to the SQLite database or persisted to disk long-term.

### 8. WebSocket Security (new)

**Files changed:**
- `backend/app/routers/deployments.py` — Validates JWT from `token` query parameter before accepting WebSocket upgrades
- `backend/app/routers/terminal.py` — Same JWT validation for terminal WebSockets

**How it works:**
- Standard WebSockets do not support custom headers, so the JWT is passed as a `token` query parameter.
- The backend validates the token with the same logic as REST API requests before allowing the upgrade.
- This prevents unauthenticated users from connecting to deployment logs or terminal sessions.

### 9. Deployment & Infrastructure (changed)

**Files added:**
- `docker-compose.hosted.yml` — Production Docker Compose with nginx, frontend, backend, open-webui
- `Dockerfile.backend` — Python 3.12 slim image for FastAPI
- `Dockerfile.frontend` — Next.js standalone SSR image
- `nginx/nginx.conf` — Reverse proxy routing `/api`, `/open-webui`, and root traffic *(fixed WebSocket upgrade headers)*
- `HOSTED.md` — Step-by-step VPS deployment guide

**Files removed / no longer used:**
- Electron build config (still in tree but not used in hosted path)
- PyInstaller spec files (irrelevant for Docker deployment)

### 10. Azure Provider Hardening (enhanced)

**Files changed:**
- `backend/app/providers/azure/provider.py` — SKU fallback loop, auto-cleanup on failure, quota-aware size filtering
- `backend/app/providers/azure/vm_setup.py` — GPU detection, conditional NVIDIA driver install, Ollama setup fixes
- `backend/app/providers/azure/config.py` — Updated defaults (region `centralus`, `gpu_enabled=False`, `security_level=STANDARD`)

**Key fixes not present on `main`:**
- **SKU fallback**: When the primary VM size is unavailable, the provider tries a ranked fallback list automatically.
- **Auto-cleanup on failure**: Deletes VM → NIC → Public IP (blocking) before async resource group deletion, freeing quota immediately.
- **CPU-only path**: NVIDIA driver install is skipped on CPU VMs, preventing setup aborts.
- **Ollama permissions**: `chown ollama:ollama` applied after Ollama installer creates the user, fixing blob directory permissions.

### 11. Frontend Changes

**Files changed:**
- `frontend/app/provision/ProvisionWizard.tsx` — Added SSH private key input, vault integration, auth-gated flow
- `frontend/app/dashboard/Dashboard.tsx` — Added cost monitor bar, auth-aware UI
- `frontend/app/settings/Settings.tsx` — Added budget settings, vault management
- `frontend/app/components/Sidebar.tsx` — Added Open WebUI status widget, login/logout
- `frontend/app/lib/api.ts` — Added auth headers, vault API helpers *(fixed to attach Bearer tokens on every request)*

---

## Data & Privacy Model

| Asset | `main` Desktop | `feat/hosted-demo` |
|-------|---------------|-------------------|
| **Azure credentials** | Sent per-request, memory only | Client-side encrypted vault (server sees blob) |
| **SSH private key** | Backend holds it in memory | Browser `localStorage` only — **never sent** |
| **Chat history** | Local Open WebUI SQLite | User's VM only |
| **File uploads** | Local Open WebUI storage | User's VM only |
| **User password** | N/A (no auth) | bcrypt hash on server |
| **Deployment metadata** | In-memory store | In-memory store + SQLite user/vault DB |

---

## Which Branch Should I Use?

| Use Case | Recommended Branch |
|----------|-------------------|
| Personal tool, single user, offline-capable | `main` / `feat/electron-single-binary` |
| Shared demo, team evaluation, SaaS-like | `feat/hosted-demo` |
| Maximum privacy, no server trust | `feat/hosted-demo` (self-host on your own VPS) |
| Quick testing / CI | Either — both support `PRIVATEAI_TEST_MODE=true` |

---

## Merging Notes

These branches are **intentionally diverged** and should not be merged blindly:

1. **Frontend build target**: `main` uses Next.js static export for Electron; `feat/hosted-demo` uses Next.js standalone SSR. The `next.config.js` and Dockerfiles conflict.
2. **Credential flow**: `main` assumes credentials arrive raw in the deployment request; `feat/hosted-demo` expects them to come from the vault decryption flow.
3. **Open WebUI lifecycle**: `main` manages a subprocess; `feat/hosted-demo` manages an external container via env vars.
4. **Auth**: `feat/hosted-demo` routers are wrapped in auth dependencies; `main` has no auth and would break if those dependencies were added without equivalent login UI.

If you need both delivery modes in one codebase, the cleanest approach is a **monorepo with shared packages** (common providers, shared types) and separate apps (`apps/desktop`, `apps/hosted`). That is out of scope for the current branch strategy.

---

## How to Run This Branch

```bash
git checkout feat/hosted-demo
cp .env.hosted.example .env
# Edit .env — set PRIVATEAI_SECRET_KEY and OPEN_WEBUI_SECRET_KEY
docker compose -f docker-compose.hosted.yml up -d
```

See `HOSTED.md` for full VPS deployment instructions.

---

*Last updated: 2026-04-22*
