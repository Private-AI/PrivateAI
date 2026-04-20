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
