import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from PIL import Image

from backend import config
from backend.database.session import SessionLocal
from backend.models.entities import CitizenSession, utcnow


@pytest.fixture
def dev_otp(monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)


def verify(client, phone, **extra):
    return client.post("/api/citizen/verify", json={"phone": phone, "code": "1234", **extra})


def bearer(response):
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def save_location(client, headers, location, name="Test observer", email=None):
    return client.put("/api/citizen/profile", headers=headers, json={"name": name, "email": email, "location": location})


def test_development_verification_gate(client, monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", True)
    assert verify(client, "9876500141", name="Test observer").status_code == 403
    assert client.post("/api/citizen/validate-phone", json={"phone": "9876500141"}).status_code == 403
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "CITIZEN_DEV_OTP_ENABLED", False)
    assert verify(client, "9876500141", name="Test observer").status_code == 403


def test_onboarding_cookie_profile_and_revocation(client, dev_otp, monkeypatch):
    phone = "9876500141"
    assert verify(client, phone, name="Test observer", code="4321").status_code == 401
    assert verify(client, "bad phone", name="Test observer").status_code == 400
    assert verify(client, phone).status_code == 400
    origin = {"Origin": "http://localhost:8081"}
    browser = verify(client, phone, name="Test observer", email="person@example.com", transport="cookie")
    try:
        assert browser.status_code == 200, browser.text
        assert "token" not in browser.json()
        assert "HttpOnly" in browser.headers["set-cookie"] and "SameSite=strict" in browser.headers["set-cookie"]
        profile = browser.json()["profile"]
        assert profile["phone"] == "+919876500141" and profile["location"] is None
        assert client.get("/api/citizen/reports").status_code == 403
        assert client.get("/api/reports").status_code == 401
        assert save_location(client, {"Origin": "https://untrusted.example"}, {"lat": 10, "lon": 20}).status_code == 403
        assert save_location(client, origin, {"lat": 91, "lon": 0}).status_code == 422
        assert save_location(client, origin, {"village_code": "missing"}).status_code == 400
        village = client.get("/api/community/villages").json()["items"][0]
        saved = save_location(client, origin, {"village_code": village["code"]}, name="Updated observer")
        assert saved.status_code == 200, saved.text
        assert saved.json()["email"] is None
        assert saved.json()["location"]["village"]["name"] == village["name"]
        assert client.get("/api/citizen/profile").json() == saved.json()
        assert client.post("/api/citizen/sign-out", headers=origin).status_code == 200
        assert client.get("/api/citizen/profile").status_code == 401
        native = verify(client, "9876500141")
        headers = bearer(native)
        assert native.json()["profile"]["id"] == profile["id"]
        assert native.json()["profile"]["name"] == "Updated observer"
        gps = save_location(client, headers, {"lat": 10, "lon": 20})
        assert gps.json()["location"] == {"type": "gps", "lat": 10.0, "lon": 20.0}
        assert client.post("/api/citizen/sign-out", headers=headers).status_code == 200
        assert client.get("/api/citizen/profile", headers=headers).status_code == 401
        headers = bearer(verify(client, phone))
        monkeypatch.setattr(config, "APP_ENV", "production")
        assert client.get("/api/citizen/profile", headers=headers).status_code == 401
    finally:
        client.cookies.clear()


