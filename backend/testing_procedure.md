# Backend Testing Procedure

This guide is the canonical test plan for validating the backend with strong emphasis on:

- Azure SDK provisioning correctness
- Provisioning/setup script behavior (`provider.py`, `vm_setup.py`, `validator.py`)
- Networking and service reachability (SSH, Ollama, Open WebUI)
- Cost-safe progression from `Standard_D2s_v5` to H100

The strategy is intentionally staged so you can prove reliability on cheap infrastructure before spending on GPU VMs.

---

## 1) Testing Goals

By the time you finish this plan, you should be confident that:

1. Azure resources are created correctly and consistently through the SDK.
2. VM setup scripts are robust (idempotent enough, retry-safe, clear failures).
3. Ollama and Open WebUI are configured correctly and reachable from expected networks.
4. Lifecycle actions (`start`, `stop`, `destroy`, `auto-shutdown`) behave correctly.
5. H100 testing is only started after objective D2s_v5 gates are met.

---

## 2) Test Pyramid for This Project

Use this order every time:

1. Offline tests (fast, free): lint, config translation, API wiring
2. Mock-provider API tests (fast, free): orchestration behavior without cloud spend
3. Live Azure SDK tests on `Standard_D2s_v5` (cheap): infra + setup + networking
4. Repeatability and failure-mode tests on `Standard_D2s_v5`
5. Minimal, targeted H100 validation

Do not jump to H100 until D2s_v5 gates pass.

---

## 3) Prerequisites

### Local setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx
```

### Required Azure credentials (service principal)

```bash
export AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_SECRET="your-client-secret"
```

### Optional but recommended environment values

```bash
export AZURE_TEST_LIVE=true
export AZURE_LOCATION=eastus
export PRIVATEAI_TEST_MODE=false
```

### SSH key

- Setup and validation use `~/.ssh/id_ed25519` by default.
- If missing, provisioning may generate one, but pre-creating it is more deterministic.

---

## 4) Cost Guardrails (Read First)

1. Always run cheap phases first.
2. Use `Standard_D2s_v5` as the default live test VM.
3. Always include teardown steps in every run.
4. Tag and isolate test resource groups (for easy cleanup).
5. Never leave VMs running overnight; test `auto-shutdown` in pre-H100 phase.

---

## 5) Fast Command Reference

```bash
# Phase 1-2 (free)
pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v

# Phase 3 baseline live cheap VM
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Extended Phase 3 live suite (Azure SDK + setup + network + recovery + negative)
AZURE_TEST_LIVE=true pytest tests/test_phase3_*.py -m phase3 -v -s

# Run only the Ollama/Open WebUI setup validation
AZURE_TEST_LIVE=true pytest tests/test_phase3_setup_ollama_webui.py -m phase3 -v -s

# Phase 4 remote validation (existing baseline)
AZURE_TEST_VM_IP=<PUBLIC_IP> pytest tests/test_validate_remote.py -m phase4 -v -s

# Teardown utility
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

## 5.1) Recommended Run Order (Live D2s_v5)

Use this order to maximize signal while minimizing spend.

| Order | Command | Primary purpose | Typical duration | Relative cost |
|------:|---------|-----------------|------------------|---------------|
| 1 | `pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v` | Free preflight correctness | 1-2 min | $0 |
| 2 | `AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s` | Baseline end-to-end infra + lifecycle | 8-15 min | Low |
| 3 | `AZURE_TEST_LIVE=true pytest tests/test_phase3_sdk_assertions.py -m phase3 -v -s` | Azure SDK resource correctness (NSG/NIC/tags/disks) | 8-15 min | Low |
| 4 | `AZURE_TEST_LIVE=true pytest tests/test_phase3_setup_ollama_webui.py -m phase3 -v -s` | Provisioning scripts + Ollama/Open WebUI setup validation | 12-25 min | Low-Medium |
| 5 | `AZURE_TEST_LIVE=true pytest tests/test_phase3_network_restrictions.py -m phase3 -v -s` | CIDR restrictions and endpoint reachability | 10-20 min | Low-Medium |
| 6 | `AZURE_TEST_LIVE=true pytest tests/test_phase3_recovery_paths.py -m phase3 -v -s` | Stop/start loops and setup/validate recovery | 12-22 min | Medium |
| 7 | `AZURE_TEST_LIVE=true pytest tests/test_phase3_negative_inputs.py -m phase3 -v -s` | Error handling and input hardening | 10-20 min | Low-Medium |
| 8 | `AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s` | Final cleanup verification | 1-5 min | $0-$ |

