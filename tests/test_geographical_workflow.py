from datetime import timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.api import routes_alerts, routes_citizen, routes_community
from backend.database.session import SessionLocal, create_database_engine, engine, get_db
from backend.models import Alert, Camera, Detection, SightingReport, Village, utcnow
from backend.services import media


def jurisdiction(client, admin, name, west, south, east, north, *, priority=100):
    response = client.post("/api/authority/jurisdictions", headers=admin, json={
        "name": name, "priority": priority, "boundary": {
            "type": "Polygon", "coordinates": [[[west, south], [east, south], [east, north],
                                                [west, north], [west, south]]],
        },
    })
    assert response.status_code == 201, response.text
    return response.json()["id"]


def officer(client, admin, email, ids, role="range_officer"):
    password = "Workflow-test-only123"
    response = client.post("/api/authority/officers", headers=admin, json={
        "name": email.split("@")[0], "email": email, "password": password, "role": role, "jurisdiction_ids": ids,
    })
    assert response.status_code == 201, response.text
    user_id = response.json()["id"]
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return user_id, {"Authorization": f"Bearer {response.json()['token']}"}


def sign_in(client, phone, name=None):
    response = client.post("/api/citizen/verify", json={"phone": phone, "code": "1234", "name": name})
    assert response.status_code == 200, response.text
    data = response.json()
    return data["profile"], {"Authorization": f"Bearer {data['token']}"}


def citizen(client, phone, name, lat, lon):
    _, headers = sign_in(client, phone, name)
    response = client.put("/api/citizen/profile", headers=headers, json={
        "name": name, "email": "reporter@example.com", "location": {"lat": lat, "lon": lon},
    })
    assert response.status_code == 200, response.text
    return headers


def photo():
    stream = BytesIO()
    Image.new("RGB", (12, 12), "white").save(stream, "JPEG")
    return stream.getvalue()


def submit(client, headers, lat, lon, *, image=None, key=None):
    return client.post("/api/citizen/reports", headers=headers, data={
        "title": "Boundary workflow", "lat": lat, "lon": lon, "category": "sighting",
        "species": "tiger", "submission_key": str(key or uuid4()),
    }, files={"image": ("report.jpg", image, "image/jpeg")} if image else None)


