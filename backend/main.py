from __future__ import annotations

import logging
import os
from threading import Event, Thread
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.api import (
    routes_alerts,
    routes_auth,
    routes_citizen,
    routes_community,
    routes_core,
    routes_guard,
    routes_jurisdictions,
    routes_locations,
    routes_operations,
    routes_push,
    routes_risk,
)
from backend.database.session import SessionLocal, validate_runtime_database
from backend.services.media import validate_settings

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
    config.validate_authority_secret()
    validate_settings()
    with SessionLocal() as db:
        validate_runtime_database(db)
    app.state.seed_result = None
    if (config.DB_MODE == "local" and config.DEMO_MODE
            and os.getenv("SEED_ON_START", "false").strip().lower() in {"1", "true", "yes", "on"}):
        app.state.seed_result = _seed_if_needed()
    from backend.services.report_analysis import run_worker
    stop = Event()
    worker = Thread(target=run_worker, args=(stop,), daemon=True, name="report-analysis")
    workers = [worker]
    if config.EXPO_PUSH_ENABLED:
        from backend.services.citizen_push import run_worker as run_push_worker

        workers.append(Thread(target=run_push_worker, args=(stop,), daemon=True, name="citizen-push"))
    for worker in workers:
        worker.start()
    try:
        yield
    finally:
        stop.set()
        for worker in workers:
            worker.join(timeout=3)


app = FastAPI(
    title="Van Saathi",
    description=(
        "AI-assisted wildlife monitoring, GIS risk mapping and human–wildlife conflict "
        "prevention. Demonstration data is synthetic and clearly labelled."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_citizen_responses(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/citizen/"):
        response.headers["Cache-Control"] = "private, no-store"
    return response


app.include_router(routes_auth.router)
app.include_router(routes_core.router)
app.include_router(routes_risk.router)
app.include_router(routes_alerts.router)
app.include_router(routes_guard.router)
app.include_router(routes_jurisdictions.router)
app.include_router(routes_operations.router)
app.include_router(routes_community.router)
app.include_router(routes_citizen.router)
app.include_router(routes_locations.router)
app.include_router(routes_push.router)
app.include_router(routes_community.citizen_router)

class PublicMedia(StaticFiles):
    def lookup_path(self, path):
        full_path, stat = super().lookup_path(path)
        if stat:
            relative = Path(full_path).relative_to(Path(self.directory).resolve())
            if not relative.parts or relative.parts[0] != "demo":
                return "", None
        return full_path, stat


class WebsiteFiles(StaticFiles):
    async def get_response(self, path, scope):
        # These entry points are handled by React Router, including after official sign-in.
        if path in {"dashboard", "reports", "map", "alerts", "settings", "login", "community",
                    "monitoring", "wildlife", "risk", "guard", "analytics"}:
            path = "index.html"
        return await super().get_response(path, scope)


@app.get("/api")
def api_root() -> dict:
    return {
        "project": "Van Saathi",
        "tagline": "Protecting Forests. Preventing Conflict. Saving Lives.",
        "docs": "/docs",
        "health": "/api/health",
        "demo_mode": config.DEMO_MODE,
    }


app.mount("/media", PublicMedia(directory=config.UPLOAD_DIR), name="media")

frontend_dir = os.path.join(config.ROOT, "frontend", "dist")
if os.path.isdir(frontend_dir):
    app.mount("/", WebsiteFiles(directory=frontend_dir, html=True), name="frontend")
