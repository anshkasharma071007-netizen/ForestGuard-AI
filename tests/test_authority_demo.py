from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from backend import config, main
from backend.api.deps import hash_password
from backend.database.session import create_database_engine, get_db
from backend.models import User
from backend.services import report_analysis
from tools.provision_greater_noida import EMAIL, NAME, provision

@pytest.fixture
def authority_db(tmp_path, monkeypatch):
    engine = create_database_engine(f"sqlite:///{tmp_path / 'authority.db'}")
    sessions = sessionmaker(engine)
    with engine.begin() as conn:
        alembic = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        alembic.attributes["connection"] = conn
        command.upgrade(alembic, "head")

    def get_test_db():
        with sessions() as db:
            yield db

    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "AUTHORITY_DEMO_ACCOUNTS_ENABLED", True)
    monkeypatch.setattr(config, "DEMO_MODE", False)
    monkeypatch.setenv("SEED_ON_START", "false")
    monkeypatch.setattr(main, "SessionLocal", sessions)
    monkeypatch.setattr(report_analysis, "run_worker", lambda stop: None)
    monkeypatch.setitem(main.app.dependency_overrides, get_db, get_test_db)
    yield sessions
    engine.dispose()


def test_only_greater_noida_officer_is_offered(authority_db, monkeypatch):
    with TestClient(main.app) as client:
        assert client.get("/api/auth/demo-accounts").json() == {"enabled": True, "accounts": {}}
        assert client.post("/api/auth/demo-login").status_code == 404
        with authority_db.begin() as db:
            assert db.scalars(select(User)).all() == []
            provision(db, "Private development password")
        options = client.get("/api/auth/demo-accounts")
        assert options.json() == {"enabled": True, "accounts": {"range_officer": {"name": "Range Officer"}}}
        assert options.headers["Cache-Control"] == "private, no-store"
        response = client.post("/api/auth/demo-login")
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "private, no-store"
        user = response.json()["user"]
        assert user["email"] == EMAIL and user["role"] == "range_officer"
        assert [item["name"] for item in user["jurisdictions"]] == [NAME]
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        assert client.get("/api/auth/me", headers=headers).status_code == 200
        assert client.post("/api/risk/config/reset", headers=headers).status_code == 403

        for app_env, flag in (("development", False), ("production", True)):
            monkeypatch.setattr(config, "APP_ENV", app_env)
            monkeypatch.setattr(config, "AUTHORITY_DEMO_ACCOUNTS_ENABLED", flag)
            assert client.get("/api/auth/demo-accounts").json() == {"enabled": False, "accounts": {}}
            assert client.post("/api/auth/demo-login").status_code == 404
            assert client.get("/api/auth/me", headers=headers).status_code == 401
        assert client.post("/api/auth/login", json={"email": EMAIL, "password": "Private development password"}).status_code == 401


def test_demo_requires_exact_assignment_and_preserves_other_users(authority_db):
    from backend.models.entities import AuthorityJurisdiction, Jurisdiction

    password = "Existing administrator password"
    original_hash = hash_password(password)
    with authority_db.begin() as db:
        db.add(User(email="admin@forestguard.ai", name="Existing officer", role="admin", password_hash=original_hash))
        provision(db, "Private development password")
        officer = db.scalar(select(User).where(User.email == EMAIL))
        extra = Jurisdiction(name="Other jurisdiction", boundary={"type": "Polygon", "coordinates": []})
        db.add(extra)
        db.flush()
        db.add(AuthorityJurisdiction(user_id=officer.id, jurisdiction_id=extra.id))

    with TestClient(main.app) as client:
        assert client.get("/api/auth/demo-accounts").json()["accounts"] == {}
        assert client.post("/api/auth/demo-login").status_code == 404
        assert client.post("/api/auth/login", json={"email": "admin@forestguard.ai", "password": password}).status_code == 200
    with authority_db() as db:
        saved = db.scalar(select(User).where(User.email == "admin@forestguard.ai"))
        assert (saved.name, saved.role, saved.password_hash) == ("Existing officer", "admin", original_hash)