def items(response):
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_jurisdiction_review_and_shared_active_discovery(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)
    a = jurisdiction(client, admin_headers, "Workflow Zone A", 81.94, 22.95, 82.04, 23.10)
    b = jurisdiction(client, admin_headers, "Workflow Zone B", 82.04, 22.95, 82.32, 23.10)
    jurisdiction(client, admin_headers, "Workflow overlap", 81.95, 22.96, 82.04, 23.08)
    officer_a_id, officer_a = officer(client, admin_headers, "geo-officer-a@example.com", [a])
    _, officer_b = officer(client, admin_headers, "geo-officer-b@example.com", [b])
    _, guard_a = officer(client, admin_headers, "geo-guard-a@example.com", [a], role="guard")
    citizen_a = citizen(client, "9123456811", "Private Reporter A", 23.0, 82.08)
    citizen_b = citizen(client, "9123456812", "Citizen B", 23.0, 82.08)
    citizen_c = citizen(client, "9123456813", "Citizen C", 23.0, 82.50)

    response = submit(client, citizen_a, 23.0222, 82.04, image=photo())
    assert response.status_code == 201, response.text
    reference = response.json()["reference_code"]
    reports = items(client.get("/api/reports", headers=officer_a))
    report = next(item for item in reports if item["reference_code"] == reference)
    assert report["jurisdiction_id"] == a  # ST_Covers includes the shared edge. Lowest ID wins a priority tie.
    rid = report["id"]
    assert client.get("/api/auth/me", headers=officer_a).json()["user"]["jurisdictions"][0]["id"] == a
    assert client.get("/api/operations/dashboard", headers=officer_a).json()["summary"]["pending"] == 1
    assert client.get("/api/operations/dashboard", headers=officer_b).json()["summary"]["pending"] == 0
    assert items(client.get("/api/reports", headers=officer_b)) == []
    assert items(client.get("/api/reports/notifications", headers=officer_b)) == []
    assert client.get(f"/api/reports/{rid}", headers=officer_b).status_code == 404
    assert client.get(f"/api/reports/{rid}/evidence", headers=officer_b).status_code == 404
    assert client.get(f"/api/reports/{rid}/evidence", headers=officer_a).content == photo()
    assert client.get(f"/api/reports/{rid}/evidence", headers=guard_a).content == photo()
    assert client.get(f"/api/citizen/reports/{reference}/evidence", headers=citizen_b).status_code == 404
    assert client.get(f"/api/community/reports/{reference}").status_code == 404
    assert client.post(f"/api/reports/{rid}/read", headers=officer_b).status_code == 404
    assert client.post(f"/api/reports/{rid}/retry", headers=officer_b).status_code == 404
    assert client.post(f"/api/reports/{rid}/risk-preview", headers=officer_b, json={"confirmed_species": "tiger"}).status_code == 404
    assert client.get("/api/authority/officers", headers=officer_a).status_code == 403
    for unauthorized, code in ((officer_b, 404), (guard_a, 403)):
        assert client.patch(f"/api/reports/{rid}", headers=unauthorized, json={"status": "verified"}).status_code == code

    approval = client.patch(f"/api/reports/{rid}", headers=officer_a, json={"status": "verified"})
    assert approval.status_code == 200, approval.text
    iid = approval.json()["report"]["incident_id"]
    aid = client.get(f"/api/incidents/{iid}", headers=officer_a).json()["alert"]["id"]
    assert client.get(f"/api/incidents/{iid}", headers=officer_b).status_code == 404
    assert client.get(f"/api/alerts/{aid}", headers=officer_b).status_code == 404
    assert client.post(f"/api/alerts/{aid}/respond", headers=officer_b, json={}).status_code == 404
    assert client.post(f"/api/alerts/{aid}/respond", headers=guard_a, json={}).status_code == 200

    with SessionLocal.begin() as db:
        db.get(Alert, aid).created_at = utcnow() - timedelta(days=440)
        db.add_all([
            Detection(species="tiger", confidence=0.95, detected_at=utcnow(), lat=23.01, lon=82.01,
                      notes="Scoped evidence A", is_simulated=False),
            Detection(species="tiger", confidence=0.95, detected_at=utcnow(), lat=23.01, lon=82.09,
                      notes="Scoped evidence B", is_simulated=False),
        ])
    assert client.get("/api/analytics", headers=officer_a).json()["totals"]["incidents"] == 1
    assert client.get("/api/analytics", headers=officer_b).json()["totals"]["incidents"] == 0
    export = client.get("/api/analytics/export", headers=officer_b).text
    assert ",82.09," in export and ",82.01," not in export
    assert client.get("/api/map/layers?operational=true", headers=officer_b).json()["incidents"] == []

    outside = submit(client, citizen_a, 25.125, 84.115)
    assert outside.status_code == 201, outside.text
    outside_ref = outside.json()["reference_code"]
    central = items(client.get("/api/reports?unassigned_only=true", headers=admin_headers))
    outside_id = next(item["id"] for item in central if item["reference_code"] == outside_ref)
    assert client.get(f"/api/reports/{outside_id}", headers=officer_a).status_code == 404
    assert client.patch(f"/api/reports/{outside_id}", headers=admin_headers,
                        json={"status": "verified"}).status_code == 200

    def discover(headers, **query):
        return items(client.post("/api/citizen/nearby-alerts", headers=headers, json=query))

    assert discover(citizen_b, radius_km=5) == []
    assert discover(citizen_c, radius_km=25) == []
    found = discover(citizen_b, radius_km=10, limit=1, sort="time")
    assert [alert["id"] for alert in found] == [aid]  # A newer distant alert cannot occupy this page.
    assert found[0]["approximate_locations"] == [{"lat": 23.0, "lon": 82.0}]
    assert 7 <= found[0]["distance_km"] <= 9
    assert {"species", "severity", "status", "created_at"} <= found[0].keys()
    assert not {"lat", "lon", "reporter_name", "contact", "incident_id", "report_id", "evidence_url"} & found[0].keys()
    assert "23.0222" not in str(found) and "Private Reporter" not in str(found)
    assert [alert["id"] for alert in discover(citizen_c, source="gps", lat=23.0, lon=82.0, radius_km=5)] == [aid]

    assert client.put("/api/citizen/alert-preferences", headers=citizen_a, json={"radius_km": 10}).status_code == 200
    with TestClient(client.app) as device_b:
        profile, second_session = sign_in(device_b, "9123456811")
        assert profile["name"] == "Private Reporter A" and profile["alert_radius_km"] == 10
        assert profile["location"]["lon"] == 82.08
        history = items(device_b.get("/api/citizen/reports", headers=second_session))
        assert reference in {item["reference_code"] for item in history}
    assert client.patch(f"/api/incidents/{iid}", headers=officer_b, json={"status": "resolved"}).status_code == 404
    assert client.patch(f"/api/incidents/{iid}", headers=officer_a, json={"status": "resolved"}).status_code == 200
    assert discover(citizen_b, radius_km=10) == []
    assert discover(citizen_a) == []
    assert {item["event"] for item in items(client.get("/api/citizen/notifications", headers=citizen_a))} == {"approved", "resolved"}
    assert [item["id"] for item in items(client.get("/api/operations/alerts?status=resolved", headers=officer_a))] == [iid]
    assert client.put(f"/api/authority/officers/{officer_a_id}/jurisdictions", headers=admin_headers,
                      json={"jurisdiction_ids": []}).status_code == 200
    assert client.get(f"/api/reports/{rid}/evidence", headers=officer_a).status_code == 404


