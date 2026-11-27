from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from backend import config, main
from backend.api.deps import hash_password, verify_password
from backend.database.session import Base, create_database_engine, get_db
from backend.models import User
from backend.services import report_analysis
from backend.services.authority_demo import provision_authority_demo_accounts

ACCOUNTS = {
    "admin": {"name": "Range Officer", "email": "admin@forestguard.ai", "password": "Admin@123"},
    "guard": {"name": "Forest Guard", "email": "guard@forestguard.ai", "password": "Guard@123"},
}


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


def test_authority_demo_startup_and_real_login(authority_db, monkeypatch):
    with authority_db() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
    with TestClient(main.app) as client:
        options = client.get("/api/auth/demo-accounts")
        assert options.json() == ACCOUNTS
        assert options.headers["Cache-Control"] == "private, no-store"
        with authority_db() as db:
            for table in Base.metadata.sorted_tables:
                if table is not User.__table__:
                    assert db.scalar(select(func.count()).select_from(table)) == 0, table.name
            users = {user.role: user for user in db.scalars(select(User))}
            assert set(users) == set(ACCOUNTS)
            for role, user in users.items():
                assert user.name == ACCOUNTS[role]["name"]
                assert user.password_hash != ACCOUNTS[role]["password"]
                assert verify_password(ACCOUNTS[role]["password"], user.password_hash)
        with authority_db() as db:
            assert provision_authority_demo_accounts(db) == dict.fromkeys(ACCOUNTS, "already provisioned")
            assert db.scalar(select(func.count()).select_from(User)) == 2

        headers = {}
        for role, account in ACCOUNTS.items():
            payload = {"email": account["email"], "password": account["password"]}
            assert client.post("/api/auth/login", json={**payload, "password": "incorrect"}).status_code == 401
            response = client.post("/api/auth/login", json=payload)
            assert response.status_code == 200
            headers[role] = {"Authorization": f"Bearer {response.json()['token']}"}
            me = client.get("/api/auth/me", headers=headers[role])
            assert me.json()["user"]["role"] == role
            assert client.get("/api/guard/dashboard", headers=headers[role]).status_code == 200
        assert client.post("/api/risk/config/reset", headers=headers["guard"]).status_code == 403
        assert client.post("/api/risk/config/reset", headers=headers["admin"]).status_code == 200

        for app_env, flag in (("development", False), ("production", True)):
            monkeypatch.setattr(config, "APP_ENV", app_env)
            monkeypatch.setattr(config, "AUTHORITY_DEMO_ACCOUNTS_ENABLED", flag)
            assert client.get("/api/auth/demo-accounts").json() == {}
            for role, account in ACCOUNTS.items():
                payload = {"email": account["email"], "password": account["password"]}
                assert client.post("/api/auth/login", json=payload).status_code == 401
                assert client.get("/api/auth/me", headers=headers[role]).status_code == 401


@pytest.mark.parametrize(("app_env", "flag"), [("development", False), ("production", True)])
def test_provisioning_requires_both_settings(authority_db, monkeypatch, app_env, flag):
    monkeypatch.setattr(config, "APP_ENV", app_env)
    monkeypatch.setattr(config, "AUTHORITY_DEMO_ACCOUNTS_ENABLED", flag)
    with authority_db() as db:
        assert provision_authority_demo_accounts(db) == {}
        assert db.scalar(select(func.count()).select_from(User)) == 0


def test_provisioning_preserves_existing_account(authority_db):
    existing_password = "An existing local password"
    original_hash = hash_password(existing_password)
    email = ACCOUNTS["admin"]["email"]
    with authority_db.begin() as db:
        db.add(User(email=email, name="Existing officer", role="admin", password_hash=original_hash))

    with TestClient(main.app) as client:
        assert client.get("/api/auth/demo-accounts").json() == {"guard": ACCOUNTS["guard"]}
        assert client.post("/api/auth/login", json={"email": email, "password": existing_password}).status_code == 200
        assert client.post("/api/auth/login", json={"email": email, "password": ACCOUNTS["admin"]["password"]}).status_code == 401
    with authority_db() as db:
        saved = db.scalar(select(User).where(User.email == email))
        assert (saved.name, saved.role, saved.password_hash) == ("Existing officer", "admin", original_hash)
