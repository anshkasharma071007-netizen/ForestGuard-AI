from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from backend import config
from backend.database.session import SessionLocal
from backend.models import Alert, Camera, Detection, Incident, SightingReport, Village, utcnow
from geospatial.risk_analysis import risk_level
from test_geographical_workflow import citizen, items, jurisdiction, officer, photo, sign_in
from tools.correct_citizen_risk import correct
from tools.provision_greater_noida import BOUNDARY, EMAIL, NAME, provision


@pytest.fixture
def account(client, monkeypatch):
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)
    return citizen(client, "9123456820", "Map Reporter", 28.46, 77.51)


def submit(client, citizen_headers, title, species="tiger", lat=28.4663, lon=77.5184, image=None):
    response = client.post("/api/citizen/reports", headers=citizen_headers, data={
        "title": title, "lat": lat, "lon": lon, "category": "sighting",
        "species": species, "submission_key": str(uuid4()),
    }, files={"image": ("report.jpg", image, "image/jpeg")} if image else None)
    assert response.status_code == 201, response.text
    reference = response.json()["reference_code"]
    with SessionLocal() as db:
        report = db.scalar(select(SightingReport).where(SightingReport.reference_code == reference))
        return report.id, reference


def approve(client, headers, report_id, **extra):
    response = client.patch(f"/api/reports/{report_id}", headers=headers, json={"status": "verified", **extra})
    assert response.status_code == 200, response.text
    return response.json()["report"]


def test_greater_noida_map_and_nearby_lifecycle(client, admin_headers, account):
    password = "Greater Noida test officer only"
    with SessionLocal.begin() as db:
        noida = provision(db, password)
    with SessionLocal.begin() as db:
        assert provision(db, None) == noida
    signed_in = client.post("/api/auth/login", json={"email": EMAIL, "password": password})
    assert signed_in.status_code == 200
    assigned = {"Authorization": f"Bearer {signed_in.json()['token']}"}
    outside = jurisdiction(client, admin_headers, "Outside Noida map test", 76.9, 28.4, 77.0, 28.6)
    _, outside_headers = officer(client, admin_headers, "outside-noida@example.com", [outside])
    active, ref = submit(client, account, "Tiger on patrol road", "Bengal tiger", image=photo())
    pending, _ = submit(client, account, "Pending Noida report", lat=28.505, lon=77.55)
    external, _ = submit(client, account, "Outside jurisdiction report", lat=28.5, lon=76.95)
    with SessionLocal.begin() as db:
        db.get(SightingReport, active).created_at = utcnow() - timedelta(days=65)
        camera = Camera(code="TEST-NOIDA", name="Noida test station", zone="Greater Noida", lat=28.46, lon=77.51)
        db.add(camera)
        db.flush()
        db.add(Detection(species="tiger", confidence=0.8, detected_at=utcnow(),
                         lat=28.46, lon=77.51, camera_id=camera.id, camera_code=camera.code,
                         is_simulated=False))

    assert items(client.get("/api/operations/map/jurisdictions", headers=assigned)) == [
        {"id": noida, "name": NAME, "is_demo": False, "boundary": BOUNDARY}
    ]
    assert {noida, outside} <= {item["id"] for item in items(
        client.get("/api/operations/map/jurisdictions", headers=admin_headers))}
    path = f"/api/operations/map?jurisdiction_id={noida}&days=7"
    assert client.get(path, headers=outside_headers).status_code == 404
    assert client.get(f"/api/operations/map?jurisdiction_id={outside}", headers=assigned).status_code == 404
    assert [item["id"] for item in client.get(path, headers=assigned).json()["reports"]] == [pending]

    approved = approve(client, assigned, active)
    assert approved["jurisdiction_id"] == noida
    assert approved["risk"]["level"] == "high"
    map_payload = client.get(path, headers=assigned).json()
    assert [item["camera_code"] for item in map_payload["detections"]] == ["TEST-NOIDA"]
    assert client.get(f"/api/operations/map?jurisdiction_id={outside}", headers=outside_headers).json()["detections"] == []
    markers = {item["id"]: item for item in map_payload["reports"]}
    assert set(markers) == {pending, active}
    assert (markers[pending]["status"], markers[pending]["severity"]) == ("pending", None)
    pinned = markers[active]
    assert (pinned["species"], pinned["status"], pinned["severity"]) == ("tiger", "under_work", "high")
    assert pinned["coverage_radius_m"] > 0
    assert client.get(pinned["image_url"], headers=assigned).content == photo()
    assert client.get(pinned["image_url"], headers=outside_headers).status_code == 404
    assert external not in markers

    dashboard = client.get("/api/operations/dashboard", headers=assigned).json()
    assert dashboard["summary"] == {"pending": 1, "active": 1, "high": 1, "resolved": 0}
    assert dashboard["risk_distribution"] == {"high": 1, "moderate": 0, "low": 0}
    assert sum(day["reports"] for day in dashboard["daily"]) == 1
    assert sum(day["detections"] for day in dashboard["daily"]) == 1
    assert {item["id"] for item in dashboard["recent_reports"]} == {pending, active}
    assert len(dashboard["recent_detections"]) == 1
    inbox = items(client.get("/api/citizen/notifications", headers=account))
    assert next(item for item in inbox if item["reference_code"] == ref)["risk_level"] == "high"

    for radius, lon in [(5, 77.56), (10, 77.60), (20, 77.70), (25, 77.75)]:
        query = {"source": "gps", "lat": 28.5, "lon": lon, "radius_km": radius}
        nearby = items(client.post("/api/citizen/nearby-alerts", headers=account, json=query))
        if radius == 5:
            assert nearby == []
            continue
        warning, = [item for item in nearby if item["species"] == "tiger"]
        assert warning["severity"] == "high" and warning["uncertainty_radius_m"] == 8000
        assert warning["approximate_locations"] == [{"lat": 28.5, "lon": 77.5}]
        assert "28.4663" not in str(warning) and "77.5184" not in str(warning)
    assert client.patch(f"/api/incidents/{approved['incident_id']}", headers=assigned,
                        json={"status": "resolved"}).status_code == 200
    markers = {item["id"]: item for item in client.get(path, headers=assigned).json()["reports"]}
    assert markers[active]["status"] == "resolved" and markers[active]["coverage_radius_m"] is None
    assert items(client.post("/api/citizen/nearby-alerts", headers=account, json={"radius_km": 25})) == []


