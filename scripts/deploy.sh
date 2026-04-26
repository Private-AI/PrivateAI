#!/bin/bash
# One-shot deploy script. Run on a fresh Ubuntu 22.04 server:
#
#   bash scripts/deploy.sh <your-duckdns-subdomain> <your-email>
#
# Example:
#   bash scripts/deploy.sh privateai-demo.duckdns.org you@gmail.com

set -e

DOMAIN_HOST="${1:?Usage: $0 <duckdns-subdomain> <email>  e.g. myapp.duckdns.org you@gmail.com}"
EMAIL="${2:?Usage: $0 <duckdns-subdomain> <email>}"
DOMAIN_URL="https://$DOMAIN_HOST"

echo ""
echo "========================================"
echo "  PrivateAI deploy"
echo "  Domain : $DOMAIN_HOST"
echo "  Email  : $EMAIL"
echo "========================================"
echo ""

# ── Docker ────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker..."
    apt-get update -q
    apt-get install -y -q ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
    echo "==> Docker installed"
else
    echo "==> Docker already installed"
fi

# ── Firewall ──────────────────────────────────────────────────────────
echo "==> Configuring firewall..."
ufw allow 22   2>/dev/null || true
ufw allow 80   2>/dev/null || true
ufw allow 443  2>/dev/null || true
ufw allow 8443 2>/dev/null || true
ufw --force enable 2>/dev/null || true

# ── .env.prod ─────────────────────────────────────────────────────────
if [ ! -f .env.prod ]; then
    echo "==> Creating .env.prod..."
    cat > .env.prod << EOF
DOMAIN_HOST=$DOMAIN_HOST
DOMAIN_URL=$DOMAIN_URL
CADDY_EMAIL=$EMAIL
ALLOWED_ORIGINS=$DOMAIN_URL,$DOMAIN_URL:8443
OPEN_WEBUI_PUBLIC_URL=$DOMAIN_URL:8443
PYTHONPATH=/app/backend
PYTHONUNBUFFERED=1
OPEN_WEBUI_VENV=/opt/open-webui-env
OPEN_WEBUI_DATA_DIR=/app/open-webui-data
OPEN_WEBUI_PORT=8080
EOF
else
    echo "==> .env.prod already exists, skipping"
fi

# ── Build & start ──────────────────────────────────────────────────────
echo "==> Building Docker image (this takes ~15 min the first time)..."
DOMAIN_URL="$DOMAIN_URL" docker compose -f docker-compose.prod.yml build

echo "==> Starting services..."
DOMAIN_URL="$DOMAIN_URL" docker compose -f docker-compose.prod.yml up -d

echo ""
echo "========================================"
echo "  Done! PrivateAI is starting up."
echo ""
echo "  App        : $DOMAIN_URL"
echo "  Open WebUI : $DOMAIN_URL:8443"
echo ""
echo "  Watch logs : docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop       : docker compose -f docker-compose.prod.yml down"
echo "========================================"
