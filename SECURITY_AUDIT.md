# Security & Implementation Audit — `feat/hosted-demo`

> **Date:** 2026-04-22  
> **Scope:** Auth system, client-side encryption, Open WebUI setup, frontend  
> **Severity Legend:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

The `feat/hosted-demo` branch has **four critical flaws that make it non-functional and insecure** in a multi-user hosted setting:

1. **The frontend never sends JWT tokens**, so every authenticated API call fails with 401.
2. **Deployments are not isolated by user** — any logged-in user can destroy any other user's VMs.
3. **The client-side encrypted vault is dead code** — implemented but never called by any component.
4. **SSH private keys are collected but never transmitted**, so the backend cannot connect to VMs for setup, tunneling, or terminals.

Additionally, the Open WebUI integration is architecturally incompatible with the Docker Compose setup (subprocess manager vs. external container), and nginx is missing WebSocket upgrade headers, breaking real-time progress and terminals.

---

## 1. Authentication System

### 🔴 CRITICAL: No JWT attached to any API request
**Location:** `frontend/app/lib/api.ts`  
**Problem:** The `request()` and `requestRoot()` helpers build `fetch()` calls but never read `localStorage.getItem("privateai_token")` or attach an `Authorization` header.

```typescript
// frontend/app/lib/api.ts (lines 31-61)
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${V1}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
    ...options,
  });
  // ...
}
```

**Impact:** Every deployment endpoint (create, list, start, stop, destroy) and every cost/vault/Open WebUI endpoint returns **401 Unauthorized** immediately after login. The app is completely broken for real use.

**Fix:** Inject the token into every request:
```typescript
const token = typeof window !== "undefined" ? localStorage.getItem("privateai_token") : null;
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(options.headers as Record<string, string> | undefined),
};
```

---

### 🔴 CRITICAL: No user isolation on deployments
**Location:** `backend/app/models/deployment.py`, `backend/app/services/deployment_store.py`, `backend/app/routers/deployments.py`

**Problem:**
- `DeploymentRecord` has **no `user_id` field**.
- `DeploymentStore.list_all()` returns **every deployment in the system**.
- Router endpoints accept `user: User = Depends(get_current_user)` but **never use it to filter or authorize**.

```python
# backend/app/routers/deployments.py (lines 91-95)
@router.get("")
async def list_deployments(user: User = Depends(get_current_user)):
    orchestrator = get_orchestrator()
    records = orchestrator.store.list_all()   # ← returns ALL users' VMs
    return DeploymentListResponse(...)
```

```python
# backend/app/routers/deployments.py (lines 103-109)
@router.get("/{deployment_id}")
async def get_deployment(deployment_id: str, user: User = Depends(get_current_user)):
    record = orchestrator.store.get(deployment_id)
    if not record:
        raise HTTPException(404, detail="Deployment not found")
    return _record_to_status(record)   # ← no ownership check
```

**Impact:** Any authenticated user can **see, start, stop, and destroy** VMs belonging to other users. Complete multi-tenancy failure.

**Fix:**
1. Add `user_id: str` to `DeploymentRecord`.
2. Filter all store queries by `user_id`.
3. In every router handler, verify `record.user_id == user.id` before returning or mutating.

---

### 🔴 CRITICAL: WebSocket endpoints are unauthenticated
**Location:** `backend/app/routers/deployments.py` (line 480), `backend/app/routers/terminal.py` (line 201)

**Problem:** Both the deployment progress WebSocket (`/{deployment_id}/ws`) and the terminal WebSocket (`/{deployment_id}/terminal`) accept connections **without validating the JWT**.

```python
@router.websocket("/{deployment_id}/ws")
async def deployment_ws(websocket: WebSocket, deployment_id: str):
    await ws_manager.connect(deployment_id, websocket)
    # ...no auth...
```

**Impact:**
- Any client that knows a deployment ID can snoop on provisioning progress.
- Any client can open an interactive SSH terminal to any VM (terminal WS).

**Fix:** Validate the `Authorization` header or query-param token during the WebSocket handshake before calling `websocket.accept()`.

---

### 🟠 HIGH: Default JWT secret fallback in source code
**Location:** `backend/app/utils/auth.py`

**Problem:** If `PRIVATEAI_SECRET_KEY` is not set, the code falls back to a hardcoded string:
```python
SECRET_KEY = os.environ.get("PRIVATEAI_SECRET_KEY", "demo-secret-change-me-in-production")
```

**Impact:** Anyone with access to the source can forge JWTs for any user.