def test_review_baselines_normalize_aliases_and_persist(client, admin_headers, account):
    aliases = (
        ("tiger", "BENGAL TIGER", "high"), ("leopard", "Indian Leopard", "high"),
        ("elephant", "Indian elephant", "high"), ("sloth_bear", "sloth-bear", "high"),
        ("wild_boar", "Wild pig", "moderate"), ("deer", "Chital (spotted deer)", "low"),
    )
    for canonical, alias, severity in aliases:
        report_id, reference = submit(client, account, f"Observed {canonical}", alias, lat=27.123, lon=78.321)
        review = client.post(f"/api/reports/{report_id}/risk-preview", headers=admin_headers,
                             json={"confirmed_species": alias}).json()["risk"]
        assert review["level"] == severity
        assert risk_level(review["score"], review["thresholds"]) == severity
        report = approve(client, admin_headers, report_id, confirmed_species=alias)
        assert report["species"] == report["confirmed_species"] == canonical
        assert report["risk"]["level"] == severity
        assert client.get(f"/api/citizen/reports/{reference}", headers=account).json()["risk_level"] == severity
        with SessionLocal() as db:
            alert = db.scalar(select(Alert).where(Alert.incident_id == report["incident_id"]))
            assert (alert.severity, alert.score) == (severity, review["score"])


def test_saved_location_update_remove_and_other_session(client, account):
    initial = client.get("/api/citizen/profile", headers=account).json()
    with SessionLocal() as db:
        village_id = db.scalar(select(Village.id).where(Village.lat.is_not(None)).limit(1))
    response = client.put("/api/citizen/saved-location", headers=account, json={"village_id": village_id})
    assert response.status_code == 200, response.text
    assert response.json()["saved_alert_location"]["village"]["id"] == village_id
    coordinates = {"lat": 28.4, "lon": 77.9}
    assert client.put("/api/citizen/saved-location", headers=account, json=coordinates).status_code == 200
    profile, other_session = sign_in(client, "9123456820")
    assert profile["saved_alert_location"] == {"type": "gps", **coordinates}
    assert profile["location"] == initial["location"]
    assert client.delete("/api/citizen/saved-location", headers=other_session).json()["saved_alert_location"] is None
    assert client.get("/api/citizen/profile", headers=account).json()["saved_alert_location"] is None
    assert client.post("/api/citizen/nearby-alerts", headers=account, json={"source": "saved"}).status_code == 400
    assert client.post("/api/citizen/nearby-alerts", headers=account,
                       json={"source": "gps", **coordinates}).status_code == 200
    assert client.get("/api/citizen/reports", headers=account).status_code == 200


def test_correct_legacy_automatic_tiger_but_preserve_override(client, admin_headers, account):
    automatic, _ = submit(client, account, "Historic automatic tiger")
    override, _ = submit(client, account, "Historic manual override")
    automatic = approve(client, admin_headers, automatic)
    override = approve(client, admin_headers, override, risk_level="moderate", risk_reason="Recorded field context")
    auto_id, override_id = automatic["incident_id"], override["incident_id"]
    with SessionLocal.begin() as db:
        incident = db.get(Incident, auto_id)
        alert = db.scalar(select(Alert).where(Alert.incident_id == auto_id))
        incident.severity = alert.severity = "moderate"
        alert.score = 45
        incident.report_risk = {
            "assessment_method": "automatic", "level": "moderate", "score": 45, "reason": "Legacy assessment.",
            "components": [{"key": "animal_threat", "points": 45}],
        }

    with SessionLocal.begin() as db:
        preview = correct(db)
        assert [item["incident_id"] for item in preview] == [auto_id]
        assert db.get(Incident, auto_id).severity == "moderate"
    with SessionLocal.begin() as db:
        assert correct(db, apply=True) == preview
    with SessionLocal.begin() as db:
        assert correct(db) == []
        incident = db.get(Incident, auto_id)
        alert = db.scalar(select(Alert).where(Alert.incident_id == auto_id))
        assert incident.severity == alert.severity == "high"
        assert incident.report_risk["correction"]["previous_assessment"]["score"] == 45
        assert db.get(Incident, override_id).report_risk["assessment_reason"] == "Recorded field context"
        assert db.get(Incident, override_id).severity == "moderate"