Notes:

- Durations vary by region load, VM allocation delays, and package download speed.
- Relative cost stays low because all live phases use `Standard_D2s_v5`.
- For quick daily confidence, run steps 1, 2, and 4; run full sequence before milestones.

## 5.2) Pass/Fail Exit Criteria by Step

Use this table to decide if you can proceed to the next step.

| Step | Must-pass exit criteria | Stop conditions |
|------|-------------------------|-----------------|
| 1 | All tests pass, no import/schema failures | Any failed test in lint/dry-run/API |
| 2 | Provision succeeds, SSH check passes, stop/start passes, teardown succeeds | Provision failure, lifecycle mismatch, teardown failure |
| 3 | RG/NSG/NIC/PIP/VM/disk assertions all pass | Tag mismatch, missing ports/rules, VM/disk mismatch |
| 4 | Setup result success, validator confirms Ollama + Open WebUI checks, remote HTTP reachable | Setup failure, Ollama service/API failure, WebUI container or HTTP failure |
| 5 | NSG source prefixes match expected CIDR and allowed-source connectivity checks pass | Source prefix mismatch, expected ports unreachable from allowed source |
| 6 | 3 stop/start cycles pass, setup rerun succeeds, post-recovery validate passes | Any cycle fails, setup rerun fails, validation regresses |
| 7 | Negative tests fail safely with expected error behavior, no crash/no orphaned resources | Unhandled exception, ambiguous errors, leaked resources |
| 8 | Resource groups deleted, no billable test VM left running, state artifacts cleaned | Any leftover RG/VM or persistent state artifacts |

Promotion gate to H100:

- Only proceed if steps 1-8 pass in sequence at least once.
- For milestone release confidence, run steps 2-7 on at least 2 regions before H100.

---

## 6) Detailed Phases

## Phase 0 - Preflight and Safety Checks (Free)

Purpose: catch environment and account issues before provisioning.

### Checklist

- Verify credentials are set and non-empty.
- Validate service principal access.
- Confirm target region supports `Standard_D2s_v5`.
- Confirm no stale test RG from previous failed run.

### Suggested commands

```bash
python - <<'PY'
import os
required = [
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
]
missing = [k for k in required if not os.environ.get(k)]
print("missing:", missing)
PY
```

Start backend and validate credentials endpoint:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

```bash
curl -s -X POST http://localhost:8000/api/v1/providers/azure/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "azure",
    "subscription_id": "'"$AZURE_SUBSCRIPTION_ID"'",
    "tenant_id": "'"$AZURE_TENANT_ID"'",
    "client_id": "'"$AZURE_CLIENT_ID"'",
    "client_secret": "'"$AZURE_CLIENT_SECRET"'"
  }' | jq .
```

Expected: `valid: true` with an authentication message.

---

## Phase 1 - Offline Static and Contract Tests (Free)

Purpose: fail fast before any cloud calls.

### Run

```bash
pytest tests/test_lint.py -m phase1 -v
pytest tests/test_dry_run.py -m phase2 -v
pytest tests/test_api.py -m phase2 -v
```

### Must-pass scope

- Model and schema imports
- Provider registry behavior
- Azure parameter translation (`build_azure_params`)
- Image parsing logic (`parse_image_reference`)
- Endpoint wiring and basic API error handling

If anything fails here, stop. Do not run live tests.

---

## Phase 2 - Mock-mode Orchestration Tests (Free)

Purpose: validate asynchronous orchestration and WS signaling without Azure spend.

### Setup

