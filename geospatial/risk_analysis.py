"""Configurable, explainable geospatial risk scoring.

The score is an *indicative prioritisation aid*, not a predictive model of
animal movement. It combines proximity to a village boundary, species
severity, recent activity, verified incidents, and — only when supported by a
camera-sequence track — inferred direction of travel. Proximity-only risk is
labelled separately from movement-supported risk throughout the UI.
"""
from __future__ import annotations

import copy
import json
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterable, Sequence

from .mapping import (
    distance_to_polygon_km,
    haversine_km,
    polygon_feature,
    polygon_ring,
)
from .species import SPECIES, species_meta

DEFAULT_SETTINGS: dict = {
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
    "species_weights": {key: meta["risk_weight"] for key, meta in SPECIES.items() if key != "unidentified"},
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
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _aware_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


@dataclass
class RiskSettings:
    data: dict = field(default_factory=lambda: copy.deepcopy(DEFAULT_SETTINGS))

    @classmethod
    def load(cls, path: str | None = None) -> "RiskSettings":
        settings = cls()
        if not path:
            return settings
        try:
            with open(path, "r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            merged = copy.deepcopy(DEFAULT_SETTINGS)
            for key, value in loaded.items():
                if isinstance(value, dict) and isinstance(merged.get(key), dict):
                    merged[key].update(value)
                else:
                    merged[key] = value
            settings.data = merged
        except (OSError, ValueError):
            pass
        return settings

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh, indent=2)

    def to_dict(self) -> dict:
        return copy.deepcopy(self.data)

    def update(self, patch: dict) -> dict:
        for key, value in patch.items():
            if value is None:
                continue
            if isinstance(value, dict) and isinstance(self.data.get(key), dict):
                for sub_key, sub_value in value.items():
                    if sub_key in self.data[key] and sub_value is not None:
                        self.data[key][sub_key] = float(sub_value)
            elif key in self.data:
                if isinstance(self.data[key], (int, float)):
                    self.data[key] = float(value)
                else:
                    self.data[key] = value
        return self.to_dict()

    # Convenience accessors
    @property
    def thresholds(self) -> dict:
        return self.data["thresholds"]

    @property
    def weights(self) -> dict:
        return self.data["weights"]

    @property
    def species_weights(self) -> dict:
        return self.data["species_weights"]


def risk_level(score: float, thresholds: dict | None = None) -> str:
    thresholds = thresholds or DEFAULT_SETTINGS["thresholds"]
    if score >= thresholds["high"]:
        return "high"
    if score >= thresholds["moderate"]:
        return "moderate"
    return "low"


def _nearest_village(lat: float, lon: float, villages: Iterable[dict]) -> tuple[dict | None, float]:
    best: dict | None = None
    best_distance = float("inf")
    for village in villages:
        ring = village.get("boundary_ring")
        if ring is None:
            geo = village.get("boundary_geojson") or village.get("boundary")
            ring = polygon_ring(geo) if geo else []
        distance = distance_to_polygon_km(lat, lon, ring) if ring else haversine_km(
            lat, lon, float(village["lat"]), float(village["lon"])
        )
        if distance < best_distance:
            best, best_distance = village, distance
    return best, best_distance


def _frequency(
    species: str,
    lat: float,
    lon: float,
    detected_at: datetime,
    prior: Iterable[dict],
    settings: RiskSettings,
) -> int:
    count = 0
    radius = settings.data["frequency_radius_km"]
    window = timedelta(days=settings.data["frequency_window_days"])
    for item in prior:
        if item.get("species") != species:
            continue
        when = _aware_naive(item["detected_at"])
        if when > detected_at or when < detected_at - window:
            continue
        if haversine_km(lat, lon, float(item["lat"]), float(item["lon"])) <= radius:
            count += 1
    return count


def _verified_incidents(
    lat: float,
    lon: float,
    detected_at: datetime,
    incidents: Iterable[dict],
    settings: RiskSettings,
) -> int:
    count = 0
    radius = settings.data["incident_radius_km"]
    window = timedelta(days=settings.data["incident_window_days"])
    for incident in incidents:
        if not incident.get("verified"):
            continue
        when = _aware_naive(incident["created_at"])
        if when > detected_at or when < detected_at - window:
            continue
        if haversine_km(lat, lon, float(incident["lat"]), float(incident["lon"])) <= radius:
            count += 1
    return count


def score_detection(
    *,
    species: str,
    lat: float,
    lon: float,
    detected_at: datetime,
    villages: Sequence[dict],
    incidents: Sequence[dict] = (),
    prior_detections: Sequence[dict] = (),
    track_direction: str | None = None,
    settings: RiskSettings | None = None,
    now: datetime | None = None,
) -> dict:
    """Return score, level, explainable components, and nearest village."""
    settings = settings or RiskSettings()
    now = _aware_naive(now or utcnow())
    detected_at = _aware_naive(detected_at)
    meta = species_meta(species)
    species_key = species if species in settings.species_weights else "unidentified"
    species_weight = float(settings.species_weights.get(species_key, meta["risk_weight"]))

    village, distance_km = _nearest_village(lat, lon, villages)
    influence = max(float(settings.data["influence_radius_km"]), 0.1)
    proximity = max(0.0, min(1.0, 1.0 - distance_km / influence))

    age_days = max(0.0, (now - detected_at).total_seconds() / 86400.0)
    halflife = max(float(settings.data["recency_halflife_days"]), 0.1)
    recency = math.exp(-math.log(2) * age_days / halflife)

    freq = _frequency(species, lat, lon, detected_at, prior_detections, settings)
    frequency = min(1.0, freq / max(float(settings.data["frequency_target"]), 1.0))

    incident_count = _verified_incidents(lat, lon, detected_at, incidents, settings)
    incident = min(1.0, incident_count / max(float(settings.data["incident_target"]), 1.0))

    movement = 0.0
    if track_direction == "toward_village" and distance_km <= influence:
        movement = 1.0

    weights = settings.weights
    values = {
        "proximity": proximity,
        "recency": recency,
        "frequency": frequency,
        "incident": incident,
        "movement": movement,
    }
    labels = {
        "proximity": ("Distance to village boundary", f"{distance_km:.1f} km"),
        "recency": ("Recency of detection", f"{age_days:.1f} days ago"),
        "frequency": ("Recent same-species activity", f"{freq} detections / 7 days"),
        "incident": ("Verified incidents nearby", f"{incident_count} incidents / 30 days"),
        "movement": ("Inferred movement toward village", "camera sequence" if movement else "not established"),
    }
    components = []
    total = 0.0
    for key in ["proximity", "recency", "frequency", "incident", "movement"]:
        contribution = 100.0 * float(weights.get(key, 0.0)) * values[key] * species_weight
        total += contribution
        components.append(
            {
                "key": key,
                "label": labels[key][0],
                "detail": labels[key][1],
                "weight": float(weights.get(key, 0.0)),
                "value": round(values[key], 3),
                "points": round(contribution, 1),
            }
        )

    score = round(min(100.0, max(0.0, total)), 1)
    level = risk_level(score, settings.thresholds)

    if movement and distance_km <= influence:
        basis = "confirmed_movement"
        basis_label = "Movement-supported (camera sequence)"
    elif proximity >= 0.35:
        basis = "proximity"
        basis_label = "Proximity-based"
    elif proximity > 0:
        basis = "buffer_proximity"
        basis_label = "Buffer proximity"
    else:
        basis = "core_activity"
        basis_label = "Core-zone activity"

    if village:
        reason = (
            f"{meta['name']} detected {distance_km:.1f} km from {village['name']} boundary. "
            f"{freq} same-species detections nearby in the previous 7 days; "
            f"{incident_count} verified incidents in the previous 30 days."
        )
        if movement:
            reason += f" Camera sequence indicates movement toward {village['name']} (inferred, not GPS)."
    else:
        reason = f"{meta['name']} detected outside mapped village influence zones."

    return {
        "score": score,
        "level": level,
        "basis": basis,
        "basis_label": basis_label,
        "species_weight": round(species_weight, 3),
        "nearest_village_id": village["id"] if village else None,
        "nearest_village_name": village["name"] if village else None,
        "distance_km": round(distance_km, 2),
        "components": components,
        "reason": reason,
        "activity_7d": freq,
        "incidents_30d": incident_count,
        "movement_supported": bool(movement),
    }


def villages_within_radius(
    lat: float, lon: float, villages: Sequence[dict], radius_km: float
) -> list[dict]:
    out = []
    for village in villages:
        ring = village.get("boundary_ring") or polygon_ring(
            village.get("boundary_geojson") or village.get("boundary") or {}
        )
        distance = distance_to_polygon_km(lat, lon, ring) if ring else haversine_km(
            lat, lon, float(village["lat"]), float(village["lon"])
        )
        if distance <= radius_km:
            out.append({**village, "distance_km": round(distance, 2)})
    return sorted(out, key=lambda item: item["distance_km"])


def build_risk_zones(
    detections: Sequence[dict],
    villages: Sequence[dict],
    settings: RiskSettings | None = None,
    *,
    bbox: tuple[float, float, float, float] | None = None,
    now: datetime | None = None,
) -> dict:
    """Return a GeoJSON FeatureCollection of gridded indicative risk cells.

    Cells are coloured by the strongest recent detection signal near a
    village, plus a small village-exposure term. Empty core cells are omitted
    so the layer does not imply continuous animal tracking.
    """
    settings = settings or RiskSettings()
    now = _aware_naive(now or utcnow())
    window = timedelta(days=settings.data["zone_window_days"])
    radius = float(settings.data["zone_detection_radius_km"])
    cell = float(settings.data["zone_cell_deg"])

    recent = []
    for det in detections:
        when = _aware_naive(det["detected_at"])
        if when < now - window:
            continue
        recent.append(
            {
                **det,
                "when": when,
                "lat": float(det["lat"]),
                "lon": float(det["lon"]),
                "score": float(det.get("risk_score", 0.0)),
            }
        )

    if bbox is None:
        if villages:
            lats = [float(v["lat"]) for v in villages]
            lons = [float(v["lon"]) for v in villages]
            pad = 0.08
            bbox = (min(lats) - pad, min(lons) - pad, max(lats) + pad, max(lons) + pad)
        else:
            return {"type": "FeatureCollection", "features": []}

    min_lat, min_lon, max_lat, max_lon = bbox
    features = []
    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            center_lat, center_lon = lat + cell / 2, lon + cell / 2
            nearest_village, village_distance = _nearest_village(center_lat, center_lon, villages)
            village_term = 18.0 * math.exp(-village_distance / 2.2) if nearest_village else 0.0
            best = 0.0
            dominant = None
            count = 0
            for det in recent:
                distance = haversine_km(center_lat, center_lon, det["lat"], det["lon"])
                if distance > radius:
                    continue
                count += 1
                signal = det["score"] * (1.0 - distance / radius)
                if signal > best:
                    best = signal
                    dominant = det.get("species")
            if best <= 0 and village_term <= 0:
                lon += cell
                continue
            score = round(min(100.0, 0.92 * best + village_term + 3.0), 1)
            if score < float(settings.data["zone_min_score"]):
                lon += cell
                continue
            level = risk_level(score, settings.thresholds)
            ring = [
                [round(lon, 6), round(lat, 6)],
                [round(lon + cell, 6), round(lat, 6)],
                [round(lon + cell, 6), round(lat + cell, 6)],
                [round(lon, 6), round(lat + cell, 6)],
                [round(lon, 6), round(lat, 6)],
            ]
            features.append(
                polygon_feature(
                    ring,
                    {
                        "score": score,
                        "level": level,
                        "dominant_species": dominant,
                        "detections_21d": count,
                        "nearest_village": nearest_village["name"] if nearest_village else None,
                        "basis": "gridded proximity & activity (indicative)",
                    },
                )
            )
            lon += cell
        lat += cell
    return {"type": "FeatureCollection", "features": features}


def village_exposure(
    villages: Sequence[dict], detections: Sequence[dict], settings: RiskSettings | None = None
) -> list[dict]:
    settings = settings or RiskSettings()
    radius = float(settings.data["alert_radius_km"]) + 0.5
    now = utcnow()
    out = []
    for village in villages:
        ring = village.get("boundary_ring") or polygon_ring(
            village.get("boundary_geojson") or village.get("boundary") or {}
        )
        nearby = []
        for det in detections:
            distance = distance_to_polygon_km(float(det["lat"]), float(det["lon"]), ring) if ring else 0
            if distance <= radius:
                nearby.append({**det, "distance_km": distance})
        recent = [
            d for d in nearby if _aware_naive(d["detected_at"]) >= now - timedelta(days=14)
        ]
        max_score = max((float(d.get("risk_score", 0)) for d in recent), default=0.0)
        level = risk_level(max_score, settings.thresholds)
        top_species = None
        if recent:
            top = max(recent, key=lambda item: float(item.get("risk_score", 0)))
            top_species = top.get("species")
        out.append(
            {
                "id": village["id"],
                "name": village["name"],
                "level": level,
                "max_score": round(max_score, 1),
                "detections_14d": len(recent),
                "top_species": top_species,
                "population": village.get("population"),
            }
        )
    return out
