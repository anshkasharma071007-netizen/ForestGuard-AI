from __future__ import annotations

import math
from datetime import timedelta

import pytest

from geospatial.mapping import (
    circle_ring,
    haversine_km,
    point_in_polygon,
    polygon_ring,
)
from geospatial.risk_analysis import RiskSettings, risk_level, score_detection, utcnow


def test_haversine_known_distance():
    assert haversine_km(21.7, 79.3, 21.7, 79.3) == pytest.approx(0.0, abs=1e-9)
    one_degree = haversine_km(0.0, 0.0, 0.0, 1.0)
    assert one_degree == pytest.approx(111.19, abs=0.2)
    assert haversine_km(21.7, 79.3, 21.8, 79.4) == pytest.approx(
        haversine_km(21.8, 79.4, 21.7, 79.3), rel=1e-9
    )


def test_point_in_polygon_and_circle_ring():
    ring = circle_ring(21.7, 79.3, 2.0, points=32)
    assert len(ring) == 33
    assert ring[0] == ring[-1]
    assert point_in_polygon(21.7, 79.3, ring)
    assert not point_in_polygon(22.2, 79.3, ring)
    assert polygon_ring({"type": "Polygon", "coordinates": [ring]}) == ring


def test_risk_level_threshold_boundaries():
    thresholds = {"moderate": 35, "high": 65}
    assert risk_level(0, thresholds) == "low"
    assert risk_level(34.9, thresholds) == "low"
    assert risk_level(35, thresholds) == "moderate"
    assert risk_level(64.9, thresholds) == "moderate"
    assert risk_level(65, thresholds) == "high"
    assert risk_level(100, thresholds) == "high"


def test_risk_score_is_explainable_and_bounded():
    settings = RiskSettings()
    village = {
        "id": 1,
        "name": "Turia",
        "lat": 21.7095,
        "lon": 79.3415,
        "boundary_ring": circle_ring(21.7095, 79.3415, 3.0, points=24),
    }
    now = utcnow()
    result = score_detection(
        species="tiger",
        lat=21.7095,
        lon=79.3415,
        detected_at=now - timedelta(hours=2),
        villages=[village],
        incidents=[
            {
                "lat": 21.7095,
                "lon": 79.3415,
                "created_at": now - timedelta(days=2),
                "verified": True,
                "species": "tiger",
            }
        ],
        prior_detections=[],
        track_direction="toward_village",
        settings=settings,
    )
    assert 0 <= result["score"] <= 100
    assert result["level"] in {"low", "moderate", "high"}
    assert result["basis"] in {"proximity", "confirmed_movement"}
    assert result["nearest_village_name"] == "Turia"
    assert result["distance_km"] == pytest.approx(0.0, abs=1e-6)
    component_keys = {component["key"] for component in result["components"]}
    assert component_keys == {"proximity", "recency", "frequency", "incident", "movement"}
    assert sum(component["points"] for component in result["components"]) == pytest.approx(
        result["score"], abs=0.2
    )
    assert result["reason"]

    far = score_detection(
        species="deer",
        lat=21.9,
        lon=79.6,
        detected_at=now - timedelta(days=20),
        villages=[village],
        incidents=[],
        prior_detections=[],
        track_direction=None,
        settings=settings,
    )
    assert far["score"] < result["score"]
    assert far["nearest_village_name"] == "Turia"
    assert far["distance_km"] > 20


def test_weights_sum_to_one():
    weights = RiskSettings().weights
    assert set(weights) == {"proximity", "recency", "frequency", "incident", "movement"}
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-9)
    assert all(0 <= value <= 1 for value in weights.values())
