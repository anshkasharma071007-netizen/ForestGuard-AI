from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm import Session

from geospatial.risk_analysis import utcnow
from geospatial.species import species_meta

from backend.api.deps import require_guard
from backend.api.utils import alert_payload
from backend.database.session import get_db
from backend.models import (
    Alert,
    AlertEvent,
    Detection,
    Guard,
    Incident,
    SightingReport,
    User,
)
from backend.models.entities import ReportRead
from backend.services.report_analysis import evidence_path
from backend.services.alerts import sync_alerts
from backend.schemas.api import (
    AlertActionRequest,
    AlertAssignRequest,
    AlertResolveRequest,
    IncidentUpdateRequest,
    SightingStatusUpdate,
)
from backend.services.risk_service import get_settings, recalculate_all
from backend.services.serializers import (
    serialize_alert,
    serialize_incident,
    serialize_sighting,
)

router = APIRouter(prefix="/api", tags=["alerts"])

OPEN_STATUSES = ("active", "acknowledged", "responding")


@router.get("/alerts")
def list_alerts(
    status: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
    species: list[str] | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    from backend.api.utils import query_list

    query = select(Alert).where(Alert.created_at >= utcnow() - timedelta(days=days))
    statuses = query_list(status)
    severities = query_list(severity)
    species_list = query_list(species)
    if statuses:
        query = query.where(Alert.status.in_(statuses))
    if severities:
        query = query.where(Alert.severity.in_(severities))
    if species_list:
        query = query.where(Alert.species.in_(species_list))
    alerts = db.scalars(
        query.order_by(Alert.priority_rank, Alert.created_at.desc(), Alert.id).limit(limit)
    ).all()

    all_in_window = db.scalars(
        select(Alert).where(Alert.created_at >= utcnow() - timedelta(days=days))
    ).all()
    counts = {
        "active": len([a for a in all_in_window if a.status == "active"]),
        "acknowledged": len([a for a in all_in_window if a.status == "acknowledged"]),
        "responding": len([a for a in all_in_window if a.status == "responding"]),
        "resolved": len([a for a in all_in_window if a.status == "resolved"]),
        "high": len([a for a in all_in_window if a.severity == "high"]),
        "total": len(all_in_window),
    }
    return {
        "items": [alert_payload(db, alert, include_detection=True) for alert in alerts],
        "summary": counts,
        "window_days": days,
        "workflow": [
            "Detection",
            "Geolocation",
            "Risk analysis",
            "Village identification",
            "Alert generation",
            "Guard notification",
            "Response tracking",
        ],
    }


@router.get("/alerts/{alert_id}")
def alert_detail(
    alert_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return {
        "alert": alert_payload(db, alert, include_events=True, include_detection=True),
    }


def _event(alert: Alert, kind: str, note: str, actor: str) -> None:
    alert.events.append(AlertEvent(kind=kind, note=note, actor=actor, created_at=utcnow()))


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    payload: AlertActionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.status == "resolved":
        raise HTTPException(status_code=400, detail="This alert is already resolved.")
    if alert.acknowledged_at is None:
        alert.acknowledged_at = utcnow()
        alert.status = "acknowledged"
        _event(
            alert,
            "acknowledged",
            payload.note or "Alert acknowledged; field verification requested.",
            user.name,
        )
        db.commit()
    return {"alert": alert_payload(db, alert, include_events=True), "message": "Alert acknowledged."}


@router.post("/alerts/{alert_id}/assign")
def assign_alert(
    alert_id: int,
    payload: AlertAssignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    guard = db.get(Guard, payload.guard_id)
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found.")
    alert.assigned_guard_id = guard.id
    if alert.status == "active":
        alert.status = "acknowledged"
        alert.acknowledged_at = alert.acknowledged_at or utcnow()
    _event(
        alert,
        "assigned",
        payload.note or f"Reassigned to {guard.name} ({guard.badge_id}).",
        user.name,
    )
    db.commit()
    return {
        "alert": alert_payload(db, alert, include_events=True),
        "message": f"Alert assigned to {guard.name}.",
    }


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    payload: AlertResolveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.status == "resolved":
        return {"alert": alert_payload(db, alert, include_events=True), "message": "Alert already resolved."}
    alert.status = "resolved"
    alert.acknowledged_at = alert.acknowledged_at or utcnow()
    alert.resolved_at = utcnow()
    _event(
        alert,
        "resolved",
        payload.note or "Field team closed the alert after verification.",
        user.name,
    )
    db.commit()
    return {"alert": alert_payload(db, alert, include_events=True), "message": "Alert resolved."}


@router.post("/alerts/{alert_id}/respond")
def mark_responding(
    alert_id: int,
    payload: AlertActionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.status == "resolved":
        raise HTTPException(status_code=400, detail="This alert is already resolved.")
    alert.status = "responding"
    alert.acknowledged_at = alert.acknowledged_at or utcnow()
    _event(
        alert,
        "responding",
        payload.note or "Patrol is responding to the alert.",
        user.name,
    )
    db.commit()
    return {"alert": alert_payload(db, alert, include_events=True), "message": "Response recorded."}


@router.get("/incidents")
def list_incidents(
    status: list[str] | None = Query(default=None),
    category: list[str] | None = Query(default=None),
    days: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    from backend.api.utils import query_list

    query = select(Incident).where(Incident.created_at >= utcnow() - timedelta(days=days))
    statuses = query_list(status)
    categories = query_list(category)
    if statuses:
        query = query.where(Incident.status.in_(statuses))
    if categories:
        query = query.where(Incident.category.in_(categories))
    incidents = db.scalars(query.order_by(Incident.created_at.desc())).all()
    return {
        "items": [serialize_incident(incident) for incident in incidents],
        "summary": {
            "open": len([i for i in incidents if i.status == "open"]),
            "verified": len([i for i in incidents if i.status == "verified"]),
            "resolved": len([i for i in incidents if i.status == "resolved"]),
            "dismissed": len([i for i in incidents if i.status == "dismissed"]),
            "total": len(incidents),
        },
    }


@router.patch("/incidents/{incident_id}")
def update_incident(
    incident_id: int,
    payload: IncidentUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if incident.report_id and (payload.verified is False or payload.status in {"open", "dismissed"}):
        raise HTTPException(409, "A verified report incident can be resolved through the incident workflow.")
    if payload.status:
        incident.status = payload.status
        if payload.status == "resolved":
            incident.resolved_at = utcnow()
    if payload.verified is not None:
        incident.verified = payload.verified
        if payload.verified and incident.status == "open":
            incident.status = "verified"
    db.commit()
    settings = get_settings(reload=True)
    recalculate_all(db, settings)
    return {
        "incident": serialize_incident(incident),
        "message": "Incident updated. Verified incidents influence subsequent risk scores.",
    }


@router.get("/reports")
def list_reports(
    status: list[str] | None = Query(default=None),
    category: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    from backend.api.utils import query_list

    query = select(SightingReport).options(selectinload(SightingReport.incident), selectinload(SightingReport.village))
    statuses = query_list(status)
    categories = query_list(category)
    if statuses:
        query = query.where(SightingReport.status.in_(statuses))
    if categories:
        query = query.where(SightingReport.category.in_(categories))
    reports = db.scalars(query.order_by(SightingReport.created_at.desc())).all()
    read = set(db.scalars(select(ReportRead.report_id).where(ReportRead.user_id == user.id)))
    return {
        "items": [dict(serialize_sighting(report), unread=report.id not in read) for report in reports],
        "summary": {
            "unread": sum(r.id not in read for r in reports),
            "verified": sum(r.status == "verified" for r in reports),
            "rejected": sum(r.status == "rejected" for r in reports),
            "pending": len([r for r in reports if r.status == "pending"]),
            "forwarded": len([r for r in reports if r.status == "forwarded"]),
            "closed": len([r for r in reports if r.status == "closed"]),
            "total": len(reports),
        },
    }


@router.get("/reports/notifications")
def report_notifications(db: Session = Depends(get_db), user: User = Depends(require_guard)):
    seen = select(ReportRead.report_id).where(ReportRead.user_id == user.id)
    unread = db.scalar(select(func.count()).select_from(SightingReport).where(~SightingReport.id.in_(seen)))
    latest = db.scalar(select(Alert).where(Alert.is_simulated.is_(False)).order_by(Alert.id.desc()).limit(1))
    return {"unread": unread, "latest_alert": {"id": latest.id, "summary": latest.public_summary} if latest else None}


def _locked_report(db: Session, report_id: int) -> SightingReport:
    report = db.scalar(select(SightingReport).where(SightingReport.id == report_id).with_for_update())
    if not report:
        raise HTTPException(404, "Report not found.")
    return report


@router.post("/reports/{report_id}/read")
def mark_read(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_guard)):
    _locked_report(db, report_id)
    if not db.get(ReportRead, (report_id, user.id)):
        db.add(ReportRead(report_id=report_id, user_id=user.id))
    db.commit()
    return {"unread": False}


@router.get("/reports/{report_id}/evidence")
def report_evidence(report_id: int, db: Session = Depends(get_db), _: User = Depends(require_guard)):
    report = db.get(SightingReport, report_id)
    if report and report.image_path:
        try:
            path = evidence_path(report.image_path)
            return FileResponse(path, headers={"Cache-Control": "private, no-store",
                                "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"})
        except FileNotFoundError:
            pass
    raise HTTPException(404, "Photo unavailable.")


@router.post("/reports/{report_id}/retry")
def retry_analysis(report_id: int, db: Session = Depends(get_db), _: User = Depends(require_guard)):
    report = _locked_report(db, report_id)
    if report.analysis_status == "failed":
        report.analysis_status = "queued"
        db.commit()
    elif report.analysis_status == "no_photo":
        raise HTTPException(409, "Report has no photo to analyse.")
    return {"analysis_status": report.analysis_status}


@router.patch("/reports/{report_id}")
def update_report(
    report_id: int, payload: SightingStatusUpdate, db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    report = _locked_report(db, report_id)
    if not payload.status or report.status == payload.status:
        return {"report": serialize_sighting(report), "message": "Status already current."}
    if report.status in {"verified", "rejected"}:
        raise HTTPException(409, "This report already has a final review decision.")
    if payload.status == "verified":
        lat, lon = report.lat, report.lon
        if (lat is None or lon is None) and report.village:
            lat, lon = report.village.lat, report.village.lon
        if lat is None or lon is None:
            raise HTTPException(409, "This legacy report has no location. Forward it for field review.")
        incident = Incident(report_id=report.id, category=report.category, species=report.species,
                            lat=lat, lon=lon, village_id=report.village_id, description=report.description,
                            verified=True, status="verified", is_simulated=report.is_simulated,
                            is_public=False, reported_by="Community report", created_at=report.created_at)
        db.add(incident)
        db.flush()
        settings = get_settings()
        recalculate_all(db, settings, commit=False)
        sync_alerts(db, settings, commit=False)
    report.review_history = [*(report.review_history or []), {
        "previous_status": report.status, "status": payload.status, "note": (payload.note or "").strip(),
        "reviewer_id": user.id, "reviewer_name": user.name, "at": utcnow().isoformat() + "Z",
    }]
    report.status = payload.status
    db.commit()
    return {"report": serialize_sighting(report), "message": "Report reviewed."}
