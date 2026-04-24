# PrivateAI — Changes & Decisions

## Overview

This document records the bugs fixed, features added, and architectural decisions made during the development and end-to-end testing sessions for PrivateAI — a multi-cloud GPU VM provisioning app with a private AI chat interface.

---

## Azure VM Provisioning

### SKU Availability & Fallback

**Problem:** Azure free-tier subscriptions have severe capacity limits on popular VM SKUs in popular regions (eastus, westus2, uksouth). `SkuNotAvailable` errors were silently failing with no retry.

**Fix:** Added `fallback_vm_sizes` to `AzureVMProfile` and a SKU retry loop in the provider. When the primary SKU is unavailable, the provider automatically tries each fallback in order.

```
micro-cpu fallbacks: D2as_v5 → D2s_v5 → D2ds_v5 → D2as_v7 → D2ds_v4 → D2s_v4 → D2s_v3
```

**Decision:** Fallback SKUs were chosen by running `az vm list-skus` against `centralus` — the only region with confirmed available 2-vCPU capacity on the test subscription. AMD SKUs (D*as_v5) were preferred over Intel equivalents for better availability.

---

### Default Region

**Problem:** Default region was `eastus` — fully capacity-constrained. Every deployment was failing before even reaching the SKU fallback.

**Fix:** Changed default region to `centralus` in:
- `frontend/app/lib/storage.ts` — `DEFAULT_SETTINGS`
- `frontend/app/settings/Settings.tsx` — component initial state
- `frontend/app/provision/ProvisionWizard.tsx` — wizard pre-fill

---

### Auto-Cleanup on Failure

**Problem:** Failed deployments left orphaned Azure resources (public IPs, NICs, VMs) which counted against subscription quotas. The 3 public IP limit per region was hit repeatedly on subsequent deploy attempts.

**Fix:** On provisioning failure, the provider now explicitly deletes resources in reverse dependency order before firing the async resource group deletion:

1. **VM** (blocking, 2 min timeout) — must go before NIC
2. **NIC** (blocking, 1 min timeout) — must go before public IP
3. **Public IP** (blocking, 1 min timeout) — **quota freed immediately**
4. **Resource group** (async, fire-and-forget) — cleans up VNet, NSG, disks

**Decision:** Explicit ordered deletion rather than relying solely on RG deletion because RG deletion is async and Azure takes 5–10 minutes to free IP quota after an RG delete, making immediate retries fail.

**Additional guard:** Added `resource_groups.get(rg)` check before deletion to skip cleanup if the resource group was never created (failure happened before step 1).

---

### Deployment Model Defaults

**Problem:** `DeploymentConfig` had `data_disk_size_gb` with `ge=32` constraint, but micro-CPU VMs send `data=0` (no data disk). Also `gpu_enabled` defaulted to `True` and `security_level` defaulted to `CONFIDENTIAL`.

**Fix:**
- `data_disk_size_gb`: `ge=32` → `ge=0`
- `gpu_enabled`: default `True` → `False`
- `security_level`: default `CONFIDENTIAL` → `STANDARD`

---

## VM Software Setup

### NVIDIA Driver on CPU VMs

**Problem:** The setup script always ran the NVIDIA driver install step, even on CPU-only VMs. The driver install failed with `REBOOT_REQUIRED`, aborting the entire setup before Ollama was installed.

**Fix:** Added `has_gpu: bool = False` parameter to `setup_vm_remote`. The NVIDIA step is now skipped entirely on CPU VMs with a "skipped (CPU-only VM)" status.

---

### Ollama Install Failures

**Problem:** The Ollama install script used `set -euo pipefail`, which caused the `curl | sh` pipe to trigger pipefail and abort the script mid-install. Also, stderr was not redirected so output was lost.

**Fix:**
- Removed `set -euo pipefail` from the Ollama install script
- Added `2>&1` to the `curl | sh` pipe to capture installer output
- Increased SSH command timeout from 300s → 600s
- Extended health check loop from 30×1s → 60×2s (2 minutes)

---

### `/models/ollama` Permissions

**Problem:** The setup script ran `chown -R azureuser /models/ollama` during the disk mount step (step 3), before Ollama was installed (step 5). The Ollama installer creates an `ollama` system user/group. The service runs as `User=ollama`, so it couldn't write to a directory owned by `azureuser`.

**Error:** `mkdir /models/ollama/blobs: permission denied`

**Fix:** Moved the chown into the Ollama install script, after the installer runs:
```bash
sudo mkdir -p /models/ollama
sudo chown -R ollama:ollama /models/ollama
```

---

### Error Visibility

**Problem:** Setup failures showed `"Ollama install failed:"` with nothing after the colon because `err` (stderr) was empty — the install script redirected stderr to stdout via `2>&1`, so the actual error was in `out` (stdout), not `err`.