```bash
export PRIVATEAI_TEST_MODE=true
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Test objectives

1. `POST /deployments` returns `202` immediately.
2. WebSocket emits progress events and terminal status (`running` or `failed`).
3. Dashboard polling endpoints (`/deployments`, `/deployments/{id}`, `/live`) remain coherent.
4. Lifecycle calls (`start`, `stop`, `destroy`) update state machine as expected.

### Recommendation

- Keep this in CI because it validates orchestration semantics even when Azure is unavailable.

---

## Phase 3 - Live Azure SDK Provisioning on Standard_D2s_v5 (Cheap, Critical)

Purpose: validate real Azure SDK provisioning steps and generated infrastructure.

Baseline test file: `tests/test_cheap_vm.py`.
Extended test files: `tests/test_phase3_*.py`.

### Run baseline

```bash
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s
```

### What baseline covers today

- Provision RG + NSG + VNet + PIP + NIC + VM + data disk
- VM status fetch
- SSH connectivity
- Validation pass (without GPU requirement)
- Stop/start lifecycle
- Teardown

### Azure SDK assertions executed in extended suite

These checks are covered by the extended Phase 3 files:

1. **Resource tagging**
   - All major resources contain expected tags (`project`, `created-by`).
2. **NSG rules correctness**
   - Inbound `22` exists.
   - Inbound `11434` exists.
   - Open WebUI port rule exists only when requested.
3. **Network placement**
   - NIC is attached to expected subnet.
   - Public IP is static Standard SKU.
4. **VM security profile**
   - `TrustedLaunch` for standard security tests.
   - No confidential-only assumptions on D2s_v5 stage.
5. **Disk attachment**
   - Data disk exists and attached at expected LUN.

---

## Phase 4 - Provisioning Script Validation on D2s_v5 (Setup + Validate)

Purpose: thoroughly test `vm_setup.py` and `validator.py` behavior on cheap VM.

This phase is mandatory before any H100 validation.

Primary automated coverage:

- `tests/test_phase3_setup_ollama_webui.py`
- `tests/test_phase3_recovery_paths.py`
- `tests/test_phase3_negative_inputs.py`

### Deployment payload (D2s_v5 with setup enabled)

Use API-driven deployment (not just provider direct calls) to include orchestrator and WebSocket flow.

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
      "region": "eastus",
      "vm_name": "privateai-d2s-setup-test",
      "resource_group": "privateai-d2s-setup-rg",
      "vm_size": "Standard_D2s_v5",
      "security_level": "standard",
      "setup": {
        "models": ["gemma3:4b"],
        "deploy_open_webui": true,
        "open_webui_port": 3000
      }
    }
  }' | jq .
```

### Validate setup step-by-step

For the resulting VM IP:

1. SSH connection becomes available within retry budget.
2. `/models` exists and is mounted when disk attach succeeded.
3. Ollama service is active.
4. Ollama environment includes:
   - `OLLAMA_HOST=0.0.0.0:11434`
   - `OLLAMA_MODELS=/models/ollama`
5. Model pull result includes requested model(s).
6. Open WebUI container is running when requested.

### Expected D2s_v5 behavior for NVIDIA step

- D2s_v5 has no GPU.
- Setup should not hard-fail solely because GPU is absent.
- If driver step is skipped, remaining steps (Ollama/Open WebUI) should still complete.

---

## Phase 5 - Networking Validation (Ollama + Open WebUI)

Purpose: ensure real network exposure and access control work as intended.

### A) Ollama local and remote checks

From VM (SSH):

```bash
curl -sf http://localhost:11434/api/tags | jq .
systemctl is-active ollama
systemctl show ollama --property=Environment
```

From test runner host:

```bash
curl -sf http://<VM_IP>:11434/api/tags | jq .
curl -s http://<VM_IP>:11434/api/generate \
  -d '{"model":"gemma3:4b","prompt":"ping","stream":false}' | jq .
```

Expected:

- local endpoint responds
- remote endpoint responds (if NSG allows source)
- generate returns non-empty response

### B) Open WebUI checks

From VM (SSH):

```bash
sudo docker inspect --format='{{.State.Status}}' open-webui
curl -sf http://localhost:3000 >/dev/null
```

From test runner host:

```bash
curl -I http://<VM_IP>:3000
```

Expected:

- container state is `running`
- HTTP reachable on configured port
- if custom port is used, only that port should be open (plus required ports)

### C) NSG source filtering checks

Run at least two scenarios:

1. Wide open test (`*`) for rapid bring-up.
2. Restricted CIDR test (your runner IP only).

Verify behavior:

- Allowed source can access `22`, `11434`, and WebUI port.
- Non-allowed source cannot access restricted ports.

---

## Phase 6 - Lifecycle, Recovery, and Idempotence Tests

Purpose: validate operational reliability over repeated runs.

### Required cases

1. Stop/start cycle at least 3 times on the same D2s VM.
2. `GET /deployments/{id}/live` reflects current power state after each action.
3. Re-run setup endpoint `POST /deployments/{id}/setup` after VM restart.
4. Validate endpoint `POST /deployments/{id}/validate` after each cycle.
5. Destroy endpoint deletes RG and transitions to terminal state.

