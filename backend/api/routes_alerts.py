from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
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
        query.order_by(Alert.priority_rank, Alert.created_at.desc()).limit(limit)
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
    _: User = Depends(require_guard),
) -> dict:
    from backend.api.utils import query_list

    query = select(SightingReport)
    statuses = query_list(status)
    categories = query_list(category)
    if statuses:
        query = query.where(SightingReport.status.in_(statuses))
    if categories:
        query = query.where(SightingReport.category.in_(categories))
    reports = db.scalars(query.order_by(SightingReport.created_at.desc())).all()
    return {
        "items": [serialize_sighting(report) for report in reports],
        "summary": {
            "pending": len([r for r in reports if r.status == "pending"]),
            "forwarded": len([r for r in reports if r.status == "forwarded"]),
            "closed": len([r for r in reports if r.status == "closed"]),
            "total": len(reports),
        },
    }


@router.patch("/reports/{report_id}")
def update_report(
    report_id: int,
    payload: SightingStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    report = db.get(SightingReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if payload.status:
        report.status = payload.status
    db.commit()
    return {"report": serialize_sighting(report), "message": "Report status updated."}
