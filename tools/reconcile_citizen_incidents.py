"""Preview or apply conservative lifecycle repairs for historic citizen reports."""
from __future__ import annotations

import argparse
import json
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from geospatial.species import SPECIES

from backend.database.session import SessionLocal
from backend.models import Alert, Incident, SightingReport
from backend.services.alerts import maybe_create_alert
from backend.services.incident_lifecycle import ACTIVE_ALERTS, close_alert, lock_record, report_location
from backend.services.risk_service import get_settings, score_report_incident


def reconcile(db: Session, *, apply: bool = False) -> dict:
    ids = db.scalars(select(SightingReport.id).where(
        SightingReport.citizen_id.is_not(None), SightingReport.is_simulated.is_(False),
        SightingReport.status == "verified",
    ).order_by(SightingReport.id)).all()
    changes = []
    for report_id in ids:
        report = lock_record(db, SightingReport, report_id) if apply else db.get(SightingReport, report_id)
        decisions = [event for event in report.review_history or [] if event.get("status") in {"verified", "rejected"}]
        decision = decisions[0] if len(decisions) == 1 else {}
        incident = report.incident
        if (report.status != "verified" or decision.get("status") != "verified"
                or not decision.get("reviewer_id") or not decision.get("at")
                or not incident or not incident.verified or incident.is_simulated):
            changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        if apply:
            incident = lock_record(db, Incident, incident.id)
        query = select(Alert).where(Alert.incident_id == incident.id)
        alert = db.scalar(query.with_for_update() if apply else query)
        if alert and (alert.is_simulated or alert.detection_id is not None):
            changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        if incident.status == "resolved" and incident.resolved_at:
            if alert and alert.status in ACTIVE_ALERTS and not alert.resolved_at:
                changes.append({"report_id": report_id, "action": "close_alert"})
                if apply:
                    close_alert(db, alert, "Closed to match the historical incident resolution.",
                                "Lifecycle reconciliation", incident.resolved_at)
                    incident.is_public = False
            elif alert and alert.status != "resolved":
                changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        if incident.status != "verified" or incident.resolved_at:
            changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        if alert:
            if alert.status == "resolved" and alert.resolved_at:
                event = next((e for e in reversed(alert.events) if e.kind == "resolved"), None)
                if event is None:
                    changes.append({"report_id": report_id, "action": "manual_review"})
                    continue
                changes.append({"report_id": report_id, "action": "resolve_incident"})
                if apply:
                    incident.status = "resolved"
                    incident.is_public = False
                    incident.resolved_at = alert.resolved_at
                    incident.resolved_by = event.actor
                    incident.resolution_note = event.note
            elif alert.status not in ACTIVE_ALERTS or alert.resolved_at:
                changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        if (incident.species not in SPECIES or report_location(report) != (incident.lat, incident.lon)
                or report.village_id != incident.village_id):
            changes.append({"report_id": report_id, "action": "manual_review"})
            continue
        changes.append({"report_id": report_id, "action": "publish_missing_alert"})
        if apply:
            settings = get_settings(db)
            risk = score_report_incident(db, incident, settings)
            incident.report_risk = risk
            incident.severity = risk["level"]
            maybe_create_alert(db, incident, risk, settings, actor="Lifecycle reconciliation",
                               publish_reviewed_report=True)
            incident.is_public = True
    return {"mode": "apply" if apply else "dry-run", "examined": len(ids),
            "counts": dict(Counter(item["action"] for item in changes)), "items": changes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit the repairs instead of previewing them.")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        result = reconcile(db, apply=args.apply)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
