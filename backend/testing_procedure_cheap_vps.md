# Cheap VPS (Azure D2s_v5) Testing Procedure — Copy/Paste Edition

This document is a focused, low-effort test runbook for the **cheap VPS phase** only.

Goal: set Azure credentials once, run pre-written commands in order, and quickly decide pass/fail.

Scope: `Standard_D2s_v5` only (no H100 here).

---

## 1) One-time terminal setup (per shell)

From repository root:

```bash
cd /home/kalaa/PrivateAI/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx
```

---

## 2) Set Azure credentials (required)

Paste and fill in values:

```bash
export AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_SECRET="your-secret-here"

# Required to run live tests
export AZURE_TEST_LIVE=true

# Optional (defaults to eastus in tests)
export AZURE_LOCATION=eastus
```

Quick credential/env sanity check:

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
print("AZURE_TEST_LIVE:", os.environ.get("AZURE_TEST_LIVE"))
print("AZURE_LOCATION:", os.environ.get("AZURE_LOCATION", "(default: eastus)"))
PY
```

Expected:
- `MISSING: none`
- `AZURE_TEST_LIVE: true`

---

## 3) SSH key prerequisite (required for setup/validate)

```bash
test -f ~/.ssh/id_ed25519 && echo "OK: ~/.ssh/id_ed25519 exists" || echo "MISSING: ~/.ssh/id_ed25519"
```

If missing:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
```

---

## 4) Fastest practical test flow (recommended when time is tight)

This is the minimum high-signal cheap-VPS flow:

### 4.1 Free preflight (no Azure spend)

```bash
pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v | tee /tmp/privateai-phase3-00-preflight.log
```

Pass criteria:
- Summary ends with `failed=0` and no `ERROR`.

### 4.2 Baseline cheap VM lifecycle (critical)

```bash
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s | tee /tmp/privateai-phase3-01-cheap-vm.log
```

Pass criteria:
- `test_01_deploy` through `test_05_stop_and_start` pass.
- `test_99_teardown` passes (or at minimum no teardown failure).
- No `FAILED`/`ERROR` in summary.

### 4.3 Setup + Ollama + Open WebUI deep validation (critical)

```bash
AZURE_TEST_LIVE=true pytest tests/test_phase3_setup_ollama_webui.py -m phase3 -v -s | tee /tmp/privateai-phase3-02-setup-webui.log
```

Pass criteria:
- All tests in this file pass.
- Specifically confirms:
  - setup steps complete (`connect`, `install_ollama`, `install_open_webui`)
  - validator checks pass (`SSH connectivity`, `Ollama service`, `Ollama API`, `Open WebUI container`)
  - remote HTTP checks succeed (`:11434` and `:3000`).

### 4.4 Always run teardown at end

```bash
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s | tee /tmp/privateai-phase3-99-teardown.log
```

Pass criteria:
- teardown test completes without failure.
- local state files cleaned.

---

## 5) Full cheap VPS suite (use before milestone/release)

Run this after the fast flow if you want deeper confidence.

```bash
AZURE_TEST_LIVE=true pytest tests/test_phase3_sdk_assertions.py -m phase3 -v -s | tee /tmp/privateai-phase3-03-sdk.log
AZURE_TEST_LIVE=true pytest tests/test_phase3_network_restrictions.py -m phase3 -v -s | tee /tmp/privateai-phase3-04-network.log
AZURE_TEST_LIVE=true pytest tests/test_phase3_recovery_paths.py -m phase3 -v -s | tee /tmp/privateai-phase3-05-recovery.log
AZURE_TEST_LIVE=true pytest tests/test_phase3_negative_inputs.py -m phase3 -v -s | tee /tmp/privateai-phase3-06-negative.log
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s | tee /tmp/privateai-phase3-99-teardown-full.log
```

---

## 6) Super-quick output assessment commands

After any test run, use these to quickly classify result:

```bash
# Replace <LOGFILE> with one from /tmp above
grep -E "FAILED|ERROR|Traceback" <LOGFILE> && echo "❌ FAIL" || echo "✅ NO FAIL PATTERNS FOUND"
```

```bash
grep -E "=+ .* passed|failed=" <LOGFILE> | tail -n 5
```

Interpretation:
- If you see `FAILED`/`ERROR`/`Traceback` -> treat as fail.
- If summary shows only passes/skips and no failures -> treat as pass.

---

## 7) Most common failure cases (and immediate fixes)

### A) Tests are skipped unexpectedly
Cause: `AZURE_TEST_LIVE` not set to `true`.

Fix:

```bash
export AZURE_TEST_LIVE=true
```

### B) SSH failures/timeouts
Likely causes:
- missing `~/.ssh/id_ed25519`
- NSG reachability delay right after provisioning

Fix:
- ensure key exists (Section 3)
- rerun the specific failing test file once after 1-2 minutes

### C) Region/SKU provisioning errors
Cause: temporary Azure capacity/availability issue.

Fix:

```bash
export AZURE_LOCATION=eastus
# or switch to another allowed region you use
```

Then rerun the same test command.

### D) You suspect leaked resources after interrupted run
Run cleanup immediately:

```bash
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

---

## 8) Daily minimal-effort routine (copy this block)

If you only have a few minutes, run exactly this:

```bash
cd /home/kalaa/PrivateAI/backend
source .venv/bin/activate

pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v
AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s
AZURE_TEST_LIVE=true pytest tests/test_phase3_setup_ollama_webui.py -m phase3 -v -s
AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s
```

If all 4 commands pass, you have strong cheap-VPS confidence with minimal effort.

---

## 9) Exit gate before H100

Do **not** move to H100 unless:
1. The 4-command daily routine above passes.
2. No teardown failures.
3. No orphaned test VM/resource group remains.
