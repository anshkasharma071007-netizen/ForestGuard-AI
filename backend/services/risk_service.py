from __future__ import annotations

import copy
import threading
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from geospatial.mapping import distance_to_polygon_km, polygon_ring
from geospatial.risk_analysis import RiskSettings, risk_level, score_detection, utcnow
from geospatial.species import species_meta

from backend import config
from backend.models import Detection, Incident, Track, Village

_lock = threading.Lock()
_settings: RiskSettings | None = None


def get_settings(reload: bool = False) -> RiskSettings:
    global _settings
    with _lock:
        if _settings is None or reload:
            _settings = RiskSettings.load(config.RISK_CONFIG_PATH)
        return _settings


def update_settings(patch: dict) -> dict:
    global _settings
    with _lock:
        settings = _settings or RiskSettings.load(config.RISK_CONFIG_PATH)
        settings.update(patch)
        settings.save(config.RISK_CONFIG_PATH)
        _settings = settings
        return settings.to_dict()


def reset_settings() -> dict:
    global _settings
    with _lock:
        _settings = RiskSettings()
        _settings.save(config.RISK_CONFIG_PATH)
        return _settings.to_dict()


def _village_dicts(db: Session) -> list[dict]:
    villages = db.scalars(select(Village)).all()
    return [
        {
            "id": village.id,
            "name": village.name,
            "lat": village.lat,
            "lon": village.lon,
            "population": village.population,
            "boundary_ring": polygon_ring(village.boundary_geojson),
        }
        for village in villages
    ]


def _incident_dicts(db: Session) -> list[dict]:
    incidents = db.scalars(select(Incident)).all()
    return [
        {
            "id": incident.id,
            "lat": incident.lat,
            "lon": incident.lon,
            "verified": incident.verified,
            "created_at": incident.created_at,
        }
        for incident in incidents
    ]


def score_detection_record(
    detection: Detection,
    *,
    villages: list[dict],
    incidents: list[dict],
    prior: list[dict],
    track_direction: str | None,
    settings: RiskSettings,
    now: datetime | None = None,
) -> dict:
    return score_detection(
        species=detection.species,
        lat=detection.lat,
        lon=detection.lon,
        detected_at=detection.detected_at,
        villages=villages,
        incidents=incidents,
        prior_detections=prior,
        track_direction=track_direction,
        settings=settings,
        now=now,
    )


def recalculate_all(db: Session, settings: RiskSettings | None = None, *, now: datetime | None = None) -> dict:
    settings = settings or get_settings()
    now = now or utcnow()
    villages = _village_dicts(db)
    incidents = _incident_dicts(db)
    tracks = {track.id: track.direction for track in db.scalars(select(Track)).all()}
    detections = db.scalars(select(Detection).order_by(Detection.detected_at)).all()

    prior: list[dict] = []
    counts = {"low": 0, "moderate": 0, "high": 0}
    alerts_eligible = 0
    threshold = float(settings.data["alert_threshold"])
    for det in detections:
        risk = score_detection_record(
            det,
            villages=villages,
            incidents=incidents,
            prior=prior,
            track_direction=tracks.get(det.track_id),
            settings=settings,
            now=now,
        )
        det.risk_score = risk["score"]
        det.risk_level = risk["level"]
        det.risk_basis = risk["basis"]
        det.risk_components = risk["components"]
        det.nearest_village_id = risk["nearest_village_id"]
        det.observed_distance_km = risk["distance_km"]
        counts[risk["level"]] += 1
        if risk["score"] >= threshold:
            alerts_eligible += 1
        prior.append(
            {
                "species": det.species,
                "lat": det.lat,
                "lon": det.lon,
                "detected_at": det.detected_at,
            }
        )
    db.flush()

    # Refresh village risk labels from recent detections around each boundary.
    recent_cutoff = now - timedelta(days=14)
    for village in db.scalars(select(Village)).all():
        ring = polygon_ring(village.boundary_geojson)
        best = 0.0
        for det in detections:
            if det.detected_at < recent_cutoff:
                continue
            distance = distance_to_polygon_km(det.lat, det.lon, ring)
            if distance <= float(settings.data["alert_radius_km"]) + 0.5:
                best = max(best, det.risk_score)
        village.risk_level = risk_level(best, settings.thresholds)
    db.commit()
    return {
        "detections_scored": len(detections),
        "levels": counts,
        "alerts_eligible": alerts_eligible,
        "settings": settings.to_dict(),
        "scored_at": now.isoformat() + "Z",
        "note": "Risk scores are indicative prioritisation aids, not movement predictions.",
    }


def rescore_detection(db: Session, detection: Detection, settings: RiskSettings | None = None) -> dict:
    settings = settings or get_settings()
    villages = _village_dicts(db)
    incidents = _incident_dicts(db)
    prior_models = db.scalars(
        select(Detection)
        .where(Detection.detected_at < detection.detected_at, Detection.id != detection.id)
        .order_by(Detection.detected_at)
    ).all()
    prior = [
        {"species": d.species, "lat": d.lat, "lon": d.lon, "detected_at": d.detected_at}
        for d in prior_models
    ]
    track_direction = None
    if detection.track_id:
        track = db.get(Track, detection.track_id)
        track_direction = track.direction if track else None
    risk = score_detection_record(
        detection,
        villages=villages,
        incidents=incidents,
        prior=prior,
        track_direction=track_direction,
        settings=settings,
    )
    detection.risk_score = risk["score"]
    detection.risk_level = risk["level"]
    detection.risk_basis = risk["basis"]
    detection.risk_components = risk["components"]
    detection.nearest_village_id = risk["nearest_village_id"]
    detection.observed_distance_km = risk["distance_km"]
    db.commit()
    return risk


def species_summary(settings: RiskSettings | None = None) -> list[dict]:
    settings = settings or get_settings()
    return [
        {
            "key": key,
            "name": species_meta(key)["name"],
            "scientific": species_meta(key)["scientific"],
            "risk_weight": weight,
            "risk_label": "High" if weight >= 0.8 else "Moderate" if weight >= 0.5 else "Low",
        }
        for key, weight in settings.species_weights.items()
    ]
