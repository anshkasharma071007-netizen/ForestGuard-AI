from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, true
from sqlalchemy.orm import Session, selectinload

from geospatial.mapping import valid_coordinates
from geospatial.risk_analysis import utcnow
from geospatial.species import normalize_report_animal, species_meta
from backend import config
from backend.api.deps import require_guard
from backend.database.session import get_db
from backend.models import Alert, Detection, Incident, SightingReport, User, Village
from backend.models.entities import Jurisdiction
from backend.services.geography import authority_scope, covers, jurisdiction_at, jurisdiction_label, user_jurisdictions
from backend.services.incident_lifecycle import ACTIVE_ALERTS, PENDING, lifecycle_status, report_location
from backend.services.serializers import iso, serialize_detection, serialize_incident, serialize_village
from backend.services.villages import is_demo_village

router = APIRouter(prefix="/api/operations", tags=["authority operations"])
OWNED_REPORT = SightingReport.citizen_id.is_not(None)
INCIDENTS = (select(Incident, SightingReport.title, Alert.id, Alert.created_at)
             .join(SightingReport, Incident.report_id == SightingReport.id)
             .outerjoin(Alert, Alert.incident_id == Incident.id)
             .where(OWNED_REPORT, SightingReport.status == "verified",
                    Incident.verified.is_(True)))


def _field_reports():
    return SightingReport.is_simulated.is_(config.demo_jurisdictions_allowed())


def _incident_item(row) -> dict:
    incident, title, alert_id, published_at = row
    return {**serialize_incident(incident), "title": title, "alert_id": alert_id, "published_at": iso(published_at)}


@router.get("/map/jurisdictions")
def map_jurisdictions(db: Session = Depends(get_db), user: User = Depends(require_guard)):
    simulated = config.demo_jurisdictions_allowed()
    choices = (db.scalars(select(Jurisdiction).order_by(Jurisdiction.name))
               if user.role == "admin" else user_jurisdictions(db, user))
    return {"items": [{**jurisdiction_label(item), "boundary": item.boundary}
                      for item in choices if item.is_demo == simulated]}


