import csv
import json
import math
import os
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from backend import config
from backend.api.deps import create_token
from backend.database.session import create_database_engine, get_db
from backend.main import app
from backend.models import Alert, Detection, Incident, SightingReport, User, Village, utcnow
from backend.services import incident_lifecycle
from backend.services.serializers import serialize_detection


@pytest.fixture
def empty_village_api(tmp_path, monkeypatch):
    postgres = os.getenv("FOREST_GUARD_TEST_POSTGRES_URL")
    schema = f"fg_empty_{uuid4().hex}"
    owner = create_engine(postgres) if postgres else None
    url = make_url(postgres).update_query_dict({"options": f"-csearch_path={schema}"}) if postgres else (
        f"sqlite:///{tmp_path / 'empty.db'}"
    )
    engine = create_database_engine(url)
    monkeypatch.setenv("SEED_ON_START", "false")
    monkeypatch.setattr(config, "DEMO_MODE", False)
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)

    def database():
        with Session(engine, autoflush=False) as db:
            yield db

    try:
        if owner:
            with owner.begin() as conn:
                conn.execute(CreateSchema(schema))
        with engine.begin() as conn:
            migration = Config("alembic.ini")
            migration.attributes["connection"] = conn
            command.upgrade(migration, "head")
        with Session(engine) as db, db.begin():
            authority = User(name="Regression reviewer", email="reviewer@example.invalid", role="admin", password_hash="unused")
            db.add(authority)
            db.flush()
            headers = {"Authorization": "Bearer " + create_token(authority)}
        monkeypatch.setitem(app.dependency_overrides, get_db, database)
        # Exercise the real HTTP routes without starting the independent photo worker.
        api = TestClient(app)
        try:
            yield api, engine, headers
        finally:
            api.close()
    finally:
        engine.dispose()
        if owner:
            with owner.begin() as conn:
                conn.execute(DropSchema(schema, cascade=True, if_exists=True))
            owner.dispose()


def test_gps_lifecycle_with_zero_villages(empty_village_api, monkeypatch):
    api, engine, authority = empty_village_api
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Village)) == 0
    verified = api.post("/api/citizen/verify", json={
        "name": "GPS test observer", "phone": "9876500191", "code": "1234",
    })
    assert verified.status_code == 200
    citizen = {"Authorization": "Bearer " + verified.json()["token"]}
    coords = {"lat": 21.76321, "lon": 79.30651}
    assert api.put("/api/citizen/profile", headers=citizen, json={
        "name": "GPS test observer", "location": coords,
    }).status_code == 200
    receipt = api.post("/api/citizen/reports", headers=citizen, data={
        "title": "GPS sighting", "category": "sighting", "species": "elephant",
        "submission_key": str(uuid4()), **coords,
    })
    assert receipt.status_code == 201
    code = receipt.json()["reference_code"]
    with Session(engine) as db:
        report_id = db.scalar(select(SightingReport.id).where(SightingReport.reference_code == code))
    report_path = f"/api/reports/{report_id}"
    citizen_path = f"/api/citizen/reports/{code}"

    def approve():
        return api.patch(report_path, headers=authority, json={"status": "verified"})

    def fail_after_alert(*args, **kwargs):
        publish(*args, **kwargs)
        raise RuntimeError("Test rollback after alert flush")

    publish = incident_lifecycle.maybe_create_alert
    with monkeypatch.context() as patch:
        patch.setattr(incident_lifecycle, "maybe_create_alert", fail_after_alert)
        with pytest.raises(RuntimeError, match="Test rollback after alert flush"):
            approve()
    assert api.get(citizen_path, headers=citizen).json()["lifecycle_status"] == "pending"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Incident)) == 0
        assert db.scalar(select(func.count()).select_from(Alert)) == 0

    response = approve()
    assert response.status_code == 200, response.text
    report = response.json()["report"]
    incident_id = report["incident_id"]
    assert approve().json()["report"]["incident_id"] == incident_id
    assert api.get(citizen_path, headers=citizen).json()["lifecycle_status"] == "under_work"
    public = api.get("/api/community/alerts?field_only=true&verified_only=true").json()["items"]
    assert len(public) == 1
    assert public[0]["approximate_locations"] == [{"lat": 21.8, "lon": 79.3}]
    assert public[0]["village_names"] == []

    with Session(engine) as db, db.begin():
        # Legacy detections could retain the sentinel in a Float column even on PostgreSQL.
        detection = Detection(species="elephant", confidence=0.9, observed_distance_km=float("inf"),
                              detected_at=utcnow(), is_simulated=False, **coords)
        db.add(detection)
        db.flush()
        detection_id = detection.id
        assert serialize_detection(detection)["distance_km"] is None
    exported = api.get("/api/analytics/export", headers=authority)
    assert exported.status_code == 200
    assert next(csv.DictReader(exported.text.splitlines()))["distance_km"] == ""
    rescored = api.post("/api/risk/recalculate", headers=authority)
    assert rescored.status_code == 200, rescored.text
    assert rescored.json()["summary"]["detections_scored"] == 1
    assert rescored.json()["summary"]["report_incidents_scored"] == 1
    detection_detail = api.get(f"/api/detections/{detection_id}", headers=authority).json()
    assert detection_detail["detection"]["distance_km"] is detection_detail["risk"]["distance_km"] is None
    for risk in (report["risk"], api.get(f"/api/incidents/{incident_id}", headers=authority).json()["report"]["risk"]):
        assert risk["distance_km"] is risk["nearest_village_name"] is risk["nearest_village_id"] is None
        assert math.isfinite(risk["score"]) and risk["score"] > 0
        assert next(item for item in risk["components"] if item["key"] == "proximity")["points"] == 0
        json.dumps(risk, allow_nan=False)

    assert api.patch(f"/api/incidents/{incident_id}", headers=authority, json={"status": "resolved"}).status_code == 200
    assert api.get(citizen_path, headers=citizen).json()["lifecycle_status"] == "resolved"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Incident)) == 1
        alert = db.scalars(select(Alert)).one()
        assert alert.incident_id == incident_id and alert.status == "resolved"
        assert db.get(Detection, detection_id).observed_distance_km is None
        assert db.scalar(select(func.count()).select_from(Village)) == 0


