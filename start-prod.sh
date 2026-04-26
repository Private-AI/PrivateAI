#!/bin/bash
set -e

echo "[PrivateAI] Starting production services..."

# Backend (single worker — app uses in-memory state that cannot be shared)
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "[PrivateAI] Backend started (PID=$BACKEND_PID)"

# Frontend (Next.js production server)
cd /app/frontend
npm run start &
FRONTEND_PID=$!
echo "[PrivateAI] Frontend started (PID=$FRONTEND_PID)"

echo "[PrivateAI] Open WebUI starts automatically when the backend initialises"

_term() {
    echo "[PrivateAI] Shutting down..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    exit 0
}
trap _term SIGTERM SIGINT

# Exit if either service dies
wait -n "$BACKEND_PID" "$FRONTEND_PID"
echo "[PrivateAI] A service exited unexpectedly — shutting down"
kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
exit 1
