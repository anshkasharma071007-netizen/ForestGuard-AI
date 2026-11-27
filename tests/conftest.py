from __future__ import annotations

import os
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

_temp = tempfile.TemporaryDirectory(prefix="forest-guard-tests-")
_TEST_DIR = Path(_temp.name)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TEST_DIR / 'test.db').as_posix()}"
# The optional PG run creates its own schema with no public search-path fallback.
_pg_url = os.environ.get("FOREST_GUARD_TEST_POSTGRES_URL")
_schema = f"fg_test_{uuid4().hex}"
if _pg_url:
    url = make_url(_pg_url)
    if url.get_backend_name() != "postgresql":
        raise ValueError("FOREST_GUARD_TEST_POSTGRES_URL must select PostgreSQL")
    os.environ["DATABASE_URL"] = url.update_query_dict(
        {"options": f"-csearch_path={_schema}"}
    ).render_as_string(hide_password=False)
os.environ["UPLOAD_DIR"] = str(_TEST_DIR / "uploads")
os.environ["AI_MODE"] = "demo"
os.environ["SEED_ON_START"] = "true"
os.environ["DEMO_MODE"] = "true"
os.environ["APP_ENV"] = "development"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from backend.database.session import engine

    owner = create_engine(_pg_url) if _pg_url else None
    if owner:
        with owner.begin() as conn:
            conn.execute(CreateSchema(_schema))
    try:
        with engine.begin() as conn:
            if owner:
                assert conn.exec_driver_sql("SELECT current_schema()").scalar_one() == _schema
            cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, "head")
        with TestClient(app) as test_client:
            yield test_client
    finally:
        engine.dispose()
        if owner:
            with owner.begin() as conn:
                conn.execute(DropSchema(_schema, cascade=True))
            owner.dispose()


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, "admin@forestguard.ai", "forest123")


@pytest.fixture(scope="session")
def guard_headers(client):
    return _login(client, "guard@forestguard.ai", "guard123")
