from __future__ import annotations

import pytest


def test_analytics_aggregates(client, admin_headers):
    analytics = client.get("/api/analytics", params={"days": 30}, headers=admin_headers)
    assert analytics.status_code == 200
    data = analytics.json()
    assert data["window_days"] == 30
    assert data["totals"]["detections"] > 0
    assert len(data["species"]) == 6
    assert set(data["risk_distribution"]) == {"low", "moderate", "high"}
    assert sum(data["risk_distribution"].values()) == data["totals"]["detections"]
    assert data["risk_distribution"]["high"] <= data["totals"]["detections"]
    assert "synthetic" in data["note"].lower()
    assert data["timeline"]


def test_risk_zones_and_village_exposure(client, admin_headers):
    zones = client.get("/api/risk/zones", params={"days": 21}, headers=admin_headers).json()
    assert zones["summary"]["cells"] == len(zones["zones"]["features"])
    assert zones["summary"]["cells"] > 0
    assert len(zones["villages"]) == 5
    assert all("level" in village and "max_score" in village for village in zones["villages"])
    assert "gridded risk" in zones["method"]
    levels = {zone["properties"]["level"] for zone in zones["zones"]["features"]}
    assert levels <= {"low", "moderate", "high"}


def test_risk_config_rbac_and_admin_update(client, admin_headers, guard_headers, monkeypatch, tmp_path):
    config = client.get("/api/risk/config", headers=guard_headers)
    assert config.status_code == 200
    assert config.json()["settings"]["weights"]["proximity"] == pytest.approx(0.55)

    denied = client.patch("/api/risk/config", json={"alert_threshold": 58}, headers=guard_headers)
    assert denied.status_code == 403

    monkeypatch.setattr("backend.config.RISK_CONFIG_PATH", str(tmp_path / "risk_config.json"))
    patched = client.patch("/api/risk/config", json={"alert_threshold": 58}, headers=admin_headers)
    assert patched.status_code == 200
    assert patched.json()["settings"]["alert_threshold"] == pytest.approx(58.0)

    restored = client.post("/api/risk/config/reset", headers=admin_headers)
    assert restored.status_code == 200
    assert restored.json()["settings"]["alert_threshold"] == pytest.approx(60.0)


def test_full_alert_lifecycle_is_audited(client, admin_headers):
    listing = client.get(
        "/api/alerts", params={"status": "active", "limit": 50}, headers=admin_headers
    ).json()
    assert listing["items"], "seed should contain open alerts"
    alert = listing["items"][0]
    alert_id = alert["id"]
    assert alert["is_simulated"] is True
    assert alert["village_names"]
    assert 0 <= alert["score"] <= 100

    ack = client.post(
        f"/api/alerts/{alert_id}/acknowledge",
        json={"note": "Acknowledged during automated test."},
        headers=admin_headers,
    )
    assert ack.status_code == 200
    assert ack.json()["alert"]["status"] == "acknowledged"

    guards = client.get("/api/guards", headers=admin_headers).json()["items"]
    assigned = client.post(
        f"/api/alerts/{alert_id}/assign",
        json={"guard_id": guards[0]["id"]},
        headers=admin_headers,
    )
    assert assigned.status_code == 200
    assert assigned.json()["alert"]["assigned_guard"]["id"] == guards[0]["id"]

    responding = client.post(f"/api/alerts/{alert_id}/respond", json={}, headers=admin_headers)
    assert responding.status_code == 200
    assert responding.json()["alert"]["status"] == "responding"

    resolved = client.post(
        f"/api/alerts/{alert_id}/resolve",
        json={"note": "Closed after field verification in test."},
        headers=admin_headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["alert"]["status"] == "resolved"
    assert resolved.json()["alert"]["resolved_at"]

    detail = client.get(f"/api/alerts/{alert_id}", headers=admin_headers).json()["alert"]
    kinds = [event["kind"] for event in detail["events"]]
    assert {"acknowledged", "assigned", "responding", "resolved"} <= set(kinds)
    assert all(event["actor"] for event in detail["events"])

    again = client.post(f"/api/alerts/{alert_id}/acknowledge", json={}, headers=admin_headers)
    assert again.status_code == 400


def test_alert_filters(client, admin_headers):
    high = client.get(
        "/api/alerts", params={"severity": "high", "limit": 100}, headers=admin_headers
    ).json()
    assert high["items"]
    assert {alert["severity"] for alert in high["items"]} == {"high"}

    missing = client.get("/api/alerts/999999", headers=admin_headers)
    assert missing.status_code == 404
