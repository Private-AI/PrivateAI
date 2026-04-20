# Unified Testing Procedure

This is the single testing runbook for PrivateAI backend and end-to-end validation.

It replaces the old split between the general backend test guide and the cheap-VPS guide.

## Current Architecture

Test against the product as it exists now, not the older assumptions:

- Azure default region is `centralus`, not `eastus`.
- Cheap validation should focus on CPU VMs first.
- `TrustedLaunch` is the standard path. Do not plan new test coverage around Confidential VM behavior.
- Open WebUI runs locally with the backend and auto-starts at backend startup.
- Deployment state persists across backend restarts in `open-webui-data/deployments.json`.
- Ollama is intended to be reached through the backend-managed SSH tunnel.
- Azure NSGs should expose `22` only. Port `11434` should not be opened publicly.
- The frontend should connect chat using `deployment_id`; it should not send a raw Ollama URL.

## Goals

By the end of this procedure you should have confidence in:

1. Backend API correctness and schema behavior.
2. Azure provisioning reliability on the cheap path.
3. VM setup reliability for CPU-first deployments.
4. Open WebUI startup, reconnect, and tunnel-driven chat flow.
5. Persistence and recovery after backend restart.
6. Cleanup behavior when provisioning or setup fails.

## One-Time Setup

From `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx
```

Set Azure credentials:

```bash
export AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_SECRET="your-client-secret"
```

Recommended environment:

```bash
export AZURE_TEST_LIVE=true
export AZURE_LOCATION=centralus
export PRIVATEAI_TEST_MODE=false
```

SSH key requirement:

```bash
test -f ~/.ssh/id_ed25519 && echo "OK" || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
```

Quick sanity check:

```bash
python - <<'PY'
import os
required = [
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_TEST_LIVE",
]
missing = [k for k in required if not os.environ.get(k)]
print("MISSING:", missing if missing else "none")
print("AZURE_LOCATION:", os.environ.get("AZURE_LOCATION", "centralus"))
PY
```

## Test Order

Run tests in this order every time:

1. Free offline tests.
2. Mock-mode orchestration checks.
3. Cheap live Azure validation.
4. Manual end-to-end chat and persistence checks.
5. Optional GPU validation after the cheap path is stable.

## Fast Daily Flow

Use this when you want the highest signal for the lowest cost:

```bash
pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_cheap_vm.py -m phase3 -v -s
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_setup_ollama.py -m phase3 -v -s
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

Pass criteria:

- No failed or error tests.
- Provision succeeds on a cheap CPU path.
- Setup completes and validation passes.
- Cleanup completes and leaves no running test VM behind.

## Phase 1: Offline Tests

Run:

```bash
pytest tests/test_lint.py -v
pytest tests/test_dry_run.py -v
pytest tests/test_api.py -v
```

These should catch:

- import and schema regressions
- provider registry and endpoint wiring issues
- Azure parameter translation issues
- stale API contract changes

Stop here if anything fails.

## Phase 2: Mock-Mode API Checks

Use mock mode to validate orchestration without Azure spend.

```bash
export PRIVATEAI_TEST_MODE=true
uvicorn main:app --host 0.0.0.0 --port 8000
```

Validate:

1. `POST /api/v1/deployments` returns quickly.
2. deployment status endpoints stay coherent.
3. lifecycle actions update state correctly.
4. frontend polling and websocket consumers still behave.

Reset `PRIVATEAI_TEST_MODE=false` before live testing.

## Phase 3: Cheap Live Azure Validation

This is the main real-cloud validation path.

### Scope

Prefer CPU-only validation first:

- product-level cheap targets: `micro-cpu`, `test-no-gpu`, `small-cpu`
- existing pytest live suite: still centered around `Standard_D2s_v5`

Use `centralus` unless you are intentionally testing region fallback.

### Baseline Live Run

```bash
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_cheap_vm.py -m phase3 -v -s
```

Expected behavior:

- resource group, NSG, network, public IP, NIC, and VM are created
- SSH becomes reachable
- validation passes without GPU requirements
- stop/start works
- teardown succeeds

### Setup Validation

```bash
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_setup_ollama.py -m phase3 -v -s
```

Confirm:

- CPU VMs skip the NVIDIA step instead of failing
- Ollama install completes within the longer timeout budget
- `/models/ollama` is writable by the `ollama` service user
- requested model pulls complete
- validation output is readable when setup fails

### Extended Live Suite

Run before milestones or releases:

```bash
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_sdk_assertions.py -m phase3 -v -s
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_network_restrictions.py -m phase3 -v -s
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_recovery_paths.py -m phase3 -v -s
AZURE_TEST_LIVE=true AZURE_LOCATION=centralus pytest tests/test_phase3_negative_inputs.py -m phase3 -v -s
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

### What to Verify Manually in Azure

Check these after at least one successful live run:

1. NSG exposes SSH only.
2. There is no inbound `11434` rule.
3. VM security type is `TrustedLaunch`.
4. Failed runs do not leave quota-consuming public IPs or NICs behind.
5. Cheap CPU runs can use no data disk or a minimal disk layout without validation errors.

## Phase 4: API and UI End-to-End Flow

This phase validates the flow that matters most after the changes in `CHANGES.md`.

Start the backend:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Provider Preflight

Validate credentials:

```bash
curl -s -X POST http://localhost:8000/api/v1/providers/azure/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "provider": "azure",
      "subscription_id": "'"$AZURE_SUBSCRIPTION_ID"'",
      "tenant_id": "'"$AZURE_TENANT_ID"'",
      "client_id": "'"$AZURE_CLIENT_ID"'",
      "client_secret": "'"$AZURE_CLIENT_SECRET"'"
    }
  }' | jq .
```

