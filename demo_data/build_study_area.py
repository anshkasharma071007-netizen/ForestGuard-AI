"""Build the illustrative demo study area GeoJSON and default risk config.

Run from the repository root:
    python demo_data/build_study_area.py

The geometry is a simplified, illustrative landscape around the Pench Tiger
Reserve landscape (Seoni / Balaghat, Madhya Pradesh). It is NOT an official
forest-department boundary and must not be used for management decisions.
Village locations are approximate; village polygons are deliberately
generalised for demonstration.
"""
from __future__ import annotations

import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_GEO = os.path.join(ROOT, "geospatial", "geojson", "study_area.geojson")
OUT_CONFIG = os.path.join(ROOT, "demo_data", "risk_config.json")

# Approximate landscape boundary around the Pench landscape (lon, lat).
FOREST_RING = [
    [79.226, 21.700],
    [79.238, 21.662],
    [79.282, 21.643],
    [79.341, 21.637],
    [79.402, 21.651],
    [79.447, 21.681],
    [79.467, 21.730],
    [79.458, 21.778],
    [79.430, 21.815],
    [79.378, 21.838],
    [79.315, 21.837],
    [79.265, 21.812],
    [79.232, 21.766],
    [79.226, 21.700],
]

CORE_RING = [
    [79.283, 21.716],
    [79.341, 21.699],
    [79.402, 21.721],
    [79.424, 21.771],
    [79.389, 21.806],
    [79.324, 21.802],
    [79.280, 21.766],
    [79.283, 21.716],
]

VILLAGES = [
    {
        "id": "V-TUR",
        "name": "Turia",
        "lat": 21.7065,
        "lon": 79.3400,
        "population": 420,
        "radius_deg": 0.0072,
        "households": 96,
        "note": "Southern buffer village near the Turia gate; livestock rearing and tourism livelihoods.",
    },
    {
        "id": "V-KOH",
        "name": "Kohka",
        "lat": 21.6880,
        "lon": 79.3150,
        "population": 680,
        "radius_deg": 0.0085,
        "households": 151,
        "note": "Agriculture-dominated settlement along the south-western buffer.",
    },
    {
        "id": "V-AWA",
        "name": "Awarghani",
        "lat": 21.7520,
        "lon": 79.2890,
        "population": 350,
        "radius_deg": 0.0065,
        "households": 82,
        "note": "Western buffer hamlet with a seasonal stream and cattle paths into the forest.",
    },
    {
        "id": "V-SIL",
        "name": "Sillari",
        "lat": 21.7890,
        "lon": 79.4140,
        "population": 540,
        "radius_deg": 0.0080,
        "households": 121,
        "note": "Eastern settlement close to a known elephant movement corridor.",
    },
    {
        "id": "V-PIP",
        "name": "Piparia",
        "lat": 21.6720,
        "lon": 79.3800,
        "population": 760,
        "radius_deg": 0.0090,
        "households": 168,
        "note": "Southern agricultural village adjoining the landscape boundary.",
    },
]


def irregular_ring(lat: float, lon: float, radius_deg: float, seed: int, points: int = 11) -> list[list[float]]:
    rng = random.Random(seed)
    ring = []
    for i in range(points):
        angle = 2 * math.pi * i / points
        r = radius_deg * (0.78 + rng.random() * 0.38)
        # Longitude degrees are shorter than latitude degrees at this latitude.
        ring.append([
            round(lon + math.cos(angle) * r / math.cos(math.radians(lat)), 6),
            round(lat + math.sin(angle) * r, 6),
        ])
    ring.append(ring[0])
    return ring


def feature(geometry: dict, props: dict) -> dict:
    return {"type": "Feature", "geometry": geometry, "properties": props}


def main() -> None:
    os.makedirs(os.path.dirname(OUT_GEO), exist_ok=True)
    os.makedirs(os.path.dirname(OUT_CONFIG), exist_ok=True)

    features = [
        feature(
            {"type": "Polygon", "coordinates": [FOREST_RING]},
            {
                "id": "landscape",
                "layer": "landscape",
                "name": "Pench landscape — demo study area",
                "kind": "Illustrative landscape boundary",
                "disclaimer": "Simplified demonstration geometry; not an official forest-department boundary.",
            },
        ),
        feature(
            {"type": "Polygon", "coordinates": [CORE_RING]},
            {
                "id": "core",
                "layer": "core",
                "name": "Core habitat (illustrative)",
                "kind": "Illustrative core zone",
                "disclaimer": "Generalised for demonstration only.",
            },
        ),
    ]

    for index, village in enumerate(VILLAGES):
        ring = irregular_ring(village["lat"], village["lon"], village["radius_deg"], seed=100 + index)
        features.append(
            feature(
                {"type": "Polygon", "coordinates": [ring]},
                {
                    "id": village["id"],
                    "layer": "village",
                    "name": village["name"],
                    "population": village["population"],
                    "households": village["households"],
                    "lat": village["lat"],
                    "lon": village["lon"],
                    "note": village["note"],
                    "disclaimer": "Approximate village location and generalised boundary for demonstration.",
                },
            )
        )

    payload = {
        "type": "FeatureCollection",
        "name": "Forest Guard AI demo study area",
        "metadata": {
            "region": "Pench landscape, Madhya Pradesh, India",
            "crs": "EPSG:4326",
            "disclaimer": (
                "Illustrative geometries generated for a hackathon demonstration. Not an official "
                "forest boundary, village boundary, or wildlife observation dataset."
            ),
            "attribution": "Forest Guard AI demo data · basemap © OpenStreetMap contributors",
        },
        "features": features,
    }
    with open(OUT_GEO, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    print("wrote", OUT_GEO, len(features), "features")

    config = {
        "influence_radius_km": 6.0,
        "alert_radius_km": 3.5,
        "alert_threshold": 60.0,
        "thresholds": {"moderate": 35.0, "high": 65.0},
        "weights": {
            "proximity": 0.55,
            "recency": 0.15,
            "frequency": 0.12,
            "incident": 0.10,
            "movement": 0.08,
        },
        "species_weights": {
            "tiger": 1.0,
            "leopard": 0.86,
            "elephant": 0.9,
            "deer": 0.18,
            "wild_boar": 0.52,
            "sloth_bear": 0.8,
        },
        "frequency_radius_km": 5.0,
        "frequency_window_days": 7,
        "frequency_target": 8,
        "incident_radius_km": 5.0,
        "incident_window_days": 30,
        "incident_target": 3,
        "recency_halflife_days": 10.0,
        "zone_cell_deg": 0.0075,
        "zone_window_days": 21,
        "zone_detection_radius_km": 3.0,
        "zone_min_score": 25.0,
        "notes": "Edit via the Risk & Alerts page (admin) or this file. Scores are prioritisation aids, not predictions.",
    }
    with open(OUT_CONFIG, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
    print("wrote", OUT_CONFIG)


if __name__ == "__main__":
    main()