@router.get("/map")
def operations_map(
    jurisdiction_id: int = Query(gt=0),
    days: int | None = Query(default=None, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
):
    simulated = config.demo_jurisdictions_allowed()
    jurisdiction = db.get(Jurisdiction, jurisdiction_id)
    if (not jurisdiction or jurisdiction.is_demo != simulated or
            (user.role != "admin" and jurisdiction not in user_jurisdictions(db, user))):
        raise HTTPException(404, "Jurisdiction not found.")
    since = utcnow() - timedelta(days=days) if days else None
    recent_report = SightingReport.created_at >= since if since else true()
    recent_resolution = (func.coalesce(Incident.resolved_at, Incident.created_at) >= since if since else true())
    rows = db.execute(
        select(SightingReport, Incident, Alert.radius_km)
        .outerjoin(Incident, Incident.report_id == SightingReport.id)
        .outerjoin(Alert, Alert.incident_id == Incident.id)
        .options(selectinload(SightingReport.village))
        .where(SightingReport.jurisdiction_id == jurisdiction_id, _field_reports(),
               authority_scope(db, user, SightingReport),
               or_(
                   SightingReport.status.in_(PENDING) & recent_report,
                   (SightingReport.status == "verified") & Incident.verified.is_(True) &
                   or_(Incident.status == "verified",
                       (Incident.status == "resolved") & recent_resolution),
               ))
        .order_by(SightingReport.created_at.desc(), SightingReport.id.desc())
    )
    reports = []
    for report, incident, radius in rows:
        location = (incident.lat, incident.lon) if incident else report_location(report)
        if location is None or not valid_coordinates(*location) or not covers(jurisdiction.boundary, *location):
            continue
        animal = normalize_report_animal(incident.species if incident else report.species)
        status = lifecycle_status(report, incident.status if incident else None)
        reports.append({
            "id": report.id, "title": report.title, "species": animal, "species_name": species_meta(animal)["name"],
            "status": status, "severity": incident.severity if incident else None, "created_at": iso(report.created_at),
            "resolved_at": iso(incident.resolved_at) if incident else None, "lat": location[0], "lon": location[1],
            "image_url": f"/api/reports/{report.id}/evidence" if report.image_path else None,
            "coverage_radius_m": radius * 1000 if radius and status == "under_work" else None,
        })
    villages = db.scalars(select(Village).where(
        jurisdiction_at(db, Village.lat, Village.lon, demo=simulated) == jurisdiction_id
    ).order_by(Village.name))
    detection_query = select(Detection).where(
        Detection.camera_id.is_not(None), Detection.is_simulated.is_(simulated),
        jurisdiction_at(db, Detection.lat, Detection.lon, demo=simulated) == jurisdiction_id,
        authority_scope(db, user, Detection),
    )
    if since:
        detection_query = detection_query.where(Detection.detected_at >= since)
    detections = db.scalars(detection_query.order_by(Detection.detected_at.desc()).limit(600))
    return {"reports": reports, "villages": [serialize_village(item) for item in villages if simulated or not is_demo_village(item)],
            "detections": [serialize_detection(item) for item in detections]}


@router.get("/alerts")
def incident_alerts(
    status: str = Query(default="active", pattern="^(active|resolved)$"),
    risk: str | None = Query(default=None, pattern="^(low|moderate|high)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
):
    query = INCIDENTS.where(_field_reports(), authority_scope(db, user, SightingReport), Incident.status == ("verified" if status == "active" else "resolved"))
    if risk:
        query = query.where(Incident.severity == risk)
    date = func.coalesce(Alert.created_at, Incident.created_at) if status == "active" else Incident.resolved_at
    return {"items": [_incident_item(row) for row in db.execute(
        query.options(selectinload(Incident.village)).order_by(date.desc().nulls_last(), Incident.id.desc())
    )]}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require_guard)):
    scope = authority_scope(db, user, SightingReport)
    incidents = INCIDENTS.where(_field_reports(), scope)
    reports = select(SightingReport).where(OWNED_REPORT, _field_reports(), scope)
    pending = reports.where(SightingReport.status.in_(PENDING))
    counts = db.execute(incidents.with_only_columns(Incident.status, Incident.severity, func.count(Incident.id))
                        .group_by(Incident.status, Incident.severity)).all()
    recent = db.scalars(reports
                        .options(selectinload(SightingReport.incident))
                        .order_by(SightingReport.created_at.desc(), SightingReport.id.desc()).limit(8)).all()
    decisions = db.scalars(reports.where(SightingReport.status.in_(("verified", "rejected")))
                           .order_by(SightingReport.created_at.desc(), SightingReport.id.desc())).all()
    activity = [{"id": r.id, "title": r.title, "kind": "Submitted", "at": iso(r.created_at)} for r in recent]
    for report in decisions:
        event = next((item for item in reversed(report.review_history or []) if item.get("status") == report.status), None)
        if event and event.get("at"):
            activity.append({"id": report.id, "title": report.title,
                             "kind": "Approved" if report.status == "verified" else "Rejected", "at": event["at"]})
    resolved = db.execute(incidents.where(Incident.status == "resolved", Incident.resolved_at.is_not(None))
                          .order_by(Incident.resolved_at.desc()).limit(8)).all()
    activity.extend({"id": row[0].report_id, "incident_id": row[0].id, "title": row[1],
                     "kind": "Resolved", "at": iso(row[0].resolved_at)} for row in resolved)
    now = utcnow()
    start = (now - timedelta(days=29)).date()
    window_start = datetime.combine(start, time.min)
    report_date = func.date(SightingReport.created_at)
    report_days = {str(day): count for day, count in db.execute(
        reports.with_only_columns(report_date, func.count(SightingReport.id))
        .where(SightingReport.created_at >= window_start).group_by(report_date)
    )}
    detection_scope = (authority_scope(db, user, Detection),
                       Detection.is_simulated.is_(config.demo_jurisdictions_allowed()))
    detection_date = func.date(Detection.detected_at)
    detection_days = {str(day): count for day, count in db.execute(
        select(detection_date, func.count(Detection.id))
        .where(*detection_scope, Detection.detected_at >= window_start).group_by(detection_date)
    )}
    days = [start + timedelta(days=offset) for offset in range(30)]
    daily = [{"date": day.isoformat(),
              "reports": report_days.get(day.isoformat(), 0),
              "detections": detection_days.get(day.isoformat(), 0)} for day in days]
    recent_detections = db.scalars(select(Detection).where(*detection_scope)
                                  .order_by(Detection.detected_at.desc(), Detection.id.desc()).limit(8))
    return {
        "summary": {
            "pending": db.scalar(select(func.count()).select_from(pending.subquery())),
            "active": sum(count for status, _, count in counts if status == "verified"),
            "high": sum(count for status, severity, count in counts if status == "verified" and severity == "high"),
            "resolved": sum(count for status, _, count in counts if status == "resolved"),
        },
        "pending": [{"id": r.id, "title": r.title, "category": r.category, "created_at": iso(r.created_at),
                     "village_id": r.village_id, "village_name": r.village.name if r.village else None}
                    for r in db.scalars(pending.options(selectinload(SightingReport.village))
                                        .order_by(SightingReport.created_at.desc()).limit(6))],
        "alerts": [_incident_item(row) for row in db.execute(
            incidents.where(Incident.status == "verified", Alert.status.in_(ACTIVE_ALERTS))
            .options(selectinload(Incident.village))
            .order_by(Alert.priority_rank, Alert.created_at.desc()).limit(6)
        )],
        "activity": sorted(activity, key=lambda item: item["at"], reverse=True)[:8],
        "daily": daily,
        "risk_distribution": {level: sum(count for status, severity, count in counts
                                        if status == "verified" and severity == level)
                              for level in ("high", "moderate", "low")},
        "recent_reports": [{"id": r.id, "title": r.title, "created_at": iso(r.created_at),
                            "status": lifecycle_status(r, r.incident.status if r.incident else None),
                            "severity": r.incident.severity if r.incident else None} for r in recent],
        "recent_detections": [serialize_detection(item) for item in recent_detections],
    }
