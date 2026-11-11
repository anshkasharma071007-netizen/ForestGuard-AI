from __future__ import annotations

import re


def test_admin_guard_dashboard_is_dispatch_view(client, admin_headers):
    board = client.get("/api/guard/dashboard", headers=admin_headers).json()
    assert board["view"] == "dispatch"
    assert board["guard"] is None
    assert board["zone_alerts"]
    assert len(board["guards"]) == 6
    assert board["summary"]["open_tasks"] == len(board["zone_alerts"])
    assert board["summary"]["guards_on_patrol"] >= 1
    assert board["recent_detections"]
    assert all("open_tasks" in guard for guard in board["guards"])


def test_guard_profile_dashboard_is_scoped(client, guard_headers):
    board = client.get("/api/guard/dashboard", headers=guard_headers).json()
    assert board["view"] == "guard"
    assert board["guard"]["badge_id"] == "G-101"
    assert board["guard"]["email"] == "guard@forestguard.ai"
    assert board["assigned_alerts"]
    assert all(
        alert["assigned_guard"] and alert["assigned_guard"]["id"] == board["guard"]["id"]
        for alert in board["assigned_alerts"]
    )
    assert len(board["recent_detections"]) <= 10
    assert board["open_incidents"]
    assert "proximity" in board["task_note"]


def test_admin_can_inspect_any_guard_board(client, admin_headers):
    guards = client.get("/api/guards", headers=admin_headers).json()["items"]
    target = guards[0]
    board = client.get(
        "/api/guard/dashboard", params={"guard_id": target["id"]}, headers=admin_headers
    ).json()
    assert board["view"] == "guard"
    assert board["guard"]["id"] == target["id"]


def test_community_advisories_are_sanitized(client):
    advisories = client.get("/api/community/alerts", params={"days": 21}).json()
    assert advisories["items"]
    assert "omit" in advisories["note"]
    forbidden = {"lat", "lon", "latitude", "longitude", "camera_code", "camera_id", "detection_id"}
    for item in advisories["items"]:
        assert not forbidden & set(item)
        assert item["area_label"]
        assert item["village_names"]
        assert item["is_simulated"] is True
        assert item["note"].startswith("Location detail is intentionally coarse")


def test_community_summary_and_villages_do_not_publish_coordinates(client):
    summary = client.get("/api/community/summary").json()
    assert summary["active_advisories"] >= 1
    assert summary["villages_covered"] == 5
    assert summary["helplines"]["forest_control_room"]
    assert summary["latest_advisories"]
    assert all("lat" not in village and "lon" not in village for village in summary["villages"])

    villages = client.get("/api/community/villages").json()
    assert len(villages["items"]) == 5
    assert all("coordinates are not published" in villages["note"].lower() for _ in [0])


def test_community_report_round_trip(client):
    response = client.post(
        "/api/community/reports",
        data={
            "category": "sighting",
            "species": "leopard",
            "description": "Leopard seen at dusk near the cattle shed, moving away from homes.",
            "reporter_name": "Automated Test Reporter",
            "village_code": "V-TUR",
            "contact": "test@example.com",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    reference = payload["reference_code"]
    assert re.fullmatch(r"FG-\d{4}-\d{4}", reference)
    assert payload["status"] == "pending"

    status = client.get(f"/api/community/reports/{reference}")
    assert status.status_code == 200
    report = status.json()
    assert report["reference_code"] == reference
    assert report["species_name"] == "Indian leopard"
    assert report["village_name"] == "Turia"
    assert report["status"] == "pending"
    assert "queued" in report["status_note"].lower()

    assert client.get("/api/community/reports/FG-0000-0000").status_code == 404


def test_community_report_validation(client):
    short = client.post(
        "/api/community/reports",
        data={"description": "too short", "reporter_name": "Tester"},
    )
    assert short.status_code == 400

    bad_species = client.post(
        "/api/community/reports",
        data={
            "species": "dragon",
            "description": "A dragon was seen near the village well at midnight.",
            "reporter_name": "Tester",
        },
    )
    assert bad_species.status_code == 400

    bad_category = client.post(
        "/api/community/reports",
        data={
            "category": "attack",
            "description": "A leopard was seen near the village well at midnight.",
            "reporter_name": "Tester",
        },
    )
    assert bad_category.status_code == 400


def test_community_guidelines_are_present(client):
    guidelines = client.get("/api/community/guidelines").json()
    assert len(guidelines["general"]) >= 5
    assert guidelines["emergency"]
    assert guidelines["species"]
    assert guidelines["source_note"]


def test_incidents_and_reports_are_guard_only(client, admin_headers):
    assert client.get("/api/incidents").status_code == 401
    incidents = client.get("/api/incidents", headers=admin_headers).json()
    assert incidents["items"]
    verified = [item for item in incidents["items"] if item["status"] == "verified"]
    assert verified
    assert verified[0]["verified"] is True
    assert verified[0]["village_name"]

    reports = client.get("/api/reports", headers=admin_headers).json()
    assert reports["items"]
    assert reports["items"][0]["status"] in {"pending", "forwarded", "closed"}
