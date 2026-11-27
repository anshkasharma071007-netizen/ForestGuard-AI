"""Preview or apply safety-policy corrections to saved automatic citizen assessments."""

import argparse
import json
from math import isfinite

from sqlalchemy import select

from backend.database.session import SessionLocal, validate_runtime_database
from backend.models import Alert, AlertEvent, Incident, SightingReport, utcnow
from backend.services.alerts import public_summary
from backend.services.risk_service import apply_citizen_baseline, get_settings
from geospatial.species import CITIZEN_RISK_BASELINE, normalize_report_animal


def correct(db, *, apply=False):
    settings = get_settings(db)
    query = (select(Incident).join(SightingReport, Incident.report_id == SightingReport.id)
             .where(SightingReport.citizen_id.is_not(None), SightingReport.status == "verified",
                    Incident.verified.is_(True), Incident.is_simulated.is_(False),
                    Incident.status.in_(("verified", "resolved"))).order_by(Incident.report_id))
    if apply:
        query = query.with_for_update(of=Incident)
    changes = []
    for incident in db.scalars(query):
        previous = incident.report_risk or {}
        species = normalize_report_animal(incident.species)
        method = previous.get("assessment_method")
        legacy_automatic = (method is None and previous.get("basis") in {"core_activity", "buffer_proximity", "proximity"}
                            and previous.get("components") and not previous.get("assessed_by_id"))
        if (not (method == "automatic" or legacy_automatic) or previous.get("policy_baseline")
                or species not in CITIZEN_RISK_BASELINE):
            continue
        score = previous.get("score")
        if not isinstance(score, (int, float)) or not isfinite(score):
            continue
        distance = previous.get("distance_km")
        if isinstance(distance, (int, float)) and not isfinite(distance):
            previous = {**previous, "distance_km": None}
        # The old missing-proximity floor was separate from the actual context.
        components = previous.get("components") or []
        floor_points = sum(item["points"] for item in components if item.get("key") == "missing_proximity")
        context = [item for item in components if item.get("key") != "missing_proximity"]
        assessment = apply_citizen_baseline(
            species, {**previous, "assessment_method": "automatic", "score": round(score - floor_points, 3),
                      "reason": previous.get("reason") or "Recorded automatic assessment.", "components": context}, settings,
        )
        alert_query = select(Alert).where(Alert.incident_id == incident.id)
        alert = db.scalar(alert_query.with_for_update() if apply else alert_query)
        severity, corrected_score = assessment["level"], assessment["score"]
        if (incident.severity == previous.get("level") == severity and score == corrected_score and
                (alert is None or (alert.severity == severity and alert.score == corrected_score))):
            continue
        changes.append({"report_id": incident.report_id, "incident_id": incident.id, "species": species,
                        "alert_id": alert.id if alert else None, "old_level": incident.severity,
                        "new_level": severity, "old_score": score, "new_score": corrected_score})
        if apply:
            at = utcnow()
            incident.severity = severity
            incident.species = species
            incident.report_risk = {**assessment, "correction": {
                "at": at.isoformat() + "Z", "previous_assessment": previous,
            }}
            if alert:
                alert.species, alert.severity, alert.score = species, severity, corrected_score
                alert.priority_rank = {"high": 2, "moderate": 3, "low": 4}[severity]
                alert.reason = assessment["reason"]
                alert.public_summary = public_summary(species, severity, [incident.village.name] if incident.village else [])
                db.add(AlertEvent(alert_id=alert.id, kind="risk_corrected", actor="Citizen risk policy",
                                  note=f"Automatic assessment corrected from {score} to {corrected_score}.", created_at=at))
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Persist the listed corrections.")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        validate_runtime_database(db)
        changes = correct(db, apply=args.apply)
    print(json.dumps({"mode": "applied" if args.apply else "dry-run", "changes": changes}, indent=2))


if __name__ == "__main__":
    main()
