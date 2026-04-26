#!/usr/bin/env bash
set -euo pipefail

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

cleanup() {
  if [[ -n "${backend_pid:-}" ]]; then
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
  if [[ -n "${frontend_pid:-}" ]]; then
    kill "${frontend_pid}" 2>/dev/null || true
    wait "${frontend_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

# Start backend — failure here does not kill the container.
# If uvicorn crashes, API calls return 502 but the health check
# (handled locally by server.cjs) keeps passing.
cd /app/backend
uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" &
backend_pid=$!

# Frontend is the primary process — Railway health-checks it.
cd /app/frontend
node server.cjs &
frontend_pid=$!

# Only exit when the frontend exits. Backend failure is survivable.
wait "${frontend_pid}"
