# Testing Procedure

Testing is organized into five phases, ordered by cost. Phases 1 and 2 are
free and should run in CI on every push. Phases 3-5 create real Azure
resources and are opt-in via environment variables.

**Total test count:** 126 (110 offline + 16 live)

---

## Prerequisites

```bash
cd backend

# Install runtime + test dependencies
pip install -r requirements.txt
pip install pytest httpx
```

For Phase 3+ (live Azure tests), you also need a service principal with
Contributor access on the target subscription:

```bash
export AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_SECRET="your-client-secret"
```

An SSH key pair at `~/.ssh/id_ed25519` is required for Phase 3+ tests that
SSH into the provisioned VM. If one doesn't exist, the provisioner will
generate it automatically.

---

## Phase 1: Static Analysis

**Cost: $0** | **Time: <1 second** | **File: `tests/test_lint.py`** | **Tests: 66**

Validates code structure, imports, and hygiene without touching any cloud
API.

```bash
pytest tests/test_lint.py -m phase1 -v
```

### What it checks

**TestImports (29 tests)**

- Every module under `app/` imports without errors (21 parametrized cases
  covering models, providers, services, and routers)
- Key classes exist: `DeploymentConfig`, `DeploymentRecord`, `DeploymentStatus`,
  `AzureCredentials`, `GCPCredentials`, `AWSCredentials`, `CloudProvider`,
  `ProvisionResult`, `SetupResult`, `ValidationResult`, `VMStatusResult`
- `AzureProvider` instantiates and reports `name == "azure"`
- Provider registry returns at least one provider; `get_provider("azure")` works
- `DeploymentOrchestrator` and `DeploymentStore` are callable/instantiable
- FastAPI app loads with `title == "PrivateAI Backend"`

**TestCodeQuality (37 tests)**

- No hardcoded secrets in any source file (scans for `password=`, `secret=`,
  `token=`, `api_key=` outside of comments, type hints, and Pydantic fields)
- Every non-`__init__` module has a module-level docstring
- All 21 expected source files exist at their expected paths

### Expected output

```
tests/test_lint.py  66 passed in 0.66s
```

---

## Phase 2: Dry-Run Validation

**Cost: $0** | **Time: <1 second** | **Files: `tests/test_dry_run.py`, `tests/test_api.py`** | **Tests: 44**

Tests the provider-agnostic configuration models, Azure-specific parameter
translation, image parsing, and every HTTP endpoint's wiring — all without
making cloud API calls.

```bash
# Both files
pytest tests/test_dry_run.py tests/test_api.py -m phase2 -v

# Or individually
pytest tests/test_dry_run.py -m phase2 -v
pytest tests/test_api.py -m phase2 -v
```

### test_dry_run.py (28 tests)

**TestAzureConfigTranslation (11 tests)** — verifies that a
provider-agnostic `DeploymentConfig` translates into correct Azure SDK
parameters:

| Test | What it verifies |
|------|------------------|
| `test_confidential_vm_params` | `security_level=confidential` produces `ConfidentialVM`, `VMGuestStateOnly`, and confidential image |
| `test_standard_vm_params` | `security_level=standard` produces `TrustedLaunch`, no disk encryption, standard image |
| `test_location_propagates` | Region flows through to `location` |
| `test_custom_location` | Non-default region (e.g. `westus3`) is respected |
| `test_resource_group_propagates` | Resource group name flows through |
| `test_derived_names` | NSG, VNet, subnet, PIP, NIC, and data disk names are derived correctly from RG/VM names |
| `test_disk_sizes_propagate` | `os_disk_size_gb` and `data_disk_size_gb` flow through |
| `test_cheap_vm_uses_standard_disks` | `Standard_D2s_v5` defaults to `Standard_LRS` disks |
| `test_production_uses_premium_disks` | H100 VM defaults to `Premium_LRS` disks |
| `test_nsg_sources_from_allowed_ips` | `allowed_ssh_sources` and `allowed_api_sources` map to NSG rules |
| `test_disk_encryption_override` | `provider_options.disk_encryption` overrides the default |

