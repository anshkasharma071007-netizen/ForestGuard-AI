import json
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select, update

from backend import config
from backend.api import routes_locations
from backend.database.session import SessionLocal
from backend.models.entities import Alert, Citizen, CitizenOtp, CitizenPushDelivery, CitizenPushDevice
from backend.models.entities import SightingReport, utcnow
from backend.services import citizen_email, citizen_push
from tools.link_citizen_email import link
from test_geographical_workflow import jurisdiction

BASE = "/api/citizen"
POINT = {"lat": 12.9701, "lon": 77.5962, "label": "Bengaluru test location"}


@pytest.fixture
def mailbox(monkeypatch):
    messages = {}
    monkeypatch.setattr(config, "BREVO_API_KEY", "isolated-test")
    monkeypatch.setattr(config, "BREVO_SENDER_EMAIL", "sender@example.com")
    monkeypatch.setattr(config, "CITIZEN_OTP_SECRET", "isolated-test-secret-not-used-in-production")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", False)
    monkeypatch.setattr(citizen_email, "send_brevo", lambda email, code: messages.update({email: code}))
    return messages


def send(client, email):
    return client.post(f"{BASE}/email-otp/send", json={"email": email})


def verify(client, email, code, **fields):
    return client.post(f"{BASE}/email-otp/verify", json={"email": email, "code": code, **fields})


def sign_in(client, mailbox, email, location=None):
    assert send(client, email).status_code == 200
    verified = verify(client, email, mailbox[email])
    assert verified.status_code == 200, verified.text
    profile = verified.json()["profile"]
    headers = {"Authorization": f"Bearer {verified.json()['token']}", "X-Citizen-Account": str(profile["id"])}
    if location:
        response = client.put(f"{BASE}/profile", headers=headers, json={"name": "Email test citizen", "location": location})
        assert response.status_code == 200, response.text
    return profile, headers


def submit(client, headers, label=POINT["label"]):
    response = client.post(f"{BASE}/reports", headers=headers, data={
        **POINT, "label": label, "title": "Private email verification report", "category": "sighting",
        "species": "tiger", "submission_key": str(uuid4()),
    })
    assert response.status_code == 201, response.text
    reference = response.json()["reference_code"]
    with SessionLocal() as db:
        identifier = db.scalar(select(SightingReport.id).where(SightingReport.reference_code == reference))
    return identifier, reference


def test_email_otp_limits_expiry_and_delivery_failure(client, mailbox, monkeypatch):
    address = "limited@example.com"
    assert send(client, address.upper()).status_code == 200
    assert send(client, address).status_code == 429
    code = mailbox[address]
    assert len(code) == 6 and code.isdecimal()
    key = citizen_email._digest("email", address)
    with SessionLocal() as db:
        assert db.get(CitizenOtp, key).digest != code
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert verify(client, address, wrong).status_code == 401
    assert verify(client, address, code).status_code == 429
    with SessionLocal.begin() as db:
        db.execute(update(CitizenOtp).where(CitizenOtp.email_key == key).values(expires_at=utcnow() - timedelta(seconds=1)))
    assert verify(client, address, code).status_code == 410

    def unavailable(email, code):
        raise HTTPException(502, "Email delivery failed.")

    monkeypatch.setattr(citizen_email, "send_brevo", unavailable)
    assert send(client, "undelivered@example.com").status_code == 502
    assert verify(client, "undelivered@example.com", "123456").status_code == 410
    assert client.post(f"{BASE}/verify", json={"phone": "9876543210", "code": "1234"}).status_code == 403