Register Azure providers once per subscription if needed:

```bash
curl -s -X POST http://localhost:8000/api/v1/providers/azure/setup-permissions \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "provider": "azure",
      "subscription_id": "'"$AZURE_SUBSCRIPTION_ID"'",
      "tenant_id": "'"$AZURE_TENANT_ID"'",
      "client_id": "'"$AZURE_CLIENT_ID"'",
      "client_secret": "'"$AZURE_CLIENT_SECRET"'"
    }
  }' | jq .
```

Optional VM recommendation check:

```bash
curl -s "http://localhost:8000/api/v1/providers/azure/recommend-vm?model=gemma3:4b" | jq .
```

### Manual Deployment Smoke Test

Submit a cheap CPU deployment through the API or frontend. If you use the API directly, prefer a current cheap profile shape rather than older confidential or GPU defaults.

Example API payload:

```bash
curl -s -X POST http://localhost:8000/api/v1/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "provider": "azure",
      "subscription_id": "'"$AZURE_SUBSCRIPTION_ID"'",
      "tenant_id": "'"$AZURE_TENANT_ID"'",
      "client_id": "'"$AZURE_CLIENT_ID"'",
      "client_secret": "'"$AZURE_CLIENT_SECRET"'"
    },
    "config": {
      "provider": "azure",
      "region": "centralus",
      "vm_name": "privateai-smoke-vm",
      "resource_group": "privateai-smoke-rg",
      "vm_size": "Standard_D2s_v5",
      "gpu_enabled": false,
      "security_level": "standard",
      "data_disk_size_gb": 0,
      "setup": {
        "models": ["gemma3:4b"]
      }
    }
  }' | jq .
```

Minimum behaviors to verify:

1. Provision succeeds in `centralus`.
2. If the primary Azure SKU is unavailable, fallback SKUs are attempted.
3. Failed deploys clean up resources automatically.
4. Dashboard success flow offers `Connect & Chat`.
5. Dashboard does not display a public Ollama URL.

### Chat Flow Validation

Verify Open WebUI behavior after a deployment is running:

1. `GET /api/v1/open-webui/status` shows Open WebUI as running, or it becomes running shortly after backend startup.
2. `POST /api/v1/open-webui/connect` is called with `deployment_id`, not an Ollama URL.
3. Clicking `Connect & Chat` opens Open WebUI without a restart delay when Open WebUI is already running.
4. Open WebUI connects to a local tunnel endpoint such as `http://127.0.0.1:<port>`.
5. If connect fails, the dashboard shows an error banner instead of silently failing.

Useful checks:

```bash
curl -s http://localhost:8000/api/v1/open-webui/status | jq .
curl -s http://localhost:8000/api/v1/open-webui/health | jq .
```

### Persistence and Restart Validation

This is now required.

After a successful deployment:

1. Confirm the deployment appears in `/app/open-webui-data/deployments.json` or the mounted equivalent.
2. Restart the backend container or process.
3. Confirm the deployment list is restored after restart.
4. Confirm Open WebUI auto-starts again.
5. Confirm the backend reconnects the tunnel for the most recent running deployment.
6. Confirm `Connect & Chat` works after restart without creating a new deployment.

## Networking Expectations

Use these as hard pass/fail rules for current behavior:

- `22/tcp` may be reachable according to `allowed_ssh_sources`.
- `11434/tcp` should not be opened publicly in Azure NSGs.
- Open WebUI should not be deployed on the cloud VM.
- The frontend should not rely on `endpoints.ollama_api` being populated for Azure.

## Cleanup

Always run cleanup after live tests:

```bash
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

If a run fails midway:

```bash
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -k teardown -v -s
```

Post-cleanup checks:

1. No test resource group remains.
2. No public IP or NIC from the failed run remains.
3. No billable VM is left running.
4. Local temporary state files are removed.

## Optional GPU Validation

Only do this after the cheap path is stable.

Run a minimal GPU validation to confirm:

1. GPU VM provisioning succeeds.
2. NVIDIA setup works on GPU hardware.
3. model pull and inference work on the intended GPU shape.
4. destroy and cleanup still succeed.

Do not treat GPU validation as the primary daily confidence path.

## Known Drift to Watch

Some older tests and helpers still use older naming such as `Standard_D2s_v5`, `eastus`, or public `11434` assumptions. When updating or interpreting those suites:

1. prefer `centralus`
2. prefer CPU-first cheap validation
3. treat SSH-tunneled Ollama as the intended architecture
4. treat the absence of public `ollama_api` as correct for Azure

## Troubleshooting

### Live tests are skipped

Set:

```bash
export AZURE_TEST_LIVE=true
```

### Azure provisioning fails with capacity errors

Use `centralus` first. Confirm fallback SKUs are attempted before treating the run as a regression.

### SSH fails after provisioning

Check:

- `~/.ssh/id_ed25519` exists
- NSG allows your source to port `22`
- the VM finished bootstrapping

### Ollama setup fails on a CPU VM

That is a regression if the failure is caused by NVIDIA setup. The NVIDIA step should be skipped on CPU-only VMs.

### Connect and chat fails after the deployment is running

Check:

- `GET /api/v1/open-webui/status`
- `GET /api/v1/open-webui/health`
- backend logs for tunnel creation
- dashboard error banner text

### Deployment disappears after backend restart

That is a regression. The deployment store should persist to the Open WebUI data volume and reload on startup.

## Exit Gate

Treat the build as healthy only when all of these are true:

1. Offline tests pass.
2. Cheap live Azure deploy/setup/teardown passes.
3. Chat connection works through Open WebUI.
4. Backend restart preserves deployment state.
5. No orphaned Azure resources remain after failures or teardown.
