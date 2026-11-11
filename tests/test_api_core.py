from __future__ import annotations


def test_health_and_meta(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    payload = health.json()
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"
    assert payload["demo_mode"] is True

    meta = client.get("/api/meta").json()
    assert meta["project"]["name"] == "Forest Guard AI"
    assert len(meta["supported_species"]) == 6
    assert meta["demo"]["mode"] is True
    assert meta["study_area"]["type"] == "FeatureCollection"


def test_login_success_and_failure(client, admin_headers):
    assert admin_headers["Authorization"].startswith("Bearer ")

    wrong = client.post(
        "/api/auth/login",
        json={"email": "admin@forestguard.ai", "password": "not-the-password"},
    )
    assert wrong.status_code == 401

    me = client.get("/api/auth/me", headers=admin_headers)
    assert me.status_code == 200
    assert me.json()["user"]["role"] == "admin"
    assert me.json()["user"]["guard"] is None


def test_protected_endpoints_require_authentication(client):
    for path in ("/api/overview", "/api/detections", "/api/analytics", "/api/guard/dashboard"):
        response = client.get(path)
        assert response.status_code == 401, path


def test_seed_registry_counts(client, admin_headers):
    cameras = client.get("/api/cameras", headers=admin_headers).json()
    assert cameras["summary"]["total"] == 12
    assert cameras["summary"]["online"] + cameras["summary"]["maintenance"] + cameras["summary"]["offline"] == 12

    villages = client.get("/api/villages", headers=admin_headers).json()
    assert len(villages["items"]) == 5
    assert all(village["boundary"] for village in villages["items"])

    guards = client.get("/api/guards", headers=admin_headers).json()
    assert len(guards["items"]) == 6
    assert len({guard["badge_id"] for guard in guards["items"]}) == 6


def test_detection_history_filtering_and_detail(client, admin_headers):
    listing = client.get("/api/detections", params={"page_size": 5}, headers=admin_headers).json()
    assert len(listing["items"]) == 5
    assert listing["pagination"]["total"] >= 230
    assert listing["pagination"]["page_size"] == 5

    tigers = client.get("/api/detections", params={"species": "tiger", "page_size": 10}, headers=admin_headers).json()
    assert tigers["items"]
    assert {item["species"] for item in tigers["items"]} == {"tiger"}

    detail = client.get(f"/api/detections/{tigers['items'][0]['id']}", headers=admin_headers).json()
    assert len(detail["detection"]["bbox"]) == 4
    assert 0 <= detail["risk"]["score"] <= 100
    assert detail["risk"]["basis"] in {"proximity", "confirmed_movement"}
    assert "synthetic" in detail["disclaimer"].lower() or "demonstration" in detail["disclaimer"].lower()


def test_map_layers_payload(client, admin_headers):
    layers = client.get("/api/map/layers", params={"days": 45}, headers=admin_headers)
    assert layers.status_code == 200
    data = layers.json()
    assert data["study_area"]["type"] == "FeatureCollection"
    assert len(data["villages"]) == 5
    assert len(data["cameras"]) == 12
    assert data["risk_zones"]["type"] == "FeatureCollection"
    assert data["risk_zones"]["features"]
    assert data["tracks"]
    assert data["detections"]
    assert data["risk"]["alert_radius_km"] > 0

    high_only = client.get(
        "/api/map/layers", params={"risk": "high", "days": 45}, headers=admin_headers
    ).json()
    assert {item["risk_level"] for item in high_only["detections"]} <= {"high"}


def test_tracks_are_inferred_not_gps(client, admin_headers):
    tracks = client.get("/api/tracks", headers=admin_headers).json()
    assert tracks["total"] >= 10
    assert "GPS" in tracks["disclaimer"]
    for track in tracks["items"]:
        assert len(track["points"]) >= 3
        assert track["direction"] in {"toward_village", "away_from_village", "parallel", "unknown"}


def test_ai_status_and_demo_upload_is_refused(client, admin_headers):
    status = client.get("/api/ai/status", headers=admin_headers).json()
    assert status["mode"] == "demo"
    assert status["loaded"] is False

    before = client.get("/api/detections", params={"page_size": 1}, headers=admin_headers).json()
    upload = client.post(
        "/api/detections/upload",
        files={"file": ("frame.png", b"\x89PNG\r\n\x1a\n-not-a-real-image", "image/png")},
        headers=admin_headers,
    )
    assert upload.status_code == 503
    assert "demo" in upload.json()["detail"].lower()
    after = client.get("/api/detections", params={"page_size": 1}, headers=admin_headers).json()
    assert after["pagination"]["total"] == before["pagination"]["total"]


def test_analytics_csv_export(client, admin_headers):
    response = client.get("/api/analytics/export", params={"days": 30}, headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "forest_guard_detections_30d.csv" in response.headers["content-disposition"]
    lines = response.text.strip().splitlines()
    assert lines[0].startswith("detection_id,species,species_name")
    assert "risk_basis" in lines[0]
    assert len(lines) > 50
