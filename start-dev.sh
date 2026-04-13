#!/bin/bash
set -e

echo "=== PrivateAI Development Environment ==="
echo ""
echo "Options:"
echo "1. Separate containers (recommended for production-like dev)"
echo "2. Single container (simpler for development)"
echo "3. Development shell (interactive)"
echo ""
read -p "Choose option (1/2/3) [1]: " choice
choice=${choice:-1}

case $choice in
  1)
    echo "Starting separate containers (backend + frontend)..."
    docker compose up --build -d backend frontend
    echo ""
    echo "Containers started."
    echo "Backend API: http://localhost:8000"
    echo "Frontend Next.js: http://localhost:3000"
    ;;
  2)
    echo "Starting single combined container..."
    docker compose up --build -d combined
    echo ""
    echo "Container started."
    echo "Backend API: http://localhost:8000"
    echo "Frontend Next.js: http://localhost:3000"
    ;;
  3)
    echo "Starting development shell..."
    docker compose run --rm dev
    exit 0
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "To run Electron on host (requires GUI):"
echo "  cd frontend"
echo "  npm run dev:electron"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop containers:"
echo "  docker compose down"