**Fix:** Crash on startup if the env var is missing or too short:
```python
SECRET_KEY = os.environ.get("PRIVATEAI_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("PRIVATEAI_SECRET_KEY must be set to a >=32 character random string")
```

---

### 🟠 HIGH: No rate limiting on auth endpoints
**Location:** `backend/app/routers/auth.py`

**Problem:** `/register` and `/login` have no rate limiting, IP blocking, or CAPTCHA.

**Impact:** Brute-force password guessing and username enumeration are trivial.

**Fix:** Add in-memory rate limiting (e.g., `slowapi` or a simple dict + timestamp) — max 5 attempts per IP per 15 minutes.

---

### 🟡 MEDIUM: SQLite thread-safety without WAL
**Location:** `backend/app/models/user.py` (line 52), `backend/app/routers/vault.py` (line 51)

**Problem:** Both user and vault databases open SQLite with `check_same_thread=False`. Under FastAPI's thread pool and concurrent requests, this can cause "database is locked" errors.

**Fix:** Enable WAL mode on connection:
```python
conn.execute("PRAGMA journal_mode=WAL")
```

---

### 🟡 MEDIUM: CORS allows localhost in production
**Location:** `backend/main.py` (lines 52-68)

**Problem:** Default CORS origins include `http://localhost:3000` and `http://frontend:3000`. If `PRIVATEAI_CORS_ORIGINS` is not explicitly overridden, localhost remains allowed even in production.

**Fix:** Make localhost defaults conditional on an explicit `PRIVATEAI_DEV_MODE=true` flag.

---

## 2. Client-Side Encryption (Vault)

### 🔴 CRITICAL: Vault is dead code — never used
**Location:** `frontend/lib/vault.ts` (implemented), nowhere (used)

**Problem:** The vault module exports `vaultEncrypt`, `vaultDecrypt`, `storeVault`, and `retrieveVault`. A global search across `frontend/` shows **zero imports** of these functions.

**Impact:**
- The "zero-knowledge" credential storage is **purely theoretical**.
- Users must re-enter Azure credentials on every server restart (credentials are memory-only).
- The SSH private key field in the wizard has no persistence mechanism at all.

**Fix:** Integrate vault operations into the login flow and provision wizard:
1. After login, derive the vault key from the password and call `retrieveVault()`.
2. Decrypt the blob and pre-fill the credential form.
3. On "save credentials", encrypt and call `storeVault()`.

---

### 🟡 MEDIUM: `btoa` / `atob` spread operator crash for large ciphertexts
**Location:** `frontend/lib/vault.ts` (lines 60, 67)

**Problem:**
```typescript
return btoa(String.fromCharCode(...combined));
```
JavaScript functions have a maximum argument count (~65,535). If the encrypted blob exceeds this, the spread operator throws `RangeError: Maximum call stack size exceeded`.

**Fix:** Use a chunk-based approach or `Buffer` / `Array.from`:
```typescript
const binary = Array.from(combined, (b) => String.fromCharCode(b)).join("");
return btoa(binary);
```

---

### 🟡 MEDIUM: Credentials saved to localStorage in plaintext
**Location:** `frontend/app/lib/storage.ts`, `frontend/app/provision/ProvisionWizard.tsx`

**Problem:** The "Save credentials" checkbox writes `AzureCredentials` (including `client_secret`) to `localStorage` as plaintext JSON.

```typescript
saveSettings({ savedCredentials: { subscription_id, tenant_id, client_id, client_secret } });
```

**Impact:** Any XSS vulnerability or browser extension can steal Azure credentials.

**Fix:** Remove plaintext credential storage. Use the encrypted vault instead, or at minimum remove the `saveCredentials` feature until the vault is integrated.

---

## 3. Open WebUI Setup

### 🔴 CRITICAL: SSH private key collected but never transmitted
**Location:** `frontend/app/provision/ProvisionWizard.tsx` (lines 261, 329-338, 814, 1053)

**Problem:**
- The wizard collects `ssh_private_key` in `CredentialFormState`.
- `buildAzureCredentials(credForm)` **excludes** the SSH key.
- The deployment config sends `provider_options: { ssh_key_path: "/tmp/privateai_ssh_key" }`.
- **No code on the backend writes the key content to `/tmp/privateai_ssh_key`.**

```python
# backend/app/services/ssh_tunnel.py (line 129)
key_path = str(Path(ssh_key_path).expanduser())
```

