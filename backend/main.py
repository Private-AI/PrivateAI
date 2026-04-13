"""PrivateAI Backend — FastAPI application entry point.

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import deployments, providers, services, terminal

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://frontend:3000",  # Docker compose
        "http://localhost:8000",  # Swagger UI
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────

app.include_router(deployments.router)
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
