# PrivateAI — Hosted Demo Deployment Guide

This guide covers deploying PrivateAI as a **hosted web application** on a VPS. In this mode:

- The frontend (Next.js) and backend (FastAPI) run on the server
- **Open WebUI runs on the server** in multi-user mode
- **User credentials are encrypted in the browser** before reaching the server
- **SSH private keys never leave the user's browser**
- All chat data and model files live on **the user's own cloud VM**, not the VPS

---

## Quick Start

```bash
# 1. Clone and switch to hosted branch
git clone https://github.com/Aheadz/PrivateAI.git
cd PrivateAI
git checkout feat/hosted-demo

# 2. Configure environment
cp .env.hosted.example .env
# Edit .env and set PRIVATEAI_SECRET_KEY

# 3. Deploy
docker compose -f docker-compose.hosted.yml up -d

# 4. Open http://your-vps-ip
```

---

## Architecture

```
User Browser
├── localStorage: JWT token, SSH private key
└── Memory: decrypted Azure credentials (per-request only)

        ↓ HTTPS

VPS (Docker Compose)
├── nginx (port 80)
│   ├── /api/*     → backend:8000
│   ├── /open-webui/* → open-webui:8080
│   └── /*         → frontend:3000
│
├── frontend: Next.js SSR
│
├── backend: FastAPI + SQLite
│   ├── /auth/*    → JWT login/register
│   ├── /vault/*   → Encrypted blob storage (zero-knowledge)
│   ├── /deployments/* → VM provisioning (credentials per-request)
│   └── /privacy   → Transparency endpoint
│
└── open-webui: Multi-user Open WebUI (Docker image)
```

---

## Privacy Model

| Asset | Where Stored | Server Access |
|-------|-------------|---------------|
| **Azure credentials** | Client-side encrypted vault | Encrypted blobs only |
| **SSH private key** | Browser `localStorage` | **Never sent** |
| **Chat history** | User's own cloud VM | **Never touches VPS** |
| **File uploads** | User's own cloud VM | **Never touches VPS** |
| **User password** | bcrypt hash on VPS | One-way hash only |
| **Deployment metadata** | SQLite on VPS | Region, VM size, IP only |

**The server operator cannot:**
- Read your Azure credentials (encrypted with password-derived key)
- Access your VMs (no SSH private keys)
- Read your conversations (chat data lives on your VM)
- Charge your Azure account (credentials never stored)

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| VPS | 2 vCPU, 4GB RAM, 20GB SSD |
| OS | Ubuntu 22.04 LTS |
| Docker | 24.0+ with Compose plugin |
| Domain (optional) | For HTTPS via Let's Encrypt |

### Server Setup (Ubuntu)

```bash
# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

# Open firewall ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp  # if using HTTPS
```

---

## Configuration

### 1. Generate Secret Keys

```bash
# Generate a strong secret for JWT signing
openssl rand -hex 32

# Generate a secret for Open WebUI
openssl rand -hex 32
```

### 2. Create .env File

```bash
cp .env.hosted.example .env
nano .env
```

```env
PRIVATEAI_SECRET_KEY=your-64-char-hex-secret-here
HOST_PORT=80
OPEN_WEBUI_SECRET_KEY=your-open-webui-secret-here
```

### 3. Deploy

```bash
docker compose -f docker-compose.hosted.yml up -d
```

### 4. Verify

```bash
# Check all services are running
docker compose -f docker-compose.hosted.yml ps

# View logs
docker compose -f docker-compose.hosted.yml logs -f

# Test health
curl http://localhost/health
curl http://localhost/privacy
```

---

## HTTPS with Let's Encrypt

Add to `nginx/nginx.conf` inside the server block:

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

Mount the cert directory in `docker-compose.hosted.yml`:

```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

---

## Updating

```bash
# Pull latest code
git pull origin feat/hosted-demo

# Rebuild and restart
docker compose -f docker-compose.hosted.yml down
docker compose -f docker-compose.hosted.yml up -d --build
```

---

## Self-Host Option

The ultimate privacy option is hosting PrivateAI yourself:

```bash
git clone https://github.com/Aheadz/PrivateAI.git
cd PrivateAI
docker compose up -d
```

Full source code is available for audit at https://github.com/Aheadz/PrivateAI

---

## Troubleshooting

### "Invalid authentication credentials"
- JWT expired (30 min default). Re-login.
- Check `PRIVATEAI_SECRET_KEY` is consistent across restarts.

### Open WebUI not accessible
- Check container: `docker logs privateai-open-webui`
- Verify nginx upstream: `docker exec privateai-nginx nginx -t`

### Deployment fails with "credentials required"
- In hosted mode, credentials may need to be re-sent per-request after server restart.
- This is by design — credentials are not persisted to disk.

---

## API Reference

### Auth
- `POST /api/v1/auth/register` — Create account
- `POST /api/v1/auth/login` — Get JWT (form data: username, password)
- `GET /api/v1/auth/me` — Current user info

### Vault
- `POST /api/v1/vault/store` — Store encrypted blob
- `GET /api/v1/vault/retrieve` — Retrieve encrypted blob
- `DELETE /api/v1/vault/delete` — Delete vault

### Privacy
- `GET /privacy` — Transparency statement