**Impact:** The backend cannot authenticate to the VM via SSH. This breaks:
- VM software setup (Ollama install, model pull)
- SSH tunnel to Ollama
- Embedded terminal via WebSocket
- Open WebUI connection to the deployment

**Fix:**
1. Add `ssh_private_key: str` to `AzureCredentials` (backend model and frontend type).
2. In the orchestrator, write the key to a temporary file with `0o600` permissions before SSH operations, and delete it afterward.
3. Or better: keep the key browser-side and have the frontend open the SSH tunnel (but this requires a different architecture).

---

### 🔴 CRITICAL: Open WebUI manager incompatible with Docker Compose setup
**Location:** `backend/app/services/open_webui_manager.py`, `docker-compose.hosted.yml`

**Problem:**
- `docker-compose.hosted.yml` runs Open WebUI as an **external container** (`ghcr.io/open-webui/open-webui:main`).
- `OpenWebuiManager.start()` tries to spawn a **local subprocess** (`subprocess.Popen([binary, "serve"])`).
- The backend Dockerfile does **not** install Open WebUI, so `self.installed` is always `False`.
- `connect_to_deployment()` calls `self.restart()`, which stops/starts the local process — doing nothing to the external container.
- Health checks hit `http://localhost:{port}`, but the container is at `http://open-webui:8080`.

**Impact:** Open WebUI cannot be connected to a deployment. The "Connect & Chat" feature is broken.

**Fix (hosted mode):**
1. Remove subprocess logic from the manager in hosted mode.
2. Use the Open WebUI **API** (`/api/v1/configs/ollama`) to point it at the Ollama URL.
3. Or use Docker Compose to restart the `open-webui` service with updated env vars (`OLLAMA_BASE_URLS`).

---

### 🟠 HIGH: nginx missing WebSocket upgrade headers
**Location:** `nginx/nginx.conf`

**Problem:** The `/api/` location does not set `Upgrade` and `Connection` headers:
```nginx
location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_http_version 1.1;
    # Missing:
    # proxy_set_header Upgrade $http_upgrade;
    # proxy_set_header Connection "upgrade";
}
```

**Impact:** WebSocket connections to `/api/v1/deployments/{id}/ws` and `/{id}/terminal` **fail through nginx** with 400 Bad Request.

