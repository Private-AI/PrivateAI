"""PrivateAI Backend — FastAPI application entry point.

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager

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

log = logging.getLogger(__name__)


# ── Background helpers ────────────────────────────────────────────────


def _start_open_webui_thread(manager) -> None:
    """Run in a daemon thread with its own event loop — no tasks on the uvicorn loop."""
    import asyncio as _asyncio

    async def _run():
        from app.services.deployment_store import get_store

        try:
            state = await manager.start()
            if state.status == "running":
                log.info("Open WebUI ready at %s", state.url)
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
                log.info("Open WebUI not started at boot: %s", state.error or state.status)
        except Exception:
            log.exception("Background Open WebUI startup failed")

    _asyncio.run(_run())


# ── Lifespan ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from app.providers.registry import is_test_mode
    from app.services.cost_monitor import get_cost_monitor
    from app.services.open_webui_manager import get_open_webui_manager

    cost_monitor = get_cost_monitor()
    manager = get_open_webui_manager()

    loop = asyncio.get_event_loop()

    # Start all background work as daemon threads — avoids blocking uvicorn
    # 0.46 startup, which hangs when asyncio/anyio tasks are created during
    # the lifespan coroutine before the yield.
    cost_monitor.start(loop)
    manager.start_health_loop()

    if not is_test_mode():
        import threading as _threading
        _threading.Thread(
            target=_start_open_webui_thread,
            args=(manager,),
            daemon=True,
            name="owui-start",
        ).start()

    yield  # server runs here

    # ── Shutdown ──────────────────────────────────────────────
    try:
        from app.services.azure_cli_auth import get_cli_auth_manager
        from app.services.ssh_tunnel import get_tunnel_manager

        cost_monitor.stop()
        manager.stop_health_loop()
        await manager.stop()
        get_tunnel_manager().stop_all()
        get_cli_auth_manager().shutdown()
    except Exception:
        log.exception("Error during shutdown")


# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="PrivateAI Backend",
    version="0.2.0",
    description=(
        "Multi-cloud GPU VM provisioning API. "
        "Deploy private AI infrastructure on Azure (with GCP and AWS coming)."
    ),
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────

_default_origins = [
    "http://localhost:3000",
    "http://frontend:3000",
    "http://localhost:8000",
]
_extra = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