**TestImageParsing (4 tests)** — verifies OS image URN parsing:

| Test | What it verifies |
|------|------------------|
| `test_parse_confidential_alias` | `ubuntu-confidential-22.04` resolves to Canonical CVM image |
| `test_parse_standard_alias` | `ubuntu-22.04` resolves to Canonical server image |
| `test_parse_full_urn` | `publisher:offer:sku:version` URN parses into four fields |
| `test_invalid_image_raises` | Unrecognized string raises `ValueError` |

**TestDeploymentConfig (5 tests)** — verifies provider-agnostic model
defaults and validation:

| Test | What it verifies |
|------|------------------|
| `test_production_defaults` | H100 config has correct provider, region, security level |
| `test_test_defaults` | Cheap test config has `Standard_D2s_v5`, standard security |
| `test_setup_config_defaults` | Default `SetupConfig`: `["gemma3:4b"]`, no Open WebUI, port 3000 |
| `test_deployment_record_creation` | `DeploymentRecord` generates UUID, starts at `pending` status |
| `test_vm_name_validation` | VM names must match `^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$` |

**TestAzureProvider (5 tests)** — verifies `AzureProvider` metadata methods
that don't call the cloud:

| Test | What it verifies |
|------|------------------|
| `test_regions` | At least 5 regions returned, includes `eastus` and `westeurope` |
| `test_vm_sizes` | At least 3 profiles returned, includes `h100-confidential` and `test-no-gpu` |
| `test_service_endpoints` | SSH/Ollama URLs built correctly; Open WebUI empty when not requested |
| `test_service_endpoints_with_webui` | Open WebUI URL includes custom port when `deploy_open_webui=True` |
| `test_service_endpoints_no_ip` | All endpoints are empty strings when no IP is available |

**TestVMProfiles (3 tests)** — verifies predefined Azure VM profiles:

| Test | What it verifies |
|------|------------------|
| `test_profiles_have_required_fields` | Every profile has id, name, vm_size, vcpus > 0, memory > 0 |
| `test_h100_is_confidential` | H100 profile: `confidential=True`, `gpus >= 1` |
| `test_test_vm_has_no_gpu` | Test profile: `gpus=0`, `confidential=False` |

### test_api.py (16 tests)

Uses FastAPI's `TestClient` to send real HTTP requests through the
application without any network calls.

**TestHealthEndpoints (2 tests)**

| Test | What it verifies |
|------|------------------|
| `test_root` | `GET /` returns 200 with `"PrivateAI"` in message and a `version` field |
| `test_health` | `GET /health` returns `{"status": "healthy"}` |

**TestProviderEndpoints (4 tests)**

| Test | What it verifies |
|------|------------------|
| `test_list_providers` | `GET /api/v1/providers` returns azure with regions |
| `test_list_vm_sizes` | `GET /api/v1/providers/azure/vm-sizes` returns H100 profile |
| `test_list_vm_sizes_unknown_provider` | Unknown provider returns 404 |
| `test_validate_credentials_unknown_provider` | Unknown provider returns 404 |

**TestDeploymentEndpoints (9 tests)**

| Test | What it verifies |
|------|------------------|
| `test_list_deployments_empty` | `GET /api/v1/deployments` returns empty list |
| `test_get_deployment_not_found` | Nonexistent ID returns 404 |
| `test_start_deployment_not_found` | Start on nonexistent returns 404 |
| `test_stop_deployment_not_found` | Stop on nonexistent returns 404 |
| `test_destroy_deployment_not_found` | Delete on nonexistent returns 404 |
| `test_setup_deployment_not_found` | Setup on nonexistent returns 404 |
| `test_validate_deployment_not_found` | Validate on nonexistent returns 404 |
| `test_services_deployment_not_found` | Services on nonexistent returns 404 |
| `test_auto_shutdown_deployment_not_found` | Auto-shutdown on nonexistent returns 404 |