**Fix:** Add a separate location or include upgrade headers:
```nginx
location /api/v1/deployments/ {
    proxy_pass http://backend:8000/api/v1/deployments/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

---

### 🟡 MEDIUM: Open WebUI image uses floating `main` tag
**Location:** `docker-compose.hosted.yml` (line 59)

**Problem:** `image: ghcr.io/open-webui/open-webui:main` tracks the latest commit. An upstream breaking change can brick the deployment.

**Fix:** Pin to a specific version, e.g., `ghcr.io/open-webui/open-webui:v0.6.0`.

---

### 🟡 MEDIUM: SSH tunnel binds to `127.0.0.1` inside backend container
**Location:** `backend/app/services/ssh_tunnel.py` (lines 143-146)

**Problem:** The tunnel binds to `127.0.0.1:{random_port}` inside the backend container. Open WebUI runs in a **separate container**, so it cannot reach `127.0.0.1` of the backend container.

**Impact:** Even if the tunnel were established, the external Open WebUI container cannot use it.

**Fix:** In Docker Compose, run Open WebUI and the backend in the **same network namespace** (not possible with separate containers) or expose the tunnel on `0.0.0.0` with a Docker network alias, or switch to a reverse-proxy approach.

---

## 4. Frontend

### 🔴 CRITICAL: Route protection missing on direct navigation
**Location:** `frontend/app/page.tsx`

**Problem:** The root page (`/`) checks auth and redirects to `/login`. However, there is **no auth check on `/login`** — if a logged-in user visits `/login`, they see the login form instead of being redirected to `/`.

More importantly, if additional routes exist (e.g., `/dashboard` as a direct route in future), they have no guards.

**Fix:** Add a `useAuth()` check in `/login/page.tsx` that redirects to `/` if `user` is already set.

---

### 🟠 HIGH: No auth token on WebSocket connections
**Location:** `frontend/app/lib/api.ts` (lines 433-436)

**Problem:**
```typescript
export function connectDeploymentWS(id: string): WebSocket {
  const url = `${WS_URL}${V1}/deployments/${id}/ws`;
  return new WebSocket(url);   // ← no token
}
```

**Impact:** Even if the backend WebSocket required auth, the frontend wouldn't send it. Currently the backend doesn't require auth, so this is moot — but once auth is added to WS handlers, this will break.

**Fix:** Append the token as a query parameter:
```typescript
const token = localStorage.getItem("privateai_token");
const url = `${WS_URL}${V1}/deployments/${id}/ws${token ? `?token=${token}` : ""}`;
```

---

### 🟡 MEDIUM: `login` in `AuthProvider` stores token but not user object
**Location:** `frontend/components/AuthProvider.tsx`

**Problem:** After registration, `register()` calls `login()`, which stores the token. If `fetchUser()` fails (e.g., network blip), the token remains in `localStorage` but the user is null. On next mount, the app sees a token, tries `fetchUser`, fails again, and redirects to login in an infinite loop.

**Fix:** If `fetchUser()` fails, clear the token **and** set a short cooldown or error state to prevent rapid retry loops.

---

### 🟡 MEDIUM: `err: any` in login page
**Location:** `frontend/app/login/page.tsx` (line 27)

**Problem:** Uses `any` type for error, which is banned in strict TypeScript and can mask bugs.

**Fix:** Use `unknown` and narrow:
```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  setError(message);
}
```

---

### 🟢 LOW: Password field missing strength indicator
**Location:** `frontend/app/login/page.tsx`

**Problem:** Registration only enforces `minLength={8}` on the input. No server-side complexity check and no visual strength meter.

**Fix:** Add a simple strength check (e.g., require mixed case + number) in `UserCreate` validation.

---

## Summary Table

| # | Severity | Area | Issue | File(s) |
|---|----------|------|-------|---------|
| 1 | 🔴 Critical | Auth | No JWT sent with API requests | `frontend/app/lib/api.ts` |
| 2 | 🔴 Critical | Auth | No user isolation on deployments | `backend/app/services/deployment_store.py` |
| 3 | 🔴 Critical | Auth | WebSocket endpoints unauthenticated | `backend/app/routers/deployments.py`, `terminal.py` |
| 4 | 🔴 Critical | Encryption | Vault is dead code (never used) | `frontend/lib/vault.ts` |
| 5 | 🔴 Critical | Open WebUI | SSH key collected but never sent | `frontend/app/provision/ProvisionWizard.tsx` |
| 6 | 🔴 Critical | Open WebUI | Manager spawns subprocess vs. external container | `backend/app/services/open_webui_manager.py` |
| 7 | 🟠 High | Auth | Default JWT secret fallback | `backend/app/utils/auth.py` |
| 8 | 🟠 High | Auth | No rate limiting on login/register | `backend/app/routers/auth.py` |
| 9 | 🟠 High | Open WebUI | nginx missing WebSocket upgrade headers | `nginx/nginx.conf` |
| 10 | 🟠 High | Frontend | No auth token on WebSockets | `frontend/app/lib/api.ts` |
| 11 | 🟡 Medium | Auth | SQLite without WAL | `backend/app/models/user.py`, `vault.py` |
| 12 | 🟡 Medium | Auth | CORS allows localhost in prod | `backend/main.py` |
| 13 | 🟡 Medium | Encryption | `btoa` spread crash for large blobs | `frontend/lib/vault.ts` |
| 14 | 🟡 Medium | Encryption | Credentials saved to localStorage plaintext | `frontend/app/lib/storage.ts` |
| 15 | 🟡 Medium | Open WebUI | Floating `main` image tag | `docker-compose.hosted.yml` |
| 16 | 🟡 Medium | Open WebUI | SSH tunnel binds to container-localhost | `backend/app/services/ssh_tunnel.py` |
| 17 | 🟡 Medium | Frontend | Login page not redirecting authenticated users | `frontend/app/login/page.tsx` |
| 18 | 🟡 Medium | Frontend | AuthProvider retry loop on fetchUser failure | `frontend/components/AuthProvider.tsx` |
| 19 | 🟢 Low | Frontend | No password strength indicator | `frontend/app/login/page.tsx` |

---

## Recommended Priority Order

1. **Fix API auth headers** (frontend) — unblocks all other testing.
2. **Add user_id to deployments** (backend) — required for multi-user safety.
3. **Fix SSH key transmission** (frontend + backend) — required for VM setup.
4. **Fix nginx WebSocket headers** — required for real-time UI.
5. **Replace Open WebUI subprocess with external container API** — required for chat.
6. **Wire up the encrypted vault** (frontend) — delivers the privacy promise.
7. **Add rate limiting & secret validation** (backend) — hardens auth.
8. **Add WebSocket auth** (frontend + backend) — closes open holes.