def test_private_object_failure_and_cross_instance_reads(client, admin_headers, monkeypatch, tmp_path):
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)
    owner = citizen(client, "9123456814", "Shared Evidence", 25.5, 85.5)
    other = citizen(client, "9123456815", "Other Citizen", 25.5, 85.5)
    monkeypatch.setattr(config, "MEDIA_STORAGE", "supabase")
    monkeypatch.setattr(config, "SUPABASE_STORAGE_KEY", "sb_secret_fixture")
    monkeypatch.setattr(config, "SUPABASE_STORAGE_URL", "https://isolated-fixture.supabase.co")
    objects = {}
    unavailable = True
    bucket_public = False

    def storage(request):
        assert request.url.host == "isolated-fixture.supabase.co"
        assert request.headers["apikey"] == "sb_secret_fixture"
        if request.url.path == f"/storage/v1/bucket/{config.SUPABASE_STORAGE_BUCKET}":
            assert request.method == "GET"
            return httpx.Response(200, json={"public": bucket_public})
        bucket_marker = f"/{config.SUPABASE_STORAGE_BUCKET}/"
        assert bucket_marker in request.url.path
        object_key = request.url.path.split(bucket_marker, 1)[1]
        if request.method == "POST":
            assert request.headers["x-upsert"] == "false"
            if unavailable:
                return httpx.Response(503)
            objects[object_key] = request.content
            return httpx.Response(200)
        assert "/object/authenticated/" in request.url.path
        return (httpx.Response(200, content=objects[object_key]) if object_key in objects
                else httpx.Response(400, json={"statusCode": "404"}))

    transport = httpx.MockTransport(storage)

    def request(method, url, **kwargs):
        with httpx.Client(transport=transport) as storage_client:
            return storage_client.request(method, url, **kwargs)

    monkeypatch.setattr(media.httpx, "request", request)
    key = uuid4()
    assert submit(client, owner, 25.55, 85.55, image=photo(), key=key).status_code == 503
    with SessionLocal() as db:
        assert db.scalar(select(SightingReport.id).where(SightingReport.submission_key == str(key))) is None
    unavailable = False
    bucket_public = True
    assert submit(client, owner, 25.55, 85.55, image=photo(), key=key).status_code == 503
    assert not objects
    bucket_public = False
    response = submit(client, owner, 25.55, 85.55, image=photo(), key=key)
    assert response.status_code == 201, response.text
    reference = response.json()["reference_code"]
    with SessionLocal() as db:
        row = db.scalar(select(SightingReport).where(SightingReport.reference_code == reference))
        report_id, object_ref = row.id, row.image_path
    assert object_ref == "supabase:" + next(iter(objects))
    assert client.get(f"/api/reports/{report_id}/evidence", headers=admin_headers).content == photo()

    from backend.api import routes_core

    def analyze(path, media_type, *, upload_dir):
        assert media_type == "image" and Path(path).read_bytes() == photo()
        annotated = Path(upload_dir) / "annotation.jpg"
        annotated.write_bytes(photo())
        return {"detections": [], "annotated_path": str(annotated)}

    monkeypatch.setattr(routes_core.ai_detector, "analyze_media", analyze)
    with SessionLocal.begin() as db:
        db.add(Camera(code="WORKFLOW-CAMERA", name="Workflow camera", zone="Workflow",
                      lat=25.55, lon=85.55))
    camera_upload = client.post("/api/detections/upload", headers=admin_headers,
                                data={"camera_code": "WORKFLOW-CAMERA"},
                                files={"file": ("camera.jpg", photo(), "image/jpeg")})
    assert camera_upload.status_code == 200, camera_upload.text
    camera_photo = camera_upload.json()["analysis"]["original_url"]
    camera_annotation = camera_upload.json()["analysis"]["annotated_url"]
    assert client.get(camera_photo, headers=admin_headers).content == photo()
    assert client.get(camera_annotation, headers=admin_headers).content == photo()
    assert client.get(camera_photo).status_code == 401
    assert client.get(camera_annotation, headers=other).status_code == 401

    # A separate ASGI instance has its own connection pool and an empty local filesystem.
    instance = FastAPI()
    instance.include_router(routes_alerts.router)
    instance.include_router(routes_core.router)
    instance.include_router(routes_citizen.router)
    instance.include_router(routes_community.citizen_router)
    other_engine = create_database_engine(engine.url)
    other_session = sessionmaker(other_engine)

    def independent_database():
        with other_session() as db:
            yield db

    instance.dependency_overrides[get_db] = independent_database
    monkeypatch.setattr(config, "UPLOAD_DIR", str(tmp_path))
    try:
        with TestClient(instance) as secondary:
            evidence_url = f"/api/citizen/reports/{reference}/evidence"
            evidence = secondary.get(evidence_url, headers=owner)
            assert evidence.status_code == 200 and evidence.content == photo()
            assert evidence.headers["cache-control"] == "private, no-store"
            assert secondary.get(evidence_url, headers=other).status_code == 404
            assert secondary.get(evidence_url).status_code == 401
            assert secondary.get(f"/api/reports/{report_id}/evidence", headers=admin_headers).content == photo()
            assert secondary.get(camera_photo, headers=admin_headers).content == photo()
            assert secondary.get(camera_annotation, headers=admin_headers).content == photo()
            with media.local_evidence(object_ref) as local:
                assert local.read_bytes() == photo()
            assert not local.exists()
            objects.clear()
            assert secondary.get(evidence_url, headers=owner).status_code == 404
    finally:
        other_engine.dispose()
