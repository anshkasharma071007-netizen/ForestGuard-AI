from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from geospatial.mapping import distance_to_polygon_km, polygon_ring, valid_coordinates
from geospatial.risk_analysis import RiskSettings, risk_level, score_detection, utcnow
from geospatial.species import CITIZEN_RISK_BASELINE, normalize_report_animal, species_meta

from backend import config
from backend.models import Detection, Incident, SightingReport, Track, Village
from backend.models.entities import RiskConfiguration
from backend.services.villages import village_risk_inputs

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


def score_report_incident(db: Session, incident: Incident, settings: RiskSettings, *, citizen_report: bool = False) -> dict:
    prior = db.scalars(select(Detection).where(
        Detection.detected_at < incident.created_at,
        Detection.is_simulated == incident.is_simulated,
    )).all()
    risk = score_detection(
        species=incident.species, lat=incident.lat, lon=incident.lon, detected_at=incident.created_at,
        villages=village_risk_inputs(db),
        incidents=[item for item in _incident_dicts(db)
                   if item["is_simulated"] == incident.is_simulated
                   and (not citizen_report or item["created_at"] < incident.created_at)],
        prior_detections=[{"species": d.species, "lat": d.lat, "lon": d.lon, "detected_at": d.detected_at}
                          for d in prior],
        settings=settings,
    )
    if not citizen_report:
        return risk

    # Citizen reports explicitly describe an encounter. An absence of camera
    # activity is common, and movement cannot be inferred from these reports.
    threat = round(30 * risk["species_weight"], 1)
    conflict = 20 if incident.category == "conflict" else 0
    components = [
        {"key": "animal_threat", "label": "Animal threat", "points": threat},
        {"key": "category", "label": "Reported conflict", "points": conflict},
        *[{**item, "points": round(item["points"] * 0.7, 1)}
          for item in risk["components"] if item["key"] != "movement"],
    ]
    score = min(100.0, round(sum(item["points"] for item in components), 1))
    return apply_citizen_baseline(incident.species, {
        **risk, "score": score, "components": components, "assessment_method": "automatic",
        "missing_factors": ["village_proximity"] if risk["distance_km"] is None else [],
    }, settings)


def apply_citizen_baseline(species: str, assessment: dict, settings: RiskSettings) -> dict:
    baseline = CITIZEN_RISK_BASELINE[normalize_report_animal(species)]
    contextual_score = assessment["score"]
    minimum = settings.thresholds.get(baseline, 0.0)
    score = max(contextual_score, minimum)
    components = list(assessment.get("components") or [])
    if score > contextual_score:
        components.append({"key": "citizen_safety_baseline", "label": "Citizen safety policy minimum",
                           "detail": baseline.title(), "points": round(score - contextual_score, 3)})
    return {**assessment, "score": score, "level": risk_level(score, settings.thresholds),
            "components": components, "policy_baseline": baseline, "thresholds": settings.thresholds,
            "reason": f"{assessment['reason']} Citizen safety policy baseline: {baseline.title()}."}


def recalculate_all(
    db: Session, settings: RiskSettings | None = None, *, now: datetime | None = None, commit: bool = True
) -> dict:
    settings = settings or get_settings(db)
    now = now or utcnow()
    villages = village_risk_inputs(db)
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

    rescored_reports = 0
    for incident in verified_reports:
        # Approval assessments are operational decisions. Historical citizen
        # assessments and manual decisions are preserved by routine recalculation.
        if incident.report_id in owned_reports or (incident.report_risk or {}).get("assessment_method") in {"manual", "override"}:
            continue
        rescored_reports += 1
        observations = [entry for entry in prior[incident.is_simulated]
                        if entry["detected_at"] < incident.created_at]
        incident.report_risk = score_detection(
            species=incident.species, lat=incident.lat, lon=incident.lon, detected_at=incident.created_at,
            villages=villages, incidents=history[incident.is_simulated], prior_detections=observations, track_direction=None,
            settings=settings, now=now,
        )
    recent_cutoff = now - timedelta(days=14)
    recent_scores = [(d.lat, d.lon, d.risk_score) for d in detections if d.detected_at >= recent_cutoff]
    recent_scores.extend((i.lat, i.lon, i.report_risk["score"]) for i in verified_reports
                         if i.created_at >= recent_cutoff and (i.report_risk or {}).get("score") is not None)
    radius = float(settings.data["alert_radius_km"]) + 0.5
    for village in db.scalars(select(Village)).all():
        ring = polygon_ring(village.boundary_geojson)
        best = max((score for lat, lon, score in recent_scores
                    if valid_coordinates(lat, lon) and distance_to_polygon_km(lat, lon, ring) <= radius), default=0.0)
        village.risk_level = risk_level(best, settings.thresholds)
    if commit:
        db.commit()
    else:
        db.flush()
    return {
        "detections_scored": len(detections),
        "report_incidents_scored": rescored_reports,
        "levels": counts,
        "alerts_eligible": alerts_eligible,
        "settings": settings.to_dict(),
        "scored_at": now.isoformat() + "Z",
        "note": "Risk scores are indicative prioritisation aids, not movement predictions.",
    }


def rescore_detection(db: Session, detection: Detection, settings: RiskSettings | None = None) -> dict:
    settings = settings or get_settings(db)
    villages = village_risk_inputs(db)
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