### Failure injection cases (recommended)

1. Invalid credentials -> provisioning fails early with useful error.
2. Invalid region or unavailable SKU -> failure includes Azure message.
3. Invalid model name (bad characters) -> model skipped safely, setup does not crash.
4. WebUI port conflict (pre-bind port) -> setup reports Open WebUI failure detail.
5. SSH key missing -> setup/validate fail with explicit key-path error.

---

## Phase 7 - Auto-Shutdown and Cost Controls

Purpose: ensure cost safety controls actually work.

### Tests

1. Set auto-shutdown via API:

```bash
curl -s -X POST http://localhost:8000/api/v1/deployments/<ID>/auto-shutdown \
  -H "Content-Type: application/json" \
  -d '{"time_utc":"1800"}' | jq .
```

2. Confirm schedule exists in Azure (`Microsoft.DevTestLab/schedules`).
3. Update schedule time and verify change.
4. Destroy deployment and verify schedule is removed with RG deletion.

---

## Phase 8 - Exit Gates Before Any H100 Testing

Do not start H100 tests until all gates below pass.

### Reliability gates on D2s_v5

1. At least 5 full end-to-end runs pass in a row.
2. At least 2 regions tested successfully (for SKU/region variance).
3. Setup success rate >= 95% across reruns.
4. No orphaned resource groups after teardown.
5. Ollama remote API verified in every run.
6. Open WebUI path verified in at least 3 runs.
7. Stop/start/setup/validate cycle verified after reboot.

### Evidence to store per run

- Deployment ID
- Region, VM size, and config payload (sanitized)
- Provision/setup step timelines
- Validation output
- Endpoint checks (Ollama/Open WebUI)
- Final teardown confirmation

---

## 9) Minimal H100 Test Plan (After Gates)

Once D2s_v5 gates pass, run a constrained H100 suite:

1. One confidential provisioning run.
2. One setup run with GPU checks enabled.
3. Validate `nvidia-smi` and GPU model detection.
4. Run at least one inference on target large model.
5. Verify lifecycle actions still work.
6. Destroy immediately.

Keep H100 runtime short and purpose-driven.

---

## 10) Extended Automated Test Files (Implemented)

These files are now part of the recommended pre-H100 test suite.

### Implemented files

1. `tests/test_phase3_sdk_assertions.py`
   - assert NSG rule payloads, NIC settings, tags, disk properties
2. `tests/test_phase3_setup_ollama_webui.py`
   - deploy D2s via provider flow, run setup, assert Ollama + Open WebUI health
3. `tests/test_phase3_network_restrictions.py`
   - CIDR restriction behavior and port accessibility checks
4. `tests/test_phase3_recovery_paths.py`
   - rerun setup, stop/start loops, post-reboot validation
5. `tests/test_phase3_negative_inputs.py`
   - invalid creds/region/model tags and error contract assertions

Shared helper file:

- `tests/live_test_utils.py`

---

## 11) Teardown and Cleanup

Always run cleanup after live tests:

```bash
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

If a run fails mid-way:

```bash
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -k teardown -v -s
```

Post-cleanup checks:

1. Resource group no longer exists.
2. Local test state files are removed.
3. No running VM from the test remains billable.

---

## 12) Troubleshooting Shortlist

### Live tests skipped

- Ensure `AZURE_TEST_LIVE=true` is set.

### Provisioning fails with SKU/region errors

- Switch region or confirm SKU availability for `Standard_D2s_v5`.

### SSH times out

- Confirm NSG allows port 22 from your source.
- Wait for cloud-init/sshd to finish bootstrapping.
- Verify `~/.ssh/id_ed25519` exists.

### Ollama local works but remote fails

- Check `OLLAMA_HOST=0.0.0.0:11434` in systemd environment.
- Check NSG rule for port `11434` and source CIDR.

### Open WebUI container exists but endpoint fails

- Check container status/logs.
- Confirm host port mapping matches `open_webui_port`.
- Confirm NSG allows that port.

---

## 13) Recommended Daily Flow for Backend Engineers

1. Run Phase 1-2 locally before pushing.
2. Run one D2s live test loop for infrastructure confidence.
3. Run one D2s setup/network loop for Ollama/Open WebUI confidence.
4. Run teardown and verify no cloud leftovers.
5. Reserve H100 runs for milestone validations only.

This flow gives high confidence in Azure SDK + provisioning behavior while keeping cost and risk low.