**TestOpenAPISchema (1 test)**

| Test | What it verifies |
|------|------------------|
| `test_openapi_json` | `/openapi.json` returns valid schema with correct title and expected paths |

### Expected output

```
tests/test_dry_run.py  28 passed
tests/test_api.py      16 passed
                       44 passed in 0.84s
```

---

## Phase 3: Cheap VM Integration Test

**Cost: ~$0.10/hour** | **Time: ~5 minutes** | **File: `tests/test_cheap_vm.py`** | **Tests: 6**

Deploys a real `Standard_D2s_v5` (2 vCPUs, 8 GB RAM, no GPU) on Azure to
exercise the full provisioning pipeline end-to-end. Creates real resources
that cost money — **must be torn down after testing**.

Tests are numbered and must run in order. Do not use a test randomization
plugin on this file.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_TEST_LIVE` | Yes | Must be `true` to run these tests |
| `AZURE_SUBSCRIPTION_ID` | Yes | Azure subscription UUID |
| `AZURE_TENANT_ID` | Yes | Azure AD tenant UUID |
| `AZURE_CLIENT_ID` | Yes | Service principal client UUID |
| `AZURE_CLIENT_SECRET` | Yes | Service principal secret |

### Run

```bash
# Full pipeline: deploy → validate → stop/start → teardown
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Teardown only (if a previous run failed partway through)
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -k teardown -v -s
```

The `-s` flag is important — it shows live progress output from the Azure
SDK.

### What it checks

| Test | What it does | Azure resources involved |
|------|-------------|--------------------------|
| `test_01_deploy` | Provisions RG, NSG, VNet, PIP, NIC, VM, data disk | All 7 resource types |
| `test_02_vm_status` | Queries VM power state and resource count | Compute + Resource APIs |
| `test_03_ssh_connectivity` | SSH into VM, run `hostname` | VM network path |
| `test_04_validate_remote` | Full validation suite over SSH (OS, disk) | SSH + VM internals |
| `test_05_stop_and_start` | Deallocate → verify stopped → start → verify running | Compute lifecycle APIs |
| `test_99_teardown` | Delete entire resource group | Resource group deletion |

### State persistence

Test state (resource group, VM name, public IP) is saved to
`/tmp/privateai-test-state.json` between tests so that later tests can
pick up where earlier ones left off. The teardown test deletes this file.

### What this does NOT test

- GPU functionality (no GPU on `D2s_v5`)
- Ollama installation (NVIDIA driver step will fail without a GPU)
- Open WebUI deployment
- Confidential VM security features (test VM uses `TrustedLaunch`)

These are covered by Phase 5.

---

## Phase 4: Remote VM Validation

**Cost: $0** (uses an already-running VM) | **Time: ~30 seconds** | **File: `tests/test_validate_remote.py`** | **Tests: 7**

Runs the validation suite against any running VM. Use this after a Phase 3
deploy, or point it at a production H100 VM to verify its health.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_TEST_VM_IP` | Yes | Public IP of the target VM |
| `AZURE_TEST_GPU` | No | Set to `true` to include GPU checks |
| `AZURE_SUBSCRIPTION_ID` | Yes | Azure subscription UUID |
| `AZURE_TENANT_ID` | Yes | Azure AD tenant UUID |
| `AZURE_CLIENT_ID` | Yes | Service principal client UUID |
| `AZURE_CLIENT_SECRET` | Yes | Service principal secret |

### Run

```bash
# Without GPU checks (test VM or any VM without GPU)
AZURE_TEST_VM_IP=20.x.x.x pytest tests/test_validate_remote.py -m phase4 -v -s

# With GPU checks (H100 or other GPU VM)
AZURE_TEST_VM_IP=20.x.x.x AZURE_TEST_GPU=true pytest tests/test_validate_remote.py -m phase4 -v -s
```

