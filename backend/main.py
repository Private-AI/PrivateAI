"""PrivateAI Backend — FastAPI application entry point.

Run with:
    uvicorn main:app --host 127.0.0.1 --port 8000
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    azure_cli,
    cost,
    deployments,
    open_webui,
    providers,
    services,
    terminal,
)

# ── Logging ───────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)

# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="PrivateAI Backend",
    version="0.2.0",
    description=(
        "Multi-cloud GPU VM provisioning API. "
        "Deploy private AI infrastructure on Azure (with GCP and AWS coming)."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────


def _cors_allow_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:3000",  # Next.js dev server
        "http://frontend:3000",  # Docker compose
        "http://localhost:8000",  # Swagger UI
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────

app.include_router(azure_cli.router)
app.include_router(cost.router)
app.include_router(deployments.router)
app.include_router(open_webui.router)
app.include_router(providers.router)
app.include_router(services.router)
app.include_router(terminal.router)


# ── Lifecycle events ──────────────────────────────────────────────────


@app.on_event("startup")
async def _startup() -> None:
    import asyncio
    from app.services.cost_monitor import get_cost_monitor
    from app.services.open_webui_manager import get_open_webui_manager

    get_cost_monitor().start()
    manager = get_open_webui_manager()
    manager.start_health_loop()
    # Start Open WebUI in the background so it's ready before first user click
    asyncio.create_task(_start_open_webui(manager))


async def _start_open_webui(manager) -> None:
    import logging
    from app.services.deployment_store import get_store

    log = logging.getLogger(__name__)
    state = await manager.start()
    if state.status == "running":
        log.info("Open WebUI ready at %s", state.url)
        # Reconnect tunnel for the most recent running deployment
        store = get_store()
        running = [d for d in store.list_all() if d.status == "running" and d.public_ip]
        if running:
            latest = max(running, key=lambda d: d.updated_at)
            ssh_key = latest.config.provider_options.get("ssh_key_path", "~/.ssh/id_ed25519")
            vm_user = latest.provider_metadata.get("vm_user", "azureuser")
            ollama_url = f"http://{latest.public_ip}:11434"
            try:
                state = await manager.connect_to_deployment(
                    deployment_id=latest.id,
                    deployment_name=latest.config.vm_name,
                    ollama_url=ollama_url,
                    ssh_key_path=ssh_key,
                    vm_user=vm_user,
                )
                log.info(
                    "Auto-reconnected deployment %s via %s",
                    latest.id[:8],
                    state.config.ollama_base_urls,
                )
            except Exception as e:
                log.warning("Auto-reconnect tunnel failed: %s", e)
    else:
        log.warning("Open WebUI failed to start at startup: %s", state.error)


@app.on_event("shutdown")
async def _shutdown() -> None:
    from app.services.azure_cli_auth import get_cli_auth_manager
    from app.services.cost_monitor import get_cost_monitor
    from app.services.open_webui_manager import get_open_webui_manager
    from app.services.ssh_tunnel import get_tunnel_manager

    get_cost_monitor().stop()

    manager = get_open_webui_manager()
    manager.stop_health_loop()
    await manager.stop()

    get_tunnel_manager().stop_all()

    # Clean up any in-flight Azure CLI device-code sessions
    get_cli_auth_manager().shutdown()


# ── Root endpoints ────────────────────────────────────────────────────


@app.get("/")
async def root():
    return {
        "message": "PrivateAI Backend is running",
        "version": "0.2.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    from app.providers.registry import is_test_mode

    return {"status": "healthy", "test_mode": is_test_mode()}
