import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy import func, select

from backend import config
from backend.database.session import SessionLocal
from backend.models import Alert, AlertEvent, Incident, SightingReport, utcnow
from tools.reconcile_citizen_incidents import reconcile

CITIZEN_REPORTS = "/api/citizen/reports"
PUBLIC_ALERTS = "/api/community/alerts?field_only=true&verified_only=true"


@pytest.fixture
def citizens(client, monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)
    village_code = client.get("/api/community/villages").json()["items"][0]["code"]
    headers = []
    for number, name in [("9876500181", "Lifecycle observer"), ("9876500182", "Nearby observer")]:
        result = client.post("/api/citizen/verify", json={"phone": number, "code": "1234", "name": name})
        headers.append({"Authorization": "Bearer " + result.json()["token"]})
        assert client.put("/api/citizen/profile", headers=headers[-1], json={
            "name": name, "location": {"village_code": village_code},
        }).status_code == 200
    return *headers, village_code


def submit(client, citizen, *, photo=False, **location):
    fields = {"title": f"Lifecycle sighting {uuid4().hex[:6]}", "category": "sighting",
              "species": "deer", "submission_key": str(uuid4()), **location}
    files = None
    if photo:
        buffer = io.BytesIO()
        Image.new("RGB", (12, 12)).save(buffer, "PNG")
        files = {"image": ("sample.png", buffer.getvalue(), "image/png")}
    result = client.post(CITIZEN_REPORTS, data=fields, files=files, headers=citizen)
    assert result.status_code == 201, result.text
    assert result.json()["lifecycle_status"] == "pending"
    code = result.json()["reference_code"]
    with SessionLocal() as db:
        return db.scalar(select(SightingReport.id).where(SightingReport.reference_code == code)), code, fields["submission_key"]


def approve(client, admin, report_id, species="unidentified"):
    return client.patch(f"/api/reports/{report_id}", headers=admin,
                        json={"status": "verified", "confirmed_species": species})


def linked(db, report_id):
    incident = db.scalar(select(Incident).where(Incident.report_id == report_id))
    alert = db.scalar(select(Alert).where(Alert.incident_id == incident.id)) if incident else None
    return incident, alert


def test_gps_universal_publication_concurrent_approval_and_resolution(client, admin_headers, citizens):
    owner, other, _ = citizens
    coordinates = {"lat": "21.76321", "lon": "79.30651"}
    report_id, code, receipt = submit(client, owner, photo=True, **coordinates)
    old_id, _, _ = submit(client, owner, **coordinates)
    prediction = [{"species": "elephant", "confidence": 0.8, "bbox": [0, 0, 12, 12]}]
    with SessionLocal.begin() as db:
        report = db.get(SightingReport, report_id)
        # A worker can finish successfully or fail after manual review. Keep its evidence unchanged.
        report.analysis_status = "failed"
        report.analysis_results = prediction
        db.get(SightingReport, old_id).created_at = utcnow() - timedelta(days=200)

    with ThreadPoolExecutor(4) as pool:
        approvals = list(pool.map(lambda _: approve(client, admin_headers, report_id), range(4)))
    assert all(response.status_code == 200 for response in approvals)
    assert approve(client, admin_headers, old_id).status_code == 200

    with SessionLocal() as db:
        report = db.get(SightingReport, report_id)
        assert report.species == "deer" and report.analysis_results == prediction
        assert len(report.review_history) == 1 and report.review_history[0]["reviewer_id"]
        incident, alert = linked(db, report_id)
        old_incident, old_alert = linked(db, old_id)
        assert alert.id != old_alert.id and incident.species == old_incident.species == "unidentified"
        assert alert.severity == old_alert.severity == "low"
        assert not alert.village_ids and not old_alert.village_ids
        assert db.scalar(select(func.count(AlertEvent.id)).where(AlertEvent.alert_id == alert.id,
                                                                AlertEvent.kind == "generated")) == 1
        incident_id, alert_id = incident.id, alert.id

    status_path = f"{CITIZEN_REPORTS}/{code}"
    assert client.get(status_path, headers=owner).json()["lifecycle_status"] == "under_work"
    assert client.get(status_path + "/evidence", headers=owner).status_code == 200
    assert client.get(status_path, headers=other).status_code == 404
    assert client.get(status_path + "/evidence", headers=other).status_code == 404
    assert client.post("/api/citizen/report-receipt", headers=other, data={"submission_key": receipt}).status_code == 404
    public = next(item for item in client.get(PUBLIC_ALERTS, headers=other).json()["items"] if item["id"] == alert_id)
    assert public["approximate_locations"] == [{"lat": 21.8, "lon": 79.3}]
    assert not public["village_names"]
    assert not {"lat", "lon", "title", "reporter_name", "contact", "image_url", "incident_id"}.intersection(public)

    def resolve(index):
        payload = {"note": "Patrol complete"}
        if index % 2:
            return client.post(f"/api/alerts/{alert_id}/resolve", headers=admin_headers, json=payload)
        return client.patch(f"/api/incidents/{incident_id}", headers=admin_headers, json={"status": "resolved", **payload})

    with ThreadPoolExecutor(4) as pool:
        assert all(response.status_code == 200 for response in list(pool.map(resolve, range(4))))
    detail = client.get(f"/api/incidents/{incident_id}", headers=admin_headers).json()
    assert detail["incident"]["resolved_by_id"] and detail["incident"]["resolution_note"] == "Patrol complete"
    assert detail["incident"]["resolved_at"] == detail["alert"]["resolved_at"]
    assert sum(event["kind"] == "resolved" for event in detail["alert"]["events"]) == 1
    assert client.get(status_path, headers=owner).json()["lifecycle_status"] == "resolved"
    assert client.patch(f"/api/incidents/{incident_id}", headers=admin_headers, json={"status": "verified"}).status_code == 409
    assert client.post("/api/risk/recalculate", headers=admin_headers).status_code == 200
    assert alert_id not in {item["id"] for item in client.get(PUBLIC_ALERTS).json()["items"]}
    assert incident_id not in {item["id"] for item in client.get("/api/map/layers?operational=true", headers=admin_headers).json()["incidents"]}
    assert incident_id in {item["id"] for item in
                           client.get("/api/operations/alerts?status=resolved", headers=admin_headers).json()["items"]}