def test_private_reports_review_and_status(client, admin_headers, dev_otp):
    citizen = bearer(verify(client, "9876500142", name="First citizen"))
    other = bearer(verify(client, "9876500143", name="Second citizen"))
    village = client.get("/api/community/villages").json()["items"][0]
    for headers in (citizen, other):
        assert save_location(client, headers, {"village_code": village["code"]}, name="Signed-in observer").status_code == 200

    path = "/api/citizen/reports"
    fields = {"title": "Wildlife near the village", "category": "sighting", "submission_key": str(uuid4()),
              "village_code": village["code"], "reporter_name": "Client-supplied name", "citizen_id": "9999"}
    assert client.post(path, data=fields).status_code == 401
    assert client.post(path, headers=admin_headers, data=fields).status_code == 401
    assert client.post(path, headers=citizen, data={**fields, "title": " "}).status_code in (400, 422)
    assert client.post(path, headers=citizen, data={**fields, "village_code": ""}).status_code == 400
    assert client.post(path, headers=citizen, data={k: v for k, v in fields.items() if k != "category"}).status_code == 422
    assert client.get(path, headers=citizen).json()["items"] == []
    assert all(item["is_simulated"] for item in client.get("/api/community/alerts?verified_only=true").json()["items"])

    response = client.post(path, headers=citizen, data=fields)
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["status"] == "pending"
    code = receipt["reference_code"]
    assert client.get(f"{path}/{code}", headers=other).status_code == 404
    assert client.get(f"/api/community/reports/{code}").status_code == 404
    key = {"submission_key": fields["submission_key"]}
    assert client.post("/api/community/report-receipt", data=key).status_code == 404
    assert client.post("/api/citizen/report-receipt", headers=other, data=key).status_code == 404
    assert client.post("/api/citizen/report-receipt", headers=citizen, data=key).json() == receipt

    assert save_location(client, citizen, {"village_code": village["code"]}, name="New name").status_code == 200
    assert client.post(path, headers=citizen, data=fields).json() == receipt
    assert client.post(path, headers=citizen, data={**fields, "title": "Different title"}).status_code == 409
    assert client.post(path, headers=other, data=fields).status_code == 409
    assert client.get(path, headers=other).json()["items"] == []
    current = client.get(f"{path}/{code}", headers=citizen).json()
    assert current["title"] == fields["title"] and current["species_name"] == "Unidentified animal"
    assert current["description"] == "" and not current["has_photo"]
    review = next(r for r in client.get("/api/reports", headers=admin_headers).json()["items"] if r["reference_code"] == code)
    assert review["reporter_name"] == "Signed-in observer" and review["contact"] == "+919876500142"
    assert review["title"] == fields["title"]
    assert not client.get("/api/community/alerts?field_only=true&verified_only=true").json()["items"]
    official = f"/api/reports/{review['id']}"
    assert client.patch(official, headers=citizen, json={"status": "verified"}).status_code == 401
    assert client.patch(official, headers=admin_headers, json={"status": "forwarded"}).status_code == 200
    assert client.get(f"{path}/{code}", headers=citizen).json()["status"] == "forwarded"
    decision = client.patch(official, headers=admin_headers, json={"status": "verified"})
    assert decision.status_code == 200, decision.text
    assert client.get(f"{path}/{code}", headers=citizen).json()["status"] == "verified"
    incident = decision.json()["report"]["incident_id"]
    assert client.patch(f"/api/incidents/{incident}", headers=admin_headers, json={"status": "resolved"}).status_code == 200
    assert client.get(f"{path}/{code}", headers=citizen).json()["status"] == "closed"

    photo = io.BytesIO()
    Image.new("RGB", (8, 8)).save(photo, "PNG")
    photo_key = {"submission_key": str(uuid4())}
    attached = client.post(path, headers=citizen, data={**fields, **photo_key, "description": "Optional note"},
                           files={"image": ("evidence.png", photo.getvalue(), "image/png")})
    assert attached.status_code == 201, attached.text
    photo_ref = attached.json()["reference_code"]
    photo_route = f"{path}/{photo_ref}/evidence"
    assert client.get(photo_route, headers=other).status_code == 404
    assert client.get(photo_route).status_code == 401
    evidence = client.get(photo_route, headers=citizen)
    assert evidence.content == photo.getvalue()
    assert "no-store" in evidence.headers["cache-control"]
    assert client.post("/api/citizen/report-receipt", headers=citizen, data=photo_key).json() == attached.json()
    assert client.post("/api/citizen/sign-out", headers=citizen).status_code == 200
    assert client.get(f"{path}/{photo_ref}", headers=citizen).status_code == 401
    assert client.get(photo_route, headers=citizen).status_code == 401
    assert client.post("/api/citizen/report-receipt", headers=citizen, data=photo_key).status_code == 401
    other = bearer(verify(client, "9876500143"))
    assert client.get(path, headers=other).json()["items"] == []
    assert client.get(f"{path}/{photo_ref}", headers=other).status_code == 404
    assert client.get(photo_route, headers=other).status_code == 404
    assert client.post("/api/citizen/report-receipt", headers=other, data=photo_key).status_code == 404
    assert client.post("/api/citizen/sign-out", headers=other).status_code == 200
    returning = bearer(verify(client, "9876500142"))
    assert client.get("/api/citizen/profile", headers=returning).json()["name"] == "New name"
    assert {item["reference_code"] for item in client.get(path, headers=returning).json()["items"]} == {code, photo_ref}


