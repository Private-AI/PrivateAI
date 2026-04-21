"""PrivateAI Backend — FastAPI application entry point (hosted demo mode).

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

In production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth,
    cost,
    deployments,
    open_webui,
    providers,
    services,
    terminal,
    vault,
)

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)

logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PrivateAI Backend",
    version="0.3.0-hosted",
    description=(
        "Multi-cloud GPU VM provisioning API. "
        "Hosted demo with client-side encrypted credential vault."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────────────

# Build CORS allow-origins list from environment
_default_origins = [
    "http://localhost:3000",
    "http://frontend:3000",
    "http://localhost:8000",
]

_extra_origins = os.environ.get("PRIVATEAI_CORS_ORIGINS", "")
if _extra_origins:
    _default_origins.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(vault.router)
app.include_router(cost.router)
app.include_router(deployments.router)
app.include_router(open_webui.router)
app.include_router(providers.router)
app.include_router(services.router)
app.include_router(terminal.router)


# ── Lifecycle events ───────────────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup() -> None:
    from app.services.cost_monitor import get_cost_monitor

    logger.info("[startup] starting cost monitor...")
    get_cost_monitor().start()

    # In hosted mode, Open WebUI runs externally (Docker Compose).
    # We do NOT spawn it here — we just health-check it.
    logger.info("[startup] hosted mode: Open WebUI expected at %s", os.environ.get("OPEN_WEBUI_URL", "http://localhost:8080"))


@app.on_event("shutdown")
async def _shutdown() -> None:
    from app.services.cost_monitor import get_cost_monitor
    from app.services.ssh_tunnel import get_tunnel_manager

    get_cost_monitor().stop()
    get_tunnel_manager().stop_all()


# ── Root endpoints ───────────────────────────────────────────────────────────────────


@app.get("/")
async def root():
    return {
        "message": "PrivateAI Backend is running (hosted demo mode)",
        "version": "0.3.0-hosted",
        "docs": "/docs",
        "privacy": "/privacy",
    }


@app.get("/health")
async def health():
    from app.providers.registry import is_test_mode

    return {"status": "healthy", "test_mode": is_test_mode(), "mode": "hosted"}


@app.get("/privacy")
async def privacy():
    """Transparency endpoint: what data the server stores and what it cannot access."""
    return {
        "data_retention": {
            "deployments": "Metadata only (region, vm_size, ip). No credentials. 7-day TTL.",
            "credentials": "NEVER stored in plaintext. Only client-side encrypted blobs.",
            "chat_logs": "NEVER stored on this server. Chat data lives on YOUR VM only.",
            "ssh_keys": "NEVER stored. Private keys stay in your browser.",
            "user_accounts": "Username + bcrypt password hash only.",
        },
        "encryption": {
            "vault": "AES-256-GCM, client-side (server cannot decrypt)",
            "transit": "TLS 1.3",
            "storage": "Encrypted at rest (LUKS on VPS)",
        },
        "what_we_know": [
            "Your username (self-chosen, no email required)",
            "That someone deployed a VM in a given region",
            "We do NOT know: your Azure credentials, SSH keys, chat content, file contents",
        ],
        "what_we_cannot_do": [
            "Read your encrypted vault (we don't have the key)",
            "Access your VMs (we don't have your SSH private key)",
            "Read your conversations (they never touch our server)",
            "Charge your Azure account (credentials never stored)",
        ],
        "self_host_option": "Full source code available at https://github.com/Aheadz/PrivateAI",
    }