### What it checks

| Test | What it verifies | Skips if |
|------|------------------|----------|
| `test_full_validation` | Complete validation suite passes, SSH must succeed | — |
| `test_ssh_connectivity` | SSH connection succeeds | — |
| `test_system_info` | OS name, CPU count > 0, memory retrievable | — |
| `test_data_disk` | `/models` exists (mounted or as directory) | — |
| `test_gpu` | `nvidia-smi` returns GPU info | `AZURE_TEST_GPU != true` |
| `test_ollama_service` | Ollama systemd service is active | Ollama not installed |
| `test_ollama_api_remote` | Ollama API reachable at `http://<IP>:11434` | Ollama not running |

---

## Phase 5: Full H100 Production Test

**Cost: ~$35/hour** | **Target: 15-20 minutes = ~$10-15** | **Tests: manual via API**

This phase tests the complete stack: Confidential VM with H100 GPU, NVIDIA
driver, Ollama with GPU inference, model serving, and optionally Open WebUI.

There are no automated pytest tests for this phase — it uses the live API.
Destroy resources immediately after testing.

### Step 1: Start the backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 2: Create a deployment

```bash
curl -s -X POST http://localhost:8000/api/v1/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "provider": "azure",
      "subscription_id": "'$AZURE_SUBSCRIPTION_ID'",
      "tenant_id": "'$AZURE_TENANT_ID'",
      "client_id": "'$AZURE_CLIENT_ID'",
      "client_secret": "'$AZURE_CLIENT_SECRET'"
    },
    "config": {
      "provider": "azure",
      "region": "eastus",
      "vm_size": "Standard_NCC40ads_H100_v5",
      "security_level": "confidential",
      "setup": {
        "models": ["gemma3:27b-fp16", "gemma3:4b"],
        "deploy_open_webui": true
      }
    }
  }' | jq .
```

Save the returned `id` value.

### Step 3: Monitor provisioning

```bash
# Poll status
curl -s http://localhost:8000/api/v1/deployments/{id} | jq '.status, .public_ip'

# Or connect WebSocket for real-time progress (requires wscat: npm i -g wscat)
wscat -c ws://localhost:8000/api/v1/deployments/{id}/ws
```

### Step 4: Validate with GPU checks

```bash
curl -s -X POST "http://localhost:8000/api/v1/deployments/{id}/validate?check_gpu=true" | jq .
```

### Step 5: Test inference

```bash
VM_IP=$(curl -s http://localhost:8000/api/v1/deployments/{id} | jq -r '.public_ip')

# Quick test
curl -s http://$VM_IP:11434/api/generate \
  -d '{"model":"gemma3:4b","prompt":"Say hello in 5 words.","stream":false}' | jq .response

# Full precision model
curl -s http://$VM_IP:11434/api/generate \
  -d '{"model":"gemma3:27b-fp16","prompt":"Explain confidential computing in two sentences.","stream":false}' | jq .response

# OpenAI-compatible endpoint
curl -s http://$VM_IP:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma3:4b","messages":[{"role":"user","content":"Hello"}]}' | jq .
```

### Step 6: Verify confidential computing (SSH)

```bash
ssh azureuser@$VM_IP

# AMD SEV-SNP attestation
dmesg | grep -i sev

# vTPM present
ls /dev/tpm*

# Secure Boot state
mokutil --sb-state
```

### Step 7: Set auto-shutdown (cost safety)

```bash
curl -s -X POST http://localhost:8000/api/v1/deployments/{id}/auto-shutdown \
  -H "Content-Type: application/json" \
  -d '{"time_utc": "1800"}' | jq .
```

### Step 8: Destroy immediately

```bash
curl -s -X DELETE http://localhost:8000/api/v1/deployments/{id} | jq .
```

---

## Teardown Utility

**File: `tests/test_teardown.py`** | **Tests: 3**