def test_demo_villages_share_registry_and_preserve_records(empty_village_api, monkeypatch):
    from backend.models import Camera, Guard
    from backend.models.entities import Citizen
    from backend.services.villages import provision_demo_villages

    api, engine, authority = empty_village_api
    monkeypatch.setattr(config, "DEMO_VILLAGES_ENABLED", False)
    with Session(engine) as db, pytest.raises(ValueError, match="DEMO_VILLAGES_ENABLED=true"):
        provision_demo_villages(db)
    monkeypatch.setattr(config, "DEMO_VILLAGES_ENABLED", True)
    with monkeypatch.context() as patch, Session(engine) as db:
        patch.setattr(config, "APP_ENV", "production")
        with pytest.raises(ValueError, match="APP_ENV=development"):
            provision_demo_villages(db)

    verification = api.post("/api/citizen/verify", json={
        "name": "Village test observer", "phone": "9876500192", "code": "1234",
    }).json()
    citizen = {"Authorization": "Bearer " + verification["token"]}
    gps = {"lat": 21.735, "lon": 79.35}
    assert api.put("/api/citizen/profile", headers=citizen, json={
        "name": "Village test observer", "location": gps,
    }).status_code == 200
    form = {"title": "Before villages", "category": "sighting", "submission_key": str(uuid4())}
    before = api.post("/api/citizen/reports", headers=citizen, data={**form, **gps}).json()

    with Session(engine) as db:
        assert set(provision_demo_villages(db).values()) == {"created"}
        assert set(provision_demo_villages(db).values()) == {"already provisioned"}

    public = api.get("/api/community/villages").json()["items"]
    official = api.get("/api/villages", headers=authority).json()["items"]
    expected = {"V001", "V002", "V003", "V004", "V005"}
    assert {v["code"] for v in public} == expected
    keys = ("id", "code", "name", "is_demo", "lat", "lon")
    def identity(items):
        return {tuple(v[key] for key in keys) for v in items}

    assert identity(public) == identity(official)
    assert all(v["is_demo"] and v["name"].endswith("(Demo)") for v in public)
    layers = api.get("/api/map/layers?operational=true", headers=authority).json()
    assert identity(layers["villages"]) == identity(public)
    assert not layers["incidents"]
    assert all(f["properties"]["layer"] != "village" for f in layers["study_area"]["features"])

    report_path = f"/api/citizen/reports/{before['reference_code']}"
    assert api.get(report_path, headers=citizen).json()["village_id"] is None
    assert api.get("/api/citizen/profile", headers=citizen).json()["location"]["type"] == "gps"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Citizen)) == 1
        assert db.scalar(select(func.count()).select_from(SightingReport)) == 1
        for model in (Incident, Alert, Detection, Camera, Guard):
            assert db.scalar(select(func.count()).select_from(model)) == 0

    chosen = next(v for v in public if v["code"] == "V002")
    changed = api.put("/api/citizen/profile", headers=citizen, json={
        "name": "Village test observer", "location": {"village_id": chosen["id"]},
    }).json()["location"]
    assert changed["village"]["id"] == chosen["id"]
    assert (changed["lat"], changed["lon"]) == (chosen["lat"], chosen["lon"])
    assert api.post("/api/citizen/reports", headers=citizen, data=form).status_code == 400
    submitted = api.post("/api/citizen/reports", headers=citizen, data={
        "title": "Separate incident location", "category": "sighting",
        "submission_key": str(uuid4()), "village_id": next(v["id"] for v in public if v["code"] == "V003"),
    })
    assert submitted.status_code == 201
    report = next(r for r in api.get("/api/reports", headers=authority).json()["items"]
                  if r["reference_code"] == submitted.json()["reference_code"])
    assert report["village_name"] == "Haritgaon (Demo)" and report["village_id"] != chosen["id"]
    approved = api.patch(f"/api/reports/{report['id']}", headers=authority, json={"status": "verified"})
    assert approved.status_code == 200
    risk = approved.json()["report"]["risk"]
    assert risk["distance_km"] == 0 and risk["nearest_village_id"] == report["village_id"]
    assert math.isfinite(risk["score"])
    advisories = api.get("/api/community/alerts", params={
        "village_id": report["village_id"], "verified_only": True, "field_only": True,
    }).json()["items"]
    assert len(advisories) == 1
    assert advisories[0]["village_ids"] == [report["village_id"]] and advisories[0]["has_demo_geography"]


def test_demo_villages_preserve_conflicting_genuine_metadata(empty_village_api, monkeypatch):
    from backend.services.villages import provision_demo_villages

    _, engine, _ = empty_village_api
    monkeypatch.setattr(config, "DEMO_VILLAGES_ENABLED", True)
    with Session(engine) as db, db.begin():
        existing = Village(code="V001", name="Existing village", lat=21.7, lon=79.3, boundary_geojson={})
        db.add(existing)
        db.flush()
        existing_id = existing.id
    with Session(engine) as db:
        results = provision_demo_villages(db)
        assert results["V001"] == "existing code preserved"
        assert list(results.values()).count("created") == 4
        assert db.get(Village, existing_id).name == "Existing village"
