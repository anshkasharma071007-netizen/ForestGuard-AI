from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from geospatial.mapping import distance_to_polygon_km, polygon_ring
from geospatial.risk_analysis import RiskSettings, risk_level, score_detection, utcnow
from geospatial.species import species_meta

from backend import config
from backend.models import Alert, Detection, Incident, SightingReport, Track, Village
from backend.models.entities import RiskConfiguration

def get_settings(db: Session | None = None) -> RiskSettings:
    stored = db.get(RiskConfiguration, 1) if db is not None else None
    return RiskSettings(deepcopy(stored.settings)) if stored else RiskSettings.load(config.RISK_CONFIG_PATH)


def store_settings(db: Session, patch: dict | None = None) -> RiskSettings:
    # Lock even before the first settings row exists.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(71239412)"))
    elif not db.connection().connection.driver_connection.in_transaction:
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    settings = get_settings(db) if patch is not None else RiskSettings()
    if patch is not None:
        settings.update(patch)
    db.merge(RiskConfiguration(id=1, settings=settings.to_dict()))
    return settings


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
            "is_simulated": incident.is_simulated,
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


def score_report_incident(db: Session, incident: Incident, settings: RiskSettings) -> dict:
    prior = db.scalars(select(Detection).where(
        Detection.detected_at < incident.created_at,
        Detection.is_simulated == incident.is_simulated,
    )).all()
    return score_detection(
        species=incident.species, lat=incident.lat, lon=incident.lon, detected_at=incident.created_at,
        villages=_village_dicts(db),
        incidents=[item for item in _incident_dicts(db) if item["is_simulated"] == incident.is_simulated],
        prior_detections=[{"species": d.species, "lat": d.lat, "lon": d.lon, "detected_at": d.detected_at}
                          for d in prior],
        settings=settings,
    )


def recalculate_all(
    db: Session, settings: RiskSettings | None = None, *, now: datetime | None = None, commit: bool = True
) -> dict:
    settings = settings or get_settings(db)
    now = now or utcnow()
    villages = _village_dicts(db)
    incidents = _incident_dicts(db)
    tracks = {track.id: track.direction for track in db.scalars(select(Track)).all()}
    detections = db.scalars(select(Detection).order_by(Detection.detected_at)).all()

    history = {simulated: [item for item in incidents if item["is_simulated"] == simulated]
               for simulated in (True, False)}
    prior: dict[bool, list[dict]] = {True: [], False: []}
    counts = {"low": 0, "moderate": 0, "high": 0}
    alerts_eligible = 0
    threshold = float(settings.data["alert_threshold"])
    for det in detections:
        risk = score_detection_record(
            det,
            villages=villages,
            incidents=history[det.is_simulated],
            prior=prior[det.is_simulated],
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
        prior[det.is_simulated].append(
            {
                "species": det.species,
                "lat": det.lat,
                "lon": det.lon,
                "detected_at": det.detected_at,
            }
        )
    db.flush()

    verified_reports = db.scalars(select(Incident).where(
        Incident.report_id.is_not(None), Incident.verified.is_(True), Incident.status == "verified"
    ).order_by(Incident.report_id).with_for_update()).all()
    owned_reports = set(db.scalars(select(SightingReport.id).where(SightingReport.citizen_id.is_not(None))))

    for incident in verified_reports:
        observations = [entry for entry in prior[incident.is_simulated]
                        if entry["detected_at"] < incident.created_at]
        incident.report_risk = score_detection(
            species=incident.species, lat=incident.lat, lon=incident.lon, detected_at=incident.created_at,
            villages=villages, incidents=history[incident.is_simulated], prior_detections=observations, track_direction=None,
            settings=settings, now=now,
        )
        if incident.report_id in owned_reports:
            risk = incident.report_risk
            incident.severity = risk["level"]
            db.execute(update(Alert).where(
                Alert.incident_id == incident.id, Alert.status.in_(("active", "acknowledged", "responding"))
            ).values(severity=risk["level"], score=risk["score"], risk_basis=risk["basis"],
                     reason=risk["reason"], priority_rank={"high": 2, "moderate": 3, "low": 4}[risk["level"]]))
    recent_cutoff = now - timedelta(days=14)
    recent_scores = [(d.lat, d.lon, d.risk_score) for d in detections if d.detected_at >= recent_cutoff]
    recent_scores.extend((i.lat, i.lon, i.report_risk["score"]) for i in verified_reports
                         if i.created_at >= recent_cutoff)
    radius = float(settings.data["alert_radius_km"]) + 0.5
    for village in db.scalars(select(Village)).all():
        ring = polygon_ring(village.boundary_geojson)
        best = max((score for lat, lon, score in recent_scores
                    if distance_to_polygon_km(lat, lon, ring) <= radius), default=0.0)
        village.risk_level = risk_level(best, settings.thresholds)
    if commit:
        db.commit()
    else:
        db.flush()
    return {
        "detections_scored": len(detections),
        "report_incidents_scored": len(verified_reports),
        "levels": counts,
        "alerts_eligible": alerts_eligible,
        "settings": settings.to_dict(),
        "scored_at": now.isoformat() + "Z",
        "note": "Risk scores are indicative prioritisation aids, not movement predictions.",
    }


def rescore_detection(db: Session, detection: Detection, settings: RiskSettings | None = None) -> dict:
    settings = settings or get_settings(db)
    villages = _village_dicts(db)
    incidents = [i for i in _incident_dicts(db) if i["is_simulated"] == detection.is_simulated]
    prior_models = db.scalars(
        select(Detection)
        .where(Detection.detected_at < detection.detected_at, Detection.id != detection.id,
               Detection.is_simulated == detection.is_simulated)
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