Standalone utility for cleaning up resources if a test run was interrupted
or you need to manually destroy infrastructure.

```bash
# Destroy test resource group (trustgpt-test-rg)
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -k "test_rg" -v -s

# Destroy production resource group (h100-conf-rg) — requires extra opt-in
AZURE_TEST_LIVE=true AZURE_NUKE_PROD=true pytest tests/test_teardown.py -k "prod_rg" -v -s

# Clean up local state files only (no cloud calls)
pytest tests/test_teardown.py -k "cleanup" -v
```

---

## Quick Reference

```bash
# ─── CI pipeline (free, runs in under 2 seconds) ───────────────────
pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v

# ─── Individual phases ──────────────────────────────────────────────

# Phase 1 — static analysis (free)
pytest tests/test_lint.py -m phase1 -v

# Phase 2 — config logic + API shapes (free)
pytest tests/test_dry_run.py tests/test_api.py -m phase2 -v

# Phase 3 — cheap VM integration (~$0.10/hr, requires Azure creds)
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s

# Phase 4 — remote validation (free, requires running VM)
AZURE_TEST_VM_IP=<IP> pytest tests/test_validate_remote.py -m phase4 -v -s

# ─── Cleanup ────────────────────────────────────────────────────────

# Teardown test resources
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s

# Teardown ALL resources (test + production)
AZURE_TEST_LIVE=true AZURE_NUKE_PROD=true pytest tests/test_teardown.py -v -s
```

---

## Test File Reference

| File | Phase | Tests | Cost | What it covers |
|------|-------|-------|------|----------------|
| `tests/test_lint.py` | 1 | 66 | $0 | Imports, code quality, secrets scan, file existence |
| `tests/test_dry_run.py` | 2 | 28 | $0 | Config translation, image parsing, model defaults, provider metadata |
| `tests/test_api.py` | 2 | 16 | $0 | HTTP endpoints, 404 handling, OpenAPI schema |
| `tests/test_cheap_vm.py` | 3 | 6 | ~$0.10/hr | Real Azure deploy, status, SSH, validate, lifecycle, teardown |
| `tests/test_validate_remote.py` | 4 | 7 | $0 | SSH checks, OS info, disk, GPU, Ollama service/API |
| `tests/test_teardown.py` | — | 3 | $0 | Resource group deletion, state file cleanup |
| `tests/conftest.py` | — | — | — | Shared fixtures: `production_config`, `test_config`, `mock_azure_credentials` |

---

## Troubleshooting

### Phase 3 tests are all skipped

Set `AZURE_TEST_LIVE=true`. Live tests are opt-in to prevent accidental
charges.

### "No H100 quota in eastus"

Request a quota increase at the
[Azure Quota portal](https://portal.azure.com/#blade/Microsoft_Azure_Capacity/QuotaMenuBlade).
Phase 3 tests use `Standard_D2s_v5` which needs no GPU quota.

### SSH connection timeout in Phase 3/4

1. Verify VM is running: check `test_02_vm_status` output
2. Verify SSH key exists: `ls ~/.ssh/id_ed25519`
3. Check NSG rules: the provisioner creates AllowSSH on port 22
4. If the VM was just created, wait 30-60 seconds for sshd to start

### "SkuNotAvailable" during Phase 3 deploy

The VM size is not available in the chosen region. The test defaults to
`eastus`. Override by modifying `_get_test_config()` in the test file, or
set `AZURE_LOCATION` in your environment.

### Pydantic validation error on DeploymentConfig

Check for stale environment variables. The config model validates field
formats (e.g. `vm_name` must match `^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$`).

### Phase 3 failed partway through — resources still running

Run the teardown test to clean up:

```bash
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -k teardown -v -s
```

Or use the standalone teardown utility:

```bash
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -k "test_rg" -v -s
```

### TestClient import error in test_api.py

Install `httpx`, which is required by FastAPI's `TestClient`:

```bash
pip install httpx
```
