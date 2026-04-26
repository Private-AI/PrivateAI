#!/bin/bash
# Run this script on a fresh Ubuntu 22.04 server to install prerequisites
# and deploy PrivateAI for the first time.
#
# Usage:
#   scp -r . user@server:/opt/privateai
#   ssh user@server "cd /opt/privateai && bash scripts/deploy-server.sh yourdomain.com"

set -e

DOMAIN="${1:?Usage: $0 yourdomain.com}"
EMAIL="${2:-admin@$DOMAIN}"

echo "==> Installing Docker..."
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "==> Installing Certbot..."
apt-get install -y -q certbot

echo "==> Opening firewall ports..."
ufw allow 22 || true
ufw allow 80 || true
ufw allow 443 || true
ufw allow 8443 || true
ufw --force enable || true

echo "==> Getting SSL certificates for $DOMAIN..."
certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN"

mkdir -p nginx/certs
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem  nginx/certs/
chmod 600 nginx/certs/*.pem

echo "==> Creating .env.prod..."
cat > .env.prod << EOF
DOMAIN=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN,https://$DOMAIN:8443
OPEN_WEBUI_PUBLIC_URL=https://$DOMAIN:8443
PYTHONPATH=/app/backend
PYTHONUNBUFFERED=1
OPEN_WEBUI_VENV=/opt/open-webui-env
OPEN_WEBUI_DATA_DIR=/app/open-webui-data
OPEN_WEBUI_PORT=8080
EOF

echo "==> Building and starting PrivateAI..."
DOMAIN=https://$DOMAIN docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "=== PrivateAI is live! ==="
echo "  App:      https://$DOMAIN"
echo "  Open WebUI: https://$DOMAIN:8443"
echo ""
echo "To view logs:  docker compose -f docker-compose.prod.yml logs -f"
echo "To stop:       docker compose -f docker-compose.prod.yml down"