def test_verified_email_sessions_and_explicit_historical_link(client, mailbox, monkeypatch):
    historical = "historical-address@example.com"
    recovery = "operator-reserved@example.com"
    with SessionLocal.begin() as db:
        former = Citizen(phone="+919876549990", contact_phone="+919876549990", name="Historical account",
                         email=historical, lat=POINT["lat"], lon=POINT["lon"])
        db.add(former)
        db.flush()
        old_id = former.id
        db.add(SightingReport(reference_code="FG-EMAIL-HISTORICAL", citizen_id=old_id, title="Existing evidence",
                              category="sighting", species="tiger", description="", reporter_name=former.name,
                              lat=POINT["lat"], lon=POINT["lon"], is_simulated=False))

    profile, headers = sign_in(client, mailbox, historical)
    assert profile["id"] != old_id and profile["location"] is None and profile["phone"] is None
    assert client.get(f"{BASE}/reports", headers=headers).status_code == 403
    assert verify(client, historical, mailbox[historical]).status_code == 410
    assert client.put(f"{BASE}/profile", headers=headers, json={
        "name": "New email account", "location": POINT, "email": recovery,
    }).json()["email"] == historical
    assert client.get(f"{BASE}/reports/FG-EMAIL-HISTORICAL", headers=headers).status_code == 404

    with SessionLocal.begin() as db:
        link(db, old_id, recovery)
    linked, linked_headers = sign_in(client, mailbox, recovery)
    assert linked["id"] == old_id and linked["phone"] == "+919876549990"
    assert client.get(f"{BASE}/reports/FG-EMAIL-HISTORICAL", headers=linked_headers).status_code == 200
    assert client.put(f"{BASE}/profile", headers=linked_headers, json={"name": linked["name"], "phone": None}).json()["phone"] is None
    with SessionLocal() as db:
        assert db.get(Citizen, old_id).phone == "+919876549990"

    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(citizen_email, "utcnow", lambda: utcnow() + timedelta(minutes=2))
    assert send(client, recovery).status_code == 200
    second = verify(client, recovery, mailbox[recovery], transport="cookie")
    try:
        assert second.status_code == 200 and "token" not in second.json()
        assert "HttpOnly" in second.headers["set-cookie"] and "Secure" in second.headers["set-cookie"]
        assert second.json()["profile"]["id"] == old_id
        assert client.get(f"{BASE}/profile", headers=linked_headers).status_code == 200
        assert client.post(f"{BASE}/sign-out", headers=linked_headers).status_code == 200
        assert client.get(f"{BASE}/profile", headers=linked_headers).status_code == 401
    finally:
        client.cookies.clear()


def test_locations_and_report_jurisdiction(client, admin_headers, mailbox, monkeypatch):
    from io import BytesIO
    from urllib.parse import parse_qs, urlsplit

    calls = []

    def geoapify(url, timeout):
        query = parse_qs(urlsplit(url).query)
        calls.append((urlsplit(url).path, query))
        return BytesIO(json.dumps({"results": [{**POINT, "formatted": POINT["label"]}]}).encode())

    monkeypatch.setattr(config, "GEOAPIFY_API_KEY", "test-geoapify-key")
    monkeypatch.setattr(routes_locations, "urlopen", geoapify)
    routes_locations._geoapify.cache_clear()
    try:
        _, headers = sign_in(client, mailbox, "geocoding@example.com", POINT)
        assert client.post(f"{BASE}/locations/search", json={"text": "Greater Noida"}).status_code == 401
        for mode in ("autocomplete", "autocomplete", "search"):
            result = client.post(f"{BASE}/locations/search", json={"text": "Greater Noida", "mode": mode}, headers=headers)
            assert result.json()["items"] == [POINT]
        assert len(calls) == 2
        assert all(query["filter"] == ["countrycode:in"] for _, query in calls)
        clicked = {"lat": 28.511234, "lon": 77.513456}
        assert client.post(f"{BASE}/locations/reverse", json=clicked, headers=headers).json()["label"] == POINT["label"]
        assert calls[-1][0].endswith("/reverse")
        assert client.put(f"{BASE}/saved-location", headers=headers, json={**clicked, "label": "Park entrance"}).json()[
            "saved_alert_location"] == {"type": "gps", **clicked, "label": "Park entrance"}

        routed_to = jurisdiction(client, admin_headers, "Email integration test routing", 77.55, 12.95, 77.62, 13.00)
        identifier, reference = submit(client, headers)
        with SessionLocal() as db:
            report = db.get(SightingReport, identifier)
            assert (report.jurisdiction_id, report.lat, report.lon, report.location_label) == (
                routed_to, POINT["lat"], POINT["lon"], POINT["label"])
        assert client.get(f"{BASE}/reports/{reference}", headers=headers).json()["location_label"] == POINT["label"]
    finally:
        routes_locations._geoapify.cache_clear()