def test_rejection_and_contradictory_review(client, admin_headers, citizens):
    owner, _, village = citizens
    report_id, code, _ = submit(client, owner, village_code=village)
    official = f"/api/reports/{report_id}"
    assert client.patch(official, headers=admin_headers, json={"status": "closed"}).status_code == 409
    assert client.patch(official, headers=admin_headers, json={"status": "rejected", "note": "  "}).status_code == 400
    assert client.patch(official, headers=admin_headers, json={"status": "rejected", "note": "Unrelated to wildlife"}).status_code == 200
    assert approve(client, admin_headers, report_id).status_code == 409
    citizen = client.get(f"{CITIZEN_REPORTS}/{code}", headers=owner).json()
    assert (citizen["lifecycle_status"], citizen["rejection_reason"]) == ("rejected", "Unrelated to wildlife")
    with SessionLocal() as db:
        assert linked(db, report_id) == (None, None)

    race_id, _, _ = submit(client, owner, village_code=village)
    with ThreadPoolExecutor(2) as pool:
        approve_task = pool.submit(approve, client, admin_headers, race_id)
        reject_task = pool.submit(client.patch, f"/api/reports/{race_id}", headers=admin_headers,
                                  json={"status": "rejected", "note": "Unrelated to wildlife"})
        assert sorted([approve_task.result().status_code, reject_task.result().status_code]) == [200, 409]
    with SessionLocal() as db:
        report = db.get(SightingReport, race_id)
        assert len(report.review_history) == 1
        incident, alert = linked(db, race_id)
        if report.status == "verified":
            assert incident and alert and alert.village_ids == [report.village_id]
        else:
            assert incident is None and alert is None


def test_approval_rollback_and_historical_dry_run(client, admin_headers, citizens, monkeypatch):
    from backend.services import incident_lifecycle

    owner, _, village = citizens
    report_id, _, _ = submit(client, owner, village_code=village)
    resolved_id, _, _ = submit(client, owner, village_code=village)
    legacy_id, _, _ = submit(client, owner, village_code=village)

    def fail(*args, **kwargs):
        raise RuntimeError("Failure before alert publication")

    with monkeypatch.context() as patch:
        patch.setattr(incident_lifecycle, "maybe_create_alert", fail)
        with pytest.raises(RuntimeError, match="Failure before alert publication"):
            approve(client, admin_headers, report_id)
    with SessionLocal() as db:
        assert db.get(SightingReport, report_id).status == "pending"
        assert linked(db, report_id) == (None, None)

    assert approve(client, admin_headers, report_id).status_code == 200
    assert approve(client, admin_headers, resolved_id).status_code == 200
    assert approve(client, admin_headers, legacy_id).status_code == 200
    with SessionLocal.begin() as db:
        _, alert = linked(db, report_id)
        db.delete(alert)
        incident, alert = linked(db, resolved_id)
        resolved_alert = alert.id
        incident.status = "resolved"
        incident.resolved_at = utcnow()
        _, legacy_alert = linked(db, legacy_id)
        legacy_alert.status = "resolved"
        legacy_alert.resolved_at = utcnow()
        db.add(AlertEvent(alert_id=legacy_alert.id, kind="resolved", actor="Historical guard",
                          note="Resolved from the old alert workspace", created_at=legacy_alert.resolved_at))
    with SessionLocal.begin() as db:
        preview = reconcile(db)
        assert preview["counts"] == {"publish_missing_alert": 1, "close_alert": 1, "resolve_incident": 1}
        assert linked(db, report_id)[1] is None and db.get(Alert, resolved_alert).status == "active"
    with SessionLocal.begin() as db:
        assert reconcile(db, apply=True)["counts"] == preview["counts"]
    with SessionLocal.begin() as db:
        assert reconcile(db, apply=True)["counts"] == {}
        assert linked(db, report_id)[1] is not None and db.get(Alert, resolved_alert).status == "resolved"
        legacy_incident, legacy_alert = linked(db, legacy_id)
        assert legacy_incident.status == "resolved" and legacy_incident.resolved_at == legacy_alert.resolved_at
        assert legacy_incident.resolved_by == "Historical guard"
