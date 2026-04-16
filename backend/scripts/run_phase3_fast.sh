#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="${PRIVATEAI_TEST_LOG_DIR:-/tmp/privateai-phase3-logs-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$LOG_DIR"

required_env=(
  AZURE_SUBSCRIPTION_ID
  AZURE_TENANT_ID
  AZURE_CLIENT_ID
  AZURE_CLIENT_SECRET
)

missing=()
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "Missing required environment variables: ${missing[*]}"
  exit 1
fi

export AZURE_TEST_LIVE=true
export AZURE_LOCATION="${AZURE_LOCATION:-eastus}"

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

cleanup() {
  echo
  echo "[cleanup] running teardown..."
  AZURE_TEST_LIVE=true pytest tests/test_teardown.py -v -s \
    | tee "$LOG_DIR/99-teardown.log" || true
}
trap cleanup EXIT

run_step() {
  local name="$1"
  local cmd="$2"
  local logfile="$3"

  echo
  echo "[$name] $cmd"
  bash -lc "$cmd" | tee "$LOG_DIR/$logfile"
}

run_step "phase1-preflight" \
  "pytest tests/test_lint.py tests/test_dry_run.py tests/test_api.py -v" \
  "00-preflight.log"

run_step "phase3-cheap-vm" \
  "AZURE_TEST_LIVE=true pytest tests/test_cheap_vm.py -m phase3 -v -s" \
  "01-cheap-vm.log"

run_step "phase3-setup-webui" \
  "AZURE_TEST_LIVE=true pytest tests/test_phase3_setup_ollama_webui.py -m phase3 -v -s" \
  "02-setup-webui.log"

echo
echo "Fast phase3 flow completed successfully. Logs: $LOG_DIR"