def test_push_recipients_retry_deduplication_and_logout(client, admin_headers, mailbox, monkeypatch):
    monkeypatch.setattr(config, "EXPO_PUSH_ENABLED", True)
    _, owner = sign_in(client, mailbox, "push-owner@example.com", POINT)
    _, near = sign_in(client, mailbox, "push-near@example.com", POINT)
    _, far = sign_in(client, mailbox, "push-far@example.com", {**POINT, "lon": 77.69})
    _, opted_out = sign_in(client, mailbox, "push-opted-out@example.com", POINT)
    installations = [str(uuid4()) for _ in range(4)]

    def register(headers, index):
        return client.put(f"{BASE}/push/device", headers=headers, json={
            "installation": installations[index], "token": f"ExpoPushToken[fixture-{index}]",
        })

    for index, (account, reports, nearby) in enumerate([
        (owner, True, False), (near, False, True), (far, False, True), (opted_out, False, False),
    ]):
        assert client.put(f"{BASE}/push/preferences", headers=account,
                          json={"reports": reports, "nearby": nearby}).status_code == 200
        assert client.put(f"{BASE}/alert-preferences", headers=account, json={"radius_km": 5}).status_code == 200
        assert register(account, index).status_code == 200
        assert register(account, index).status_code == 200

    report_id, reference = submit(client, owner)
    review = client.patch(f"/api/reports/{report_id}", headers=admin_headers, json={"status": "verified"})
    assert review.status_code == 200, review.text
    incident_id = review.json()["report"]["incident_id"]
    assert client.patch(f"/api/reports/{report_id}", headers=admin_headers, json={"status": "verified"}).status_code == 200
    with SessionLocal.begin() as db:
        alert_id = db.scalar(select(Alert.id).where(Alert.incident_id == incident_id))
        devices = {device.installation: device.id for device in db.scalars(select(CitizenPushDevice))}
        approved = f"{report_id}:approved"
        alert = f"alert:{alert_id}"
        citizen_push.queue_report(db, int(owner["X-Citizen-Account"]), report_id, "approved", utcnow())
        deliveries = {(item.device_id, item.event_key): item.notification_id for item in db.scalars(select(CitizenPushDelivery))}
        assert set(deliveries) == {(devices[installations[0]], approved), (devices[installations[1]], alert)}
    assert client.get(f"{BASE}/reports/{reference}", headers=near).status_code == 404
    approved_payload = {"id": deliveries[(devices[installations[0]], approved)]}
    assert client.post(f"{BASE}/push/open", headers=near, json=approved_payload).status_code == 404
    assert client.post(f"{BASE}/push/open", headers=owner, json=approved_payload).json()["reference_code"] == reference
    assert client.post(f"{BASE}/push/open", headers=near, json={"id": deliveries[(devices[installations[1]], alert)]}).json()[
        "alert_id"] == alert_id

    requests = []

    def expo(request):
        payload = json.loads(request.content)
        requests.append(payload)
        if request.url.path.endswith("/getReceipts"):
            return httpx.Response(200, json={"data": {"mock-ticket": {
                "status": "error", "details": {"error": "DeviceNotRegistered"},
            }}})
        if len(requests) == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"data": {"status": "ok", "id": "mock-ticket"}})

    with httpx.Client(transport=httpx.MockTransport(expo)) as sender:
        with SessionLocal.begin() as db:
            # Make the owner the only due task to cover HTTP retry and receipt cleanup deterministically.
            db.get(CitizenPushDelivery, (devices[installations[1]], alert)).next_at = utcnow() + timedelta(hours=1)
        for attempt in range(3):
            with SessionLocal.begin() as db:
                assert citizen_push.process_next(db, sender)
                db.flush()
                delivery = db.get(CitizenPushDelivery, (devices[installations[0]], approved))
                if attempt < 2:
                    assert delivery.next_at > utcnow()
                    delivery.next_at = utcnow() - timedelta(seconds=1)
                else:
                    assert delivery is None

    assert requests[0]["data"] == {**approved_payload, "kind": "report"}
    assert requests[0]["tag"] == requests[1]["tag"] == approved_payload["id"]
    assert reference not in json.dumps(requests) and POINT["label"] not in json.dumps(requests)
    assert register(owner, 0).status_code == 200
    assert client.patch(f"/api/incidents/{incident_id}", headers=admin_headers, json={"status": "resolved"}).status_code == 200
    rejected_id, _ = submit(client, owner)
    assert client.patch(f"/api/reports/{rejected_id}", headers=admin_headers, json={
        "status": "rejected", "citizen_note": "Private rejection reason",
    }).status_code == 200
    with SessionLocal() as db:
        queued = {item.event_key for item in db.scalars(select(CitizenPushDelivery).join(CitizenPushDevice).where(
            CitizenPushDevice.installation == installations[0]))}
        assert queued == {f"{report_id}:resolved", f"{rejected_id}:rejected"}
    assert client.post(f"{BASE}/sign-out", headers=owner).status_code == 200
    assert register(owner, 0).status_code == 401
    assert register(near, 0).status_code == 200
    assert client.post(f"{BASE}/push/open", headers=near, json=approved_payload).status_code == 404
    with SessionLocal() as db:
        assert db.scalars(select(CitizenPushDelivery.event_key)).all() == [alert]
