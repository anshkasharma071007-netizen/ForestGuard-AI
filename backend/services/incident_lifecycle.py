from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Alert, AlertEvent, Incident, SightingReport, User, utcnow
from backend.models.entities import CitizenNotification
from backend.services.alerts import maybe_create_alert
from backend.services.risk_service import get_settings, score_report_incident
from geospatial.species import REPORT_ANIMALS, SPECIES_ORDER
from geospatial.mapping import valid_coordinates

PENDING = ("pending", "forwarded")
ACTIVE_ALERTS = ("active", "acknowledged", "responding")


def lock_record(db: Session, model, record_id: int):
    # SQLite has no row locks. Acquire its writer lock before checking state.
    if db.get_bind().dialect.name == "sqlite" and not db.connection().connection.driver_connection.in_transaction:
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    record = db.scalar(select(model).where(model.id == record_id).with_for_update()
                       .execution_options(populate_existing=True))
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found.")
    return record


def lifecycle_status(report: SightingReport, incident_status: str | None) -> str:
    if report.status == "verified":
        if incident_status == "resolved":
            return "resolved"
        if incident_status == "verified":
            return "under_work"
    if report.status == "rejected":
        return "rejected"
    if report.status == "closed" and report.citizen_id is None:
        return "closed"
    return "pending"


def report_location(report: SightingReport) -> tuple[float, float] | None:
    if report.lat is not None and report.lon is not None:
        if valid_coordinates(report.lat, report.lon):
            return report.lat, report.lon
        return None
    if (report.lat is None and report.lon is None and report.village
            and valid_coordinates(report.village.lat, report.village.lon)):
        return report.village.lat, report.village.lon
    return None


def report_incident_for_review(report: SightingReport, confirmed_species: str | None) -> Incident:
    animal = confirmed_species or report.species
    if animal not in REPORT_ANIMALS:
        raise HTTPException(400, "Choose a supported animal.")
    location = report_location(report)
    if location is None:
        raise HTTPException(409, "This report has no valid incident location.")
    return Incident(report_id=report.id, category=report.category, species=animal,
                    lat=location[0], lon=location[1], village_id=report.village_id,
                    description=report.description, verified=True, status="verified",
                    is_simulated=report.is_simulated, is_public=False, reported_by="Community report",
                    created_at=report.created_at)


def notify_citizen(db: Session, report: SightingReport, event: str, at) -> None:
    if report.citizen_id is not None:
        db.add(CitizenNotification(report_id=report.id, citizen_id=report.citizen_id, event=event, created_at=at))


def review_report(db: Session, report: SightingReport, status: str, note: str | None,
                  confirmed_species: str | None, user: User, *, citizen_note: str | None = None,
                  risk_level: str | None = None, risk_reason: str | None = None) -> bool:
    if report.status == status:
        return False
    if report.status not in PENDING or report.incident:
        raise HTTPException(409, "This report already has a final review decision.")
    # Preserve forwarding for older anonymous community clients.
    if status not in {"verified", "rejected"} and not (status == "forwarded" and report.citizen_id is None):
        raise HTTPException(409, "Pending reports can only be approved or rejected.")
    note = (note or "").strip()
    # Legacy rejection clients already use note for the citizen-facing reason.
    shared_note = (citizen_note if citizen_note is not None else note if status == "rejected" else "").strip()
    reason = (risk_reason or "").strip()
    if any("\x00" in value for value in (note, shared_note, reason)):
        raise HTTPException(400, "Remove invalid characters from the notes.")
    if status == "rejected" and not shared_note:
        raise HTTPException(400, "Enter a rejection reason.")
    if status != "verified" and (confirmed_species is not None or risk_level is not None):
        raise HTTPException(400, "Assess the animal and risk when approving a report.")
    now = utcnow()
    if status == "verified":
        incident = report_incident_for_review(report, confirmed_species)
        owned = report.citizen_id is not None
        manual = owned and incident.species not in SPECIES_ORDER
        if manual and not risk_level:
            raise HTTPException(400, "Select a risk level for this animal.")
        if risk_level and (not owned or (not manual and user.role != "admin")):
            raise HTTPException(403, "Only an administrator can override automatic risk.")
        if risk_level and not reason:
            raise HTTPException(400, "Enter a risk assessment reason.")
        settings = get_settings(db)
        automatic = None if manual else score_report_incident(db, incident, settings, citizen_report=owned)
        risk = automatic
        if risk_level:
            method = "manual" if manual else "override"
            risk = {
                "score": settings.thresholds.get(risk_level, 0.0), "level": risk_level,
                "basis": method, "basis_label": "Manual assessment" if manual else "Manual override",
                "assessment_method": method, "reason": reason, "assessment_reason": reason,
                "assessed_by": user.name, "assessed_by_id": user.id, "assessed_at": now.isoformat() + "Z",
                "original_assessment": automatic,
            }
        report.incident = incident
        db.add(incident)
        db.flush()
        incident.report_risk = risk
        incident.severity = risk["level"]
        alert = maybe_create_alert(db, incident, risk, settings, actor=user.name,
                                   publish_reviewed_report=report.citizen_id is not None)
        if report.citizen_id is not None and alert is None:
            raise RuntimeError("Approved citizen report has no linked alert.")
        incident.is_public = alert is not None
    report.review_history = [*(report.review_history or []), {
        "previous_status": report.status, "status": status, "note": note, "reviewer_id": user.id,
        "citizen_note": shared_note or None, "reviewer_name": user.name, "at": now.isoformat() + "Z",
    }]
    report.status = status
    if status in {"verified", "rejected"}:
        notify_citizen(db, report, "approved" if status == "verified" else "rejected", now)
    return True


def close_alert(db: Session, alert: Alert, note: str, actor: str, at) -> None:
    if alert.status != "resolved":
        alert.status = "resolved"
        alert.acknowledged_at = alert.acknowledged_at or at
        alert.resolved_at = at
        db.add(AlertEvent(alert_id=alert.id, kind="resolved", note=note, actor=actor, created_at=at))


def resolve_incident(db: Session, incident: Incident, user: User, note: str | None,
                     citizen_note: str | None = None) -> None:
    # Both API paths lock the incident before locking its alert.
    report = None
    if incident.report_id is not None:
        report = db.get(SightingReport, incident.report_id)
        if not report or report.status != "verified" or not incident.verified or incident.status not in {"verified", "resolved"}:
            raise HTTPException(409, "Only an approved report incident can be resolved.")
    alert = db.scalar(select(Alert).where(Alert.incident_id == incident.id).with_for_update()
                      .execution_options(populate_existing=True))
    if incident.status == "resolved":
        # The history reconciliation command can close inconsistent legacy alerts.
        return
    note = (note or "").strip()
    shared_note = (citizen_note or "").strip()
    if "\x00" in note or "\x00" in shared_note:
        raise HTTPException(400, "Remove invalid characters from the resolution notes.")
    now = utcnow()
    incident.status = "resolved"
    incident.is_public = False
    incident.resolved_at = now
    incident.resolved_by = user.name
    incident.resolved_by_id = user.id
    incident.resolution_note = note or None
    incident.citizen_resolution_note = shared_note or None
    if alert:
        close_alert(db, alert, note or "Incident resolved.", user.name, now)
    if report:
        notify_citizen(db, report, "resolved", now)
