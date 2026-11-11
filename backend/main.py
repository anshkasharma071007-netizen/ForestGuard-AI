from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.api import (
    routes_alerts,
    routes_auth,
    routes_community,
    routes_core,
    routes_guard,
    routes_risk,
)
from backend.database.session import SessionLocal, init_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("forest-guard-ai")


def _seed_if_needed() -> dict:
    from backend.services.seed import seed_database

    db = SessionLocal()
    try:
        result = seed_database(db)
        if result.get("seeded"):
            logger.info("Demo dataset seeded: %s", result.get("counts"))
        else:
            logger.info("Seed skipped: %s", result.get("reason"))
        return result
    except Exception as exc:  # keep the API bootable even if seeding fails
        logger.exception("Demo seeding failed: %s", exc)
        return {"seeded": False, "error": str(exc)}
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.seed_result = None
    if os.getenv("SEED_ON_START", "true").strip().lower() in {"1", "true", "yes", "on"}:
        app.state.seed_result = _seed_if_needed()
    yield


app = FastAPI(
    title="Forest Guard AI",
    description=(
        "AI-assisted wildlife monitoring, GIS risk mapping and human–wildlife conflict "
        "prevention. Demonstration data is synthetic and clearly labelled."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_auth.router)
app.include_router(routes_core.router)
app.include_router(routes_risk.router)
app.include_router(routes_alerts.router)
app.include_router(routes_guard.router)
app.include_router(routes_community.router)

app.mount("/media", StaticFiles(directory=config.UPLOAD_DIR), name="media")

frontend_dir = os.path.join(config.ROOT, "frontend", "dist")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.get("/api")
def api_root() -> dict:
    return {
        "project": "Forest Guard AI",
        "tagline": "Protecting Forests. Preventing Conflict. Saving Lives.",
        "docs": "/docs",
        "health": "/api/health",
        "demo_mode": config.DEMO_MODE,
    }
