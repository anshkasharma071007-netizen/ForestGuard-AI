from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend import config
from backend.api.deps import require_guard
from backend.database.session import get_db
from backend.models import Alert, Incident, SightingReport, User
from backend.services.geography import authority_scope
from backend.services.incident_lifecycle import ACTIVE_ALERTS, PENDING
from backend.services.serializers import iso, serialize_incident

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
    }
