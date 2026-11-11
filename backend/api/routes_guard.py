from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geospatial.mapping import haversine_km
from geospatial.risk_analysis import utcnow

from backend.api.deps import require_guard
from backend.api.utils import alert_payload
from backend.database.session import get_db
from backend.models import Alert, Detection, Guard, Incident, User
from backend.services.serializers import (
    serialize_detection,
    serialize_guard,
    serialize_incident,
)

router = APIRouter(prefix="/api/guard", tags=["guard"])

OPEN_STATUSES = ("active", "acknowledged", "responding")


@router.get("/dashboard")
def guard_dashboard(
    guard_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    profile = db.scalar(select(Guard).where(Guard.user_id == user.id))
    if profile is None and user.role == "guard":
        profile = db.scalar(select(Guard).where(Guard.badge_id == user.badge_id))
    if guard_id and user.role == "admin":
        profile = db.get(Guard, guard_id)

    now = utcnow()
    week_ago = now - timedelta(days=7)

    if profile:
        assigned = db.scalars(
            select(Alert)
            .where(Alert.assigned_guard_id == profile.id)
            .order_by(Alert.priority_rank, Alert.created_at.desc())
        ).all()
        open_alerts = db.scalars(
            select(Alert)
            .where(Alert.status.in_(OPEN_STATUSES))
            .order_by(Alert.priority_rank, Alert.created_at.desc())
        ).all()
        zone_radius_km = 12.0
        zone_alerts = [
            alert
            for alert in open_alerts
            if alert.detection
            and haversine_km(profile.lat, profile.lon, alert.detection.lat, alert.detection.lon)
            <= zone_radius_km
        ]
        response_history = [
            alert
            for alert in assigned
            if alert.status == "resolved" and alert.resolved_at and alert.resolved_at >= week_ago
        ]
        recent_pool = db.scalars(
            select(Detection).order_by(Detection.detected_at.desc()).limit(120)
        ).all()
        near = [
            detection
            for detection in recent_pool
            if haversine_km(profile.lat, profile.lon, detection.lat, detection.lon) <= zone_radius_km
        ]
        detections = sorted(near or recent_pool, key=lambda item: item.detected_at, reverse=True)[:10]
        nearby_incidents = db.scalars(
            select(Incident)
            .where(Incident.status.in_(["open", "verified"]))
            .order_by(Incident.created_at.desc())
            .limit(8)
        ).all()
        open_tasks = [alert for alert in assigned if alert.status in OPEN_STATUSES]
        acknowledged = [alert for alert in assigned if alert.acknowledged_at]
        responses = [
            (alert.resolved_at - alert.created_at).total_seconds() / 3600
            for alert in response_history
            if alert.resolved_at and alert.created_at
        ]
        return {
            "view": "guard",
            "guard": {
                **serialize_guard(profile),
                "email": user.email,
                "role": user.role,
            },
            "summary": {
                "open_tasks": len(open_tasks),
                "high_priority": len([alert for alert in open_tasks if alert.severity == "high"]),
                "acknowledged": len(acknowledged),
                "resolved_7d": len(response_history),
                "avg_resolution_hours": round(sum(responses) / len(responses), 1)
                if responses
                else None,
            },
            "assigned_alerts": [alert_payload(db, alert, include_detection=True) for alert in assigned[:20]],
            "zone_alerts": [alert_payload(db, alert) for alert in zone_alerts],
            "recent_detections": [serialize_detection(detection) for detection in detections],
            "open_incidents": [serialize_incident(incident) for incident in nearby_incidents],
            "response_history": [
                alert_payload(db, alert, include_events=True) for alert in response_history[:10]
            ],
            "task_note": (
                "Tasks are derived from risk-engine alerts assigned to this guard by proximity. "
                "Demonstration records are synthetic."
            ),
        }

    # Admin without a linked guard profile: provide a dispatch overview.
    alerts = db.scalars(
        select(Alert)
        .where(Alert.status.in_(OPEN_STATUSES))
        .order_by(Alert.priority_rank, Alert.created_at.desc())
    ).all()
    guards = db.scalars(select(Guard).order_by(Guard.name)).all()
    assignments = {
        guard_id: count
        for guard_id, count in db.execute(
            select(Alert.assigned_guard_id, func.count(Alert.id))
            .where(Alert.status.in_(OPEN_STATUSES))
            .group_by(Alert.assigned_guard_id)
        ).all()
        if guard_id
    }
    return {
        "view": "dispatch",
        "guard": None,
        "summary": {
            "open_tasks": len(alerts),
            "high_priority": len([alert for alert in alerts if alert.severity == "high"]),
            "acknowledged": len([alert for alert in alerts if alert.acknowledged_at]),
            "guards_on_patrol": len([guard for guard in guards if guard.status == "on_patrol"]),
            "avg_resolution_hours": None,
        },
        "assigned_alerts": [],
        "zone_alerts": [alert_payload(db, alert, include_detection=True) for alert in alerts],
        "guards": [
            {**serialize_guard(guard), "open_tasks": assignments.get(guard.id, 0)}
            for guard in guards
        ],
        "recent_detections": [
            serialize_detection(detection)
            for detection in db.scalars(
                select(Detection).order_by(Detection.detected_at.desc()).limit(12)
            ).all()
        ],
        "open_incidents": [
            serialize_incident(incident)
            for incident in db.scalars(
                select(Incident)
                .where(Incident.status.in_(["open", "verified"]))
                .order_by(Incident.created_at.desc())
            ).all()
        ],
        "response_history": [],
        "task_note": (
            "Dispatch view: all open risk-engine alerts across the demonstration landscape."
        ),
    }