@pytest.mark.parametrize("phone", ["", "5123456789", "123456789", "987654321", "98765432100", "+12025550141",
                                  "02223456789", "2223456789", "+919876543210", "98765 43210", "987654321a",
                                  "987654321!", "९८७६५४३२१०", "9876543210\n"])
def test_invalid_phone_is_rejected(client, dev_otp, phone):
    response = verify(client, phone, name="Test observer")
    assert response.status_code == 400
    assert response.json()["detail"] == "Enter 10 digits starting with 6, 7, 8 or 9."
    assert client.post("/api/citizen/validate-phone", json={"phone": phone}).status_code == 400


@pytest.mark.parametrize("landline", ["8023456789", "7923456789", "6123456789", "7123456789"])
def test_landline_with_mobile_prefix_is_rejected(client, dev_otp, landline):
    response = verify(client, landline, name="Test observer")
    assert response.status_code == 400
    assert response.json()["detail"] == "Enter an Indian mobile number."
    assert client.post("/api/citizen/validate-phone", json={"phone": landline}).status_code == 400


@pytest.mark.parametrize("prefix", "6789")
def test_accepted_prefixes(client, dev_otp, prefix):
    phone = prefix + "401235670"
    response = verify(client, phone, name="Test observer")
    assert response.status_code == 200, response.text
    assert response.json()["profile"]["phone"] == "+91" + phone


def test_concurrent_verification_returns_one_account(client, dev_otp):
    start = Barrier(6)

    def login():
        start.wait(timeout=5)
        return verify(client, "9876500144", name="Concurrent observer")

    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: login(), range(6)))
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()["profile"]["id"] for response in responses}) == 1
    assert len({response.json()["token"] for response in responses}) == 6


def test_expired_cookie_revocation_and_expected_account(client, dev_otp):
    first = verify(client, "9876500145", name="First citizen", transport="cookie")
    first_id = first.json()["profile"]["id"]
    old_cookie = client.cookies.get("forest_guard_citizen")
    try:
        second = verify(client, "9876500146", name="Second citizen", transport="cookie")
        assert second.status_code == 200
        assert client.get("/api/citizen/profile", headers={"Authorization": f"Bearer {old_cookie}"}).status_code == 401
        old_account = {"X-Citizen-Account": str(first_id)}
        assert client.get("/api/citizen/profile", headers=old_account).status_code == 401
        assert client.post("/api/citizen/sign-out", headers=old_account).status_code == 401
        assert client.get("/api/citizen/profile").json() == second.json()["profile"]
        with SessionLocal.begin() as db:
            session = db.query(CitizenSession).filter_by(citizen_id=second.json()["profile"]["id"]).one()
            session.expires_at = utcnow() - timedelta(seconds=1)
        expired = client.get("/api/citizen/profile")
        assert expired.status_code == 401
        assert "no-store" in expired.headers["cache-control"]
        assert client.post("/api/citizen/sign-out").json() == {"signed_out": True}
        assert not client.cookies.get("forest_guard_citizen")
        assert client.post("/api/citizen/sign-out").json() == {"signed_out": True}
    finally:
        client.cookies.clear()
