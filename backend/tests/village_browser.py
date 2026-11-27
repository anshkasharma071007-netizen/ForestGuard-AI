"""Run the shared-village browser workflow against an isolated PostgreSQL test schema."""

import os
import secrets
import subprocess
import sys
import tempfile
import threading
from contextlib import ExitStack
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from time import monotonic, sleep
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from backend.tests.report_workflow import MobileWebHandler


def run():
    url = make_url(os.environ["WORKFLOW_TEST_DATABASE_URL"])
    if url.get_backend_name() != "postgresql" or "test" not in (url.database or ""):
        raise ValueError("Use a dedicated PostgreSQL test database.")
    schema = f"village_browser_{uuid4().hex}"
    owner = create_engine(url)
    authority_origin = "http://127.0.0.1:18865"
    mobile_origin = "http://127.0.0.1:18866"
    with ExitStack() as cleanup:
        cleanup.callback(owner.dispose)
        with owner.begin() as db:
            db.execute(CreateSchema(schema))

        def drop_schema():
            with owner.begin() as db:
                db.execute(DropSchema(schema, cascade=True))

        cleanup.callback(drop_schema)
        temp = Path(cleanup.enter_context(tempfile.TemporaryDirectory()))
        secret = secrets.token_urlsafe(24)
        os.environ.update(
            DATABASE_URL=url.render_as_string(hide_password=False), PGOPTIONS=f"-c search_path={schema}",
            UPLOAD_DIR=str(temp / "uploads"), APP_ENV="development", SECRET_KEY=secret,
            DEMO_MODE="false", DEMO_VILLAGES_ENABLED="true", SEED_ON_START="false", AI_MODE="demo",
            AUTHORITY_DEMO_ACCOUNTS_ENABLED="false", CITIZEN_DEV_OTP_ENABLED="true", CORS_ORIGINS=mobile_origin,
        )
        from alembic import command
        from alembic.config import Config
        from uvicorn import Config as ServerConfig, Server

        from backend.api.deps import hash_password
        from backend.database.session import SessionLocal, engine
        from backend.main import WebsiteFiles, app
        from backend.models import User

        cleanup.callback(engine.dispose)
        command.upgrade(Config("alembic.ini"), "head")
        with SessionLocal.begin() as db:
            db.add(User(name="Browser reviewer", email="reviewer@example.invalid", role="admin",
                        password_hash=hash_password(secret)))
        website = temp / "website"
        mobile = temp / "mobile"
        subprocess.run(["npm", "--prefix", "frontend", "run", "build", "--", "--outDir", str(website)],
                       env={**os.environ, "VITE_API_BASE_URL": authority_origin}, check=True)
        subprocess.run(["npm", "--prefix", "mobile", "run", "build:web", "--", "--output-dir", str(mobile)],
                       env={**os.environ, "EXPO_PUBLIC_API_URL": authority_origin, "EXPO_NO_TELEMETRY": "1"}, check=True)
        app.router.routes[:] = [route for route in app.routes if getattr(route, "name", None) != "frontend"]
        app.mount("/", WebsiteFiles(directory=website, html=True), name="village-browser-frontend")
        server = Server(ServerConfig(app, host="127.0.0.1", port=18865, log_level="warning"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()

        def stop_server():
            server.should_exit = True
            thread.join(10)

        cleanup.callback(stop_server)
        deadline = monotonic() + 10
        while not server.started:
            if not thread.is_alive() or monotonic() > deadline:
                raise RuntimeError("Test API failed to start.")
            sleep(0.05)
        mobile_server = ThreadingHTTPServer(("127.0.0.1", 18866), partial(MobileWebHandler, directory=mobile))
        cleanup.callback(mobile_server.server_close)
        threading.Thread(target=mobile_server.serve_forever, daemon=True).start()
        cleanup.callback(mobile_server.shutdown)
        subprocess.run(["node", "frontend/scripts/test_village_workflow.mjs"], check=True, env={
            **os.environ, "WORKFLOW_AUTHORITY": authority_origin, "WORKFLOW_MOBILE": mobile_origin,
            "WORKFLOW_PASSWORD": secret, "WORKFLOW_PYTHON": sys.executable,
        })


if __name__ == "__main__":
    run()
