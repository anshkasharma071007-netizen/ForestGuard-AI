from __future__ import annotations

from datetime import timedelta
from math import isfinite

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from geospatial.mapping import haversine_km, valid_coordinates
from geospatial.risk_analysis import RiskSettings, villages_within_radius
from geospatial.species import species_meta

from backend.models import Alert, AlertEvent, Detection, Guard, Incident, SightingReport, Village, utcnow
from backend.models.entities import AuthorityJurisdiction
from backend.services.geography import jurisdiction_at
from backend.services.villages import village_center, village_risk_inputs

SEVERITY_HIGH = 65.0
SEVERITY_CRITICAL = 80.0


def _nearest_guard(db: Session, detection: Detection | Incident) -> Guard | None:
    query = select(Guard).where(Guard.status.in_(("available", "on_patrol")))
    if not detection.is_simulated:
        if isinstance(detection, Incident) and detection.report_id:
            target = select(SightingReport.jurisdiction_id).where(SightingReport.id == detection.report_id).scalar_subquery()
        else:
            target = jurisdiction_at(db, detection.lat, detection.lon)
        query = query.where(Guard.user_id.in_(select(AuthorityJurisdiction.user_id).where(
            AuthorityJurisdiction.jurisdiction_id == target,
        )))
    return min(db.scalars(query), key=lambda guard: haversine_km(detection.lat, detection.lon, guard.lat, guard.lon),
               default=None)



def _severity(score: float) -> tuple[str, int]:
    if score >= SEVERITY_CRITICAL:
        return "high", 1
    if score >= SEVERITY_HIGH:
        return "high", 2
    return "moderate", 3


def public_summary(species: str, severity: str, village_names: list[str]) -> str:
    meta = species_meta(species)
    where = ", ".join(village_names[:2]) if village_names else "the approximate location shown"
    level = "High-priority" if severity == "high" else "Precautionary"
    return (
        f"{level} advisory: {meta['name']} activity reported near {where}. "
        f"Follow forest-department safety guidance and avoid travelling on forest roads after dusk. "
        f"{meta['advice']}"
    )


def maybe_create_alert(
    db: Session,
    detection: Detection | Incident,
    risk: dict,
    settings: RiskSettings,
    *,
    actor: str = "Risk engine",
    publish_reviewed_report: bool = False,
) -> Alert | None:
    incident = isinstance(detection, Incident)
    if incident and (not detection.verified or not detection.report_id or detection.status != "verified"):
        return None
    if publish_reviewed_report:
        villages = [v for v in village_risk_inputs(db) if v["id"] == detection.village_id]
    else:
        if risk["score"] < float(settings.data["alert_threshold"]):
            return None
        villages = villages_within_radius(
            detection.lat, detection.lon, village_risk_inputs(db), float(settings.data["alert_radius_km"])
        )
        if not villages:
            return None
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(71239410)"))
    source = Alert.incident_id if incident else Alert.detection_id
    if db.scalar(select(Alert.id).where(source == detection.id).limit(1)):
        return None
    created_at = utcnow() if incident else detection.detected_at + timedelta(minutes=2)
    if not publish_reviewed_report:
        recent = db.scalars(select(Alert).where(
            Alert.species == detection.species, Alert.is_simulated == detection.is_simulated,
            Alert.created_at >= created_at - timedelta(hours=24), Alert.status != "resolved",
        ))
        village_ids = {v["id"] for v in villages}
        if any(village_ids.intersection(alert.village_ids or []) for alert in recent):
            return None

    severity, priority = _severity(risk["score"])
    if publish_reviewed_report:
        severity = risk["level"]
        priority = {"high": 2, "moderate": 3, "low": 4}[severity]
    village_names = [v["name"] for v in villages]
    alert = Alert(
        detection_id=None if incident else detection.id,
        incident_id=detection.id if incident else None,
        species=detection.species,
        severity=severity,
        score=risk["score"],
        risk_basis=risk["basis"],
        reason=risk["reason"],
        village_ids=[v["id"] for v in villages],
        radius_km=float(settings.data["alert_radius_km"]),
        status="active",
        priority_rank=priority,
        public_summary=public_summary(detection.species, severity, village_names),
        is_simulated=detection.is_simulated,
        created_at=created_at,
    )
    if incident:
        village = detection.village
        if village and valid_coordinates(village.lat, village.lon):
            center = village_center(village, public=True)
            alert.public_lat, alert.public_lon = center["lat"], center["lon"]
        else:
            alert.public_lat, alert.public_lon = round(detection.lat, 1), round(detection.lon, 1)
    guard = _nearest_guard(db, detection)
    if guard:
        alert.assigned_guard_id = guard.id
    db.add(alert)
    db.flush()
    db.add(
        AlertEvent(
            alert_id=alert.id,
            kind="generated",
            note=f"Alert generated by the risk engine (score {risk['score']:.1f}, {risk['basis_label']}).",
            actor=actor,
            created_at=created_at,
        )
    )
    if guard:
        db.add(
            AlertEvent(
                alert_id=alert.id,
                kind="assigned",
                note=f"Assigned to {guard.name} ({guard.badge_id}) based on proximity.",
                actor="Dispatch",
                created_at=created_at + timedelta(minutes=1),
            )
        )
    for village in db.scalars(select(Village).where(Village.id.in_([v["id"] for v in villages]))):
        village.last_alert_at = created_at
    db.flush()
    return alert


def sync_alerts(db: Session, settings: RiskSettings, *, days: int = 30, commit: bool = True) -> list[Alert]:
    since = utcnow() - timedelta(days=days)
    detections = db.scalars(
        select(Detection).where(Detection.detected_at >= since).order_by(Detection.detected_at)
    ).all()
    created = []
    for det in detections:
        if det.risk_score < float(settings.data["alert_threshold"]):
            continue
        risk = {
            "score": det.risk_score,
            "basis": det.risk_basis or "proximity",
            "basis_label": "Movement-supported" if det.risk_basis == "confirmed_movement" else "Proximity-based",
            "reason": _reason_for(det),
        }
        alert = maybe_create_alert(db, det, risk, settings)
        if alert:
            created.append(alert)
    if commit:
        db.commit()
    else:
        db.flush()
    return created


def _reason_for(detection: Detection) -> str:
    meta = species_meta(detection.species)
    village = detection.nearest_village.name if detection.nearest_village else "the nearest village"
    distance = detection.observed_distance_km
    if distance is None or not isfinite(distance):
        return f"{meta['name']} detected. Nearest-village distance is unavailable."
    return (
        f"{meta['name']} detection {distance:.1f} km from {village} boundary. "
        "Open the detection record for the full, explainable risk breakdown."
    )
