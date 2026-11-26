import os
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from backend.api.routes_citizen import get_db
from backend.main import app
from backend.models.entities import Citizen, SightingReport, utcnow


def test_revision_preserves_accounts_and_report_ownership(tmp_path, monkeypatch):
    postgres = os.getenv("FOREST_GUARD_TEST_POSTGRES_URL")
    owner = create_engine(postgres) if postgres else None
    schema = f"fg_migration_{uuid4().hex}"
    if owner:
        with owner.begin() as connection:
            connection.execute(CreateSchema(schema))
        url = make_url(postgres).update_query_dict({"options": f"-csearch_path={schema}"})
    else:
        url = f"sqlite:///{tmp_path / 'migration.db'}"
    engine = create_engine(url)
    monkeypatch.setattr("backend.config.APP_ENV", "development")
    monkeypatch.setattr("backend.config.CITIZEN_DEV_OTP_ENABLED", True)

    def test_db():
        with Session(engine) as db:
            yield db

    try:
        cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, "0003")
        historical = ["9876500991", "+91 9876500992", "+919876500992", "+12025550141"]
        with engine.begin() as conn:
            for index, phone in enumerate(historical, start=1):
                conn.execute(text("INSERT INTO citizens(id, phone, name, lat, lon) VALUES (:id, :phone, :name, 1, 2)"),
                             {"id": index, "phone": phone, "name": f"Historical citizen {index}"})
            for index in [None, 1, 2, 3, 4]:
                conn.execute(text("""INSERT INTO sighting_reports(reference_code, citizen_id, category, species,
                    description, reporter_name, status, created_at, is_simulated)
                    VALUES (:reference, :citizen, 'sighting', 'unidentified', 'Historical report',
                    'Historical observer', 'pending', :created, false)"""),
                             {"reference": f"FG-HIST-{index}", "citizen": index, "created": utcnow().isoformat(sep=" ")})
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, "head")

        with Session(engine) as db:
            assert db.get(Citizen, 1).phone == "+919876500991"
            assert [db.get(Citizen, index).phone for index in (2, 3, 4)] == historical[1:]
            assert {report.reference_code: report.citizen_id for report in db.query(SightingReport)} == {
                f"FG-HIST-{index}": index for index in [None, 1, 2, 3, 4]
            }

        monkeypatch.setitem(app.dependency_overrides, get_db, test_db)
        client = TestClient(app)
        try:
            returning = client.post("/api/citizen/verify", json={"phone": "9876500991", "code": "1234"})
            assert returning.status_code == 200
            assert returning.json()["profile"]["id"] == 1
            headers = {"Authorization": f"Bearer {returning.json()['token']}"}
            reports = client.get("/api/citizen/reports", headers=headers).json()["items"]
            assert [report["reference_code"] for report in reports] == ["FG-HIST-1"]
            conflict = client.post("/api/citizen/verify", json={"phone": "9876500992", "code": "1234", "name": "New account"})
            assert conflict.status_code == 409
        finally:
            client.close()
    finally:
        engine.dispose()
        if owner:
            with owner.begin() as conn:
                conn.execute(DropSchema(schema, cascade=True))
            owner.dispose()