**Fix:** Changed error construction to use stdout when stderr is empty:
```python
detail = err.strip() or out.strip()
result.error = f"Ollama install failed: {detail[-400:]}"
```
Also added `logger.error` calls logging the last 1000 chars of stdout and 500 chars of stderr for every failure step.

---

## Deployment State Persistence

**Problem:** The deployment store was purely in-memory. Every Docker restart wiped all deployment records. After a restart, clicking "Connect & Chat" returned `400: Deployment not found or has no public IP`.

**Fix:** Rewrote `DeploymentStore` to persist to `/app/open-webui-data/deployments.json` — the same Docker volume already mounted for Open WebUI data. Records (including credentials) are saved on every mutation and loaded on startup.

**Decision:** Credentials are stored in the JSON file alongside deployment records. This is acceptable because the file lives inside the Docker volume on the local machine, and is the same trust boundary as the Open WebUI database which stores user data.

### Stale Azure Credentials During Destroy / Live Status

**Problem:** Azure lifecycle actions started failing with `AADSTS7000215: Invalid client secret provided` even though the current service principal secret still worked in the credential validation flow.

**Root cause:** Deployment lifecycle operations (`live`, `start`, `stop`, `destroy`) were using the credentials persisted with each deployment record. Older deployments had a stale or masked short secret persisted in `deployments.json`, so delete and status polling kept authenticating with the wrong value while manual credential validation succeeded with the current secret.

**Fix:**
- `DELETE /deployments/{id}` now accepts replacement credentials and updates the stored deployment credentials before destroy.
- Successful Azure credential validation now updates provider-level active credentials in the backend, and lifecycle/status calls prefer those fresh provider credentials over stale per-deployment ones.
- Destroy failures now surface as real errors instead of silently leaving a deployment stuck in `destroying`.

**Decision:** Keep the persisted per-deployment credentials for restart durability, but treat the most recently validated provider credentials as the source of truth for Azure lifecycle operations.

---

### Bulk Cleanup for Orphaned Azure Resources

**Problem:** When deployment records became stale or stuck in `destroying`, the UI had no recovery path to remove all remaining Azure resources created by PrivateAI without targeting each deployment one by one.

**Fix:** Added a managed bulk-destroy flow:
- Backend endpoint: `POST /api/v1/deployments/destroy-managed-resources`
- Dashboard button: `Destroy All Managed Azure Resources`

The cleanup only targets Azure resource groups tagged with:
- `project=privateai`
- `created-by=privateai-backend`

Matching deployment records are removed from the app state after successful deletion so the dashboard stops showing orphaned `destroying` entries.

**Decision:** Scope the bulk action to tagged PrivateAI-managed Azure resource groups only. This avoids unsafe subscription-wide deletion while still giving the user a recovery path for stuck resources.

---

### Quota-Aware VM Size Filtering

**Problem:** The provisioning wizard showed a static Azure VM catalog, so users could select VM sizes their subscription could not actually deploy. This led to predictable failures such as:
- T4 GPU blocked by `Standard NCASv3_T4 Family` quota = `0`
- 8-vCPU CPU VMs blocked by `Total Regional Cores` quota = `4`

**Fix:** Added an account-aware VM size lookup flow backed by the Azure SDK:
- Backend endpoint: `POST /api/v1/providers/{provider}/accessible-vm-sizes`
- The backend authenticates with the supplied Azure credentials and queries:
  - `ComputeManagementClient.usage.list(region)` for quota/usage
  - `ComputeManagementClient.virtual_machine_sizes.list(region)` for region SKU availability
- Each VM profile is returned with:
  - `available: true | false`
  - `availability_reason: string | null`

**Frontend changes:**
- The credentials step now requires a successful validation before the user can continue.
- Changing any credential field invalidates the previous validation result.
- The configuration step loads deployable VM sizes for the selected region using the validated credentials.
- VM sizes that are not deployable are shown disabled with the Azure quota/availability reason inline.

**Decision:** Keep unavailable VM sizes visible but disabled instead of hiding them entirely. This explains to the user why a larger or GPU-backed profile is unavailable and reduces confusion compared to a silently filtered list.

---

## SSH Tunnel & Ollama Security

### No Plaintext Ollama URL on the Wire

**Problem:** The original `/connect` endpoint required the frontend to send `ollama_url: "http://VM_IP:11434"`. This meant the VM's IP and the unencrypted Ollama URL were transmitted from the browser to the backend.

**Fix:** The `/connect` endpoint now accepts only `deployment_id`. The backend looks up `public_ip` from the deployment store and constructs the Ollama URL internally. The VM IP never leaves the backend.

**Decision:** Port 11434 is intentionally NOT opened in the NSG. All Ollama traffic flows through the SSH tunnel (port 22). The `ollama_api` field in `ServiceEndpoints` remains empty for Azure deployments — it is not a publicly accessible URL.

### Dashboard "Connect & Chat" Visibility

**Problem:** The dashboard "Connect & Chat" button was gated on `ollamaUrl` being truthy, but `ollama_api` is always `""` for Azure (by design). The button never appeared.

**Fix:** Changed the visibility condition from `ollamaUrl &&` to `canChat` — defined as `d.status === "running" && !!d.public_ip`. Removed the direct Ollama API URL display entirely.

---

## Open WebUI Integration

### Auto-Start at Backend Startup

**Problem:** Open WebUI took 25–40 seconds to start every time the user clicked "Connect & Chat" because it launched as a subprocess on demand.

**Fix:** Open WebUI now starts automatically as a background task when the FastAPI backend starts. By the time the user opens the browser, Open WebUI is already running.

**Bonus:** On startup, the backend also checks the deployment store for any running deployments and automatically reconnects the SSH tunnel for the most recent one.

### Reconnect Uses Restarted Process Config

**Problem:** When the user clicked "Connect & Chat" and Open WebUI was already running, the backend tried to hot-update the Ollama URL through Open WebUI's config API. In practice that endpoint returned `401 Unauthorized`, so Open WebUI kept pointing at `localhost:11434` and never switched to the SSH tunnel URL.

**Fix:** `connect_to_deployment()` now treats the SSH tunnel URL as process configuration and restarts Open WebUI with `OLLAMA_BASE_URLS=http://127.0.0.1:PORT` already set. Startup auto-reconnect now uses the same code path, so manual connects and backend restarts behave the same way.

### Tunnel Failures Surface as Real Errors

**Problem:** If SSH tunnel setup failed, the manager silently fell back to the VM's direct Ollama URL. That URL is not reachable because port 11434 is intentionally closed in the NSG, so the UI could report success while chat remained broken.

**Fix:** Tunnel setup is now required. `connect_to_deployment()` raises a runtime error when the tunnel cannot be established or the VM IP cannot be derived, and `POST /api/v1/open-webui/connect` now returns `502` instead of pretending the connection succeeded.

### Regression Tests

**Fix:** Added `backend/tests/test_open_webui_manager.py` to cover:
- reconnecting a running Open WebUI instance through the restart path
- startup auto-reconnect using the same connect flow
- surfacing SSH tunnel setup failures

### Error Visibility on Connect

**Problem:** The `handleConnectAndChat` function had an empty `catch {}` block — all errors were silently swallowed. If Open WebUI failed to start or the API call failed, the UI showed nothing.

**Fix:**
- Added `chatError` state to the dashboard
- Errors are now displayed in a dismissable error banner
- When `result.success` is false, the error message from the backend is shown

---

## Frontend UX

### Wizard Success Screen

**Problem:** After a successful deployment, the wizard showed only an SSH command and a "Go to Dashboard" button. Users didn't know they could chat and couldn't find the chat button.

**Fix:** Replaced the success screen with:
- A prominent "Connect & Chat" primary button (full width)
- SSH command shown as a small secondary line
- Removed the Ollama API URL display (it's internal/tunnel-only)

### FastAPI 422 Error Display

**Problem:** FastAPI validation errors return `detail` as an array of objects. The frontend was passing the raw array to `String()`, producing `"[object Object]"`.

**Fix:**
```typescript
if (Array.isArray(body.detail)) {
  detail = body.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ");
}
```

---

## Test Suite

### Stale Assertions

**Problem:** `test_list_vm_sizes` checked for `h100-confidential` profile which was removed, and `test_dry_run` used `SecurityLevel.CONFIDENTIAL` which is no longer the default.

**Fix:**
- Updated `test_list_vm_sizes` to check for `micro-cpu` and `t4-gpu`
- Added `assert production_config.security_level == SecurityLevel.STANDARD`
- Updated `conftest.py` production fixture to use `SecurityLevel.STANDARD`

---

## Azure CLI Device-Code Login & One-Click Service Principal

### Motivation

**Problem:** The manual Azure onboarding flow required the user to perform 7 steps in the Azure portal (log in, find the subscription ID, find the tenant ID, create an App Registration, create a client secret, assign the Contributor role, copy everything into the app). This is a non-starter for non-technical users and the single largest friction point in the product.

**Goal:** Reduce onboarding to *just* "log in with your Microsoft account in a browser" — everything else (App Registration, client secret, RBAC assignment) is automated.

### Why the Azure Python SDK was ruled out

The management SDKs (`azure-mgmt-*`) cannot create App Registrations, Service Principals, or Client Secrets — those live in Microsoft Graph / Entra ID, not in ARM. We evaluated importing `azure.cli.core` directly but rejected it because it pollutes global Python state, maintains its own on-disk token cache that corrupts under concurrent requests, and has a 200+ dependency tree that conflicts with FastAPI. See `docs/PrivateAI_Azure_cli.md` for the full evaluation.

### Decision: drive the `az` CLI binary via subprocess

- `azure-cli` is installed into the Docker image via the official Microsoft apt repository (`curl -sL https://aka.ms/InstallAzureCLIDeb | bash`). It is now available at `/usr/bin/az` in every container service (`backend`, `combined`, `dev`, `test`).
- The backend shells out to `az` via `subprocess` instead of importing any of its Python modules. `az ad sp create-for-rbac --name X --role Contributor --scopes /subscriptions/…` collapses the manual steps 4/5/6 into a single atomic command.
- Every login session runs with a fresh `AZURE_CONFIG_DIR` under `/tmp/privateai-azure-sessions/<session_id>/`. PrivateAI never reads from or writes to the host user's personal `~/.azure/` directory, so manual Azure CLI usage on the host is untouched.

### Device-code flow without blocking the event loop

**Problem encountered:** The first implementation used `subprocess.Popen(...).communicate(timeout=120)` to capture the device code. `communicate()` waits for the process to exit, but `az login --use-device-code` intentionally blocks for up to 15 minutes waiting for the user to authenticate. The test script hung reliably for 120 s before even showing the code.

**Fix:**
- Start `az login --use-device-code` as a background subprocess with `bufsize=1` (line-buffered) and `PYTHONUNBUFFERED=1` in its environment.
- Drain `stdout` and `stderr` on two daemon threads into list buffers.
- Poll the buffers every 250 ms for the regex `code\s+([A-Z0-9]+)\s+to\s+authenticate`. The code appears within ~1 s.
- The main thread returns the device code to the HTTP caller immediately. The subprocess continues running in the background until the user authenticates or the session is cancelled.
- `proc.poll()` is used for non-blocking liveness checks from the `/status` endpoint.

### New backend API surface (`/api/v1/azure/cli/*`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/login/start` | Spawns `az login --use-device-code`, returns `{ session_id, verification_url, user_code, message }`. |
| `GET`  | `/login/status?session_id=…` | Non-blocking poll. `pending` → `authenticated` once the user completes the browser step. |
| `POST` | `/provision` | Runs `az ad sp create-for-rbac` on the authenticated session. Returns a full `AzureCredentials` payload and caches it as the active Azure provider credentials so the rest of the provisioning flow works without the frontend re-sending them. |
| `POST` | `/login/cancel?session_id=…` | Abort an in-flight login and clean up the session. |

**Decision:** Use an opaque session id per login flow rather than a single global session. This prevents concurrent frontend instances (or a rapid page refresh) from clobbering each other, and lets each session own its own isolated temp config dir.

**Idempotency:** Calling `/provision` twice on the same session returns the same SP credentials rather than creating a duplicate App Registration.

**Garbage collection:** Sessions idle > 30 minutes are automatically cleaned up (subprocess killed, temp dir removed). The backend shutdown hook also tears down all live sessions.

### Manual integration test

Added `backend/tests/test_azure_cli_setup.py` (marked `@pytest.mark.manual`) that exercises the full end-to-end flow: bootstrap check → device-code login → poll → SP creation → RBAC verification → SP deletion. The test prints the device code to stdout for the user to enter in a browser and is gated behind the `manual` pytest marker so it never runs in CI.

Added a new pytest marker in `backend/pyproject.toml`:
```
manual: Live manual tests requiring human interaction (e.g. Azure device-code login)
```

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| No TEE / ConfidentialVM | Complexity vs. benefit tradeoff for a personal AI tool. TrustedLaunch throughout. |
| SSH tunnel for Ollama | Port 11434 never exposed publicly. E2E encryption at no extra cost. |
| Credentials in deployment JSON | Same trust boundary as the rest of the local data volume. |
| `centralus` as default region | Only region with confirmed 2-vCPU capacity on Azure free-tier during testing. |
| AMD SKUs preferred | Better availability than Intel equivalents in constrained regions. |
| No data disk for micro/test VMs | `data_disk_size_gb=0` avoids unnecessary cost and quota usage for test deployments. |
| Open WebUI auto-start | Eliminates the 30s cold-start delay on first "Connect & Chat" click. |
| No `ollama_api` in ServiceEndpoints for Azure | The URL is internal to the backend; exposing it would be misleading and a security smell. |
| `az` CLI as subprocess, not library | The Python-importable CLI mutates global state, has a 200+ dep tree, and exposes an unstable private API. Shelling out is the officially supported interface. |
| Isolated `AZURE_CONFIG_DIR` per session | Each device-code flow gets its own temp dir; PrivateAI never touches `~/.azure/` on the host. |
| Session-based Azure CLI login | Concurrent frontend instances / page refreshes cannot clobber each other's in-flight logins. Idle sessions are GC'd after 30 min. |
