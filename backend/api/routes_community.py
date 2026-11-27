from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
from uuid import UUID
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from geospatial.species import SPECIES, SPECIES_ORDER, species_meta

from backend import config
from backend.api.routes_citizen import onboarded_citizen
from backend.api.utils import now_iso, public_area_label
from backend.database.session import get_db
from backend.models import Alert, Incident, SightingReport, Village, utcnow
from backend.models.entities import Citizen
from backend.services.report_analysis import evidence_path
from backend.services.alerts import public_summary
from backend.services.incident_lifecycle import ACTIVE_ALERTS, lifecycle_status
from backend.services.serializers import serialize_village, species_info

router = APIRouter(prefix="/api/community", tags=["community"])
citizen_router = APIRouter(prefix="/api/citizen", tags=["citizen reports"])

GENERAL_GUIDELINES = [
    "Do not approach, chase, surround or corner a wild animal. Give it a clear escape route.",
    "Move indoors or into a vehicle in a group, and keep children and livestock supervised.",
    "Avoid forest roads and field edges after dusk; travel in groups and carry a light.",
    "Do not use firecrackers, flashlights or loudspeakers near elephants — these can provoke charges.",
    "Report sightings through this portal or the forest helpline. Do not attempt to intervene.",
    "Never feed wildlife or leave crop, compost or food waste exposed at the forest edge.",
]


def _active_public_alerts():
    owned = select(SightingReport.id).where(SightingReport.id == Incident.report_id,
                                           SightingReport.citizen_id.is_not(None)).exists()
    query = (select(Alert).outerjoin(Incident, Alert.incident_id == Incident.id)
             .where(Alert.status.in_(ACTIVE_ALERTS),
                    or_(Alert.incident_id.is_(None),
                        Incident.verified.is_(True) & (Incident.status == "verified"))))
    return query, owned


def _public_alert(db: Session, alert: Alert, *, approximate: bool = False) -> dict:
    villages = []
    if alert.village_ids:
        villages = db.scalars(select(Village).where(Village.id.in_(alert.village_ids))).all()
    codes = [village.code for village in villages]
    meta = species_meta(alert.species)
    payload = {
        "id": alert.id,
        "species": alert.species,
        "species_name": meta["name"],
        "color": meta["color"],
        "severity": alert.severity,
        "status": alert.status,
        "created_at": alert.created_at.isoformat() + "Z",
        "area_label": public_area_label(codes),
        "village_names": [village.name for village in villages],
        "summary": alert.public_summary,
        "advice": meta["advice"],
        "is_simulated": alert.is_simulated,
        "note": "Location detail is intentionally coarse. Contact your range office for field guidance.",
    }
    incident = db.get(Incident, alert.incident_id) if alert.incident_id else None
    report = db.get(SightingReport, incident.report_id) if incident and incident.report_id else None
    if report and report.citizen_id is not None:
        public_village = incident.village
        names = [public_village.name] if public_village else []
        payload["village_names"] = names
        payload["area_label"] = public_area_label([public_village.code]) if public_village else "Approximate incident area"
        payload["summary"] = public_summary(alert.species, alert.severity, names)
        if approximate:
            # Use the submitted village center or a GPS grid center roughly 11 km apart.
            payload["approximate_locations"] = [
                {"lat": round(public_village.lat, 2), "lon": round(public_village.lon, 2)} if public_village
                else {"lat": round(incident.lat, 1), "lon": round(incident.lon, 1)}
            ]
    elif approximate:
        payload["approximate_locations"] = [
            {"lat": round(village.lat, 2), "lon": round(village.lon, 2)} for village in villages
            if -90 <= village.lat <= 90 and -180 <= village.lon <= 180
        ]
    return payload


@router.get("/alerts")
def public_alerts(
    days: int = Query(default=21, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=50),
    field_only: bool = False,
    verified_only: bool = False,
    village_code: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    query, owned = _active_public_alerts()
    query = query.where(or_(owned, Alert.created_at >= utcnow() - timedelta(days=days)))
    query = query.order_by(Alert.created_at.desc(), Alert.id.desc())
    if field_only:
        query = query.where(Alert.is_simulated.is_(False))
    if verified_only:
        query = query.where(Incident.verified.is_(True))
    if village_code:
        village_id = db.scalar(select(Village.id).where(Village.code == village_code))
        if village_id is None:
            raise HTTPException(400, "Unknown village.")
        if db.get_bind().dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB
            query = query.where(Alert.village_ids.cast(JSONB).contains([village_id]))
        else:
            ids = func.json_each(Alert.village_ids).table_valued("value")
            query = query.where(select(ids.c.value).where(ids.c.value == village_id).exists())
    alerts = db.scalars(query.limit(limit)).all()
    return {
        "items": [_public_alert(db, alert, approximate=verified_only) for alert in alerts],
        "window_days": days,
        "note": (
            "Public advisories deliberately omit camera locations, detection coordinates and "
            "patrol positions. Demonstration records are synthetic."
        ),
        "updated_at": now_iso(),
    }


@router.get("/summary")
def community_summary(db: Session = Depends(get_db)) -> dict:
    query, _ = _active_public_alerts()
    active = db.scalars(query.order_by(Alert.status, Alert.id)).all()
    villages = db.scalars(select(Village).order_by(Village.name)).all()
    reports = db.scalar(select(func.count(SightingReport.id))) or 0
    high = [alert for alert in active if alert.severity == "high"]
    return {
        "active_advisories": len(active),
        "high_priority_advisories": len(high),
        "villages_covered": len(villages),
        "community_reports_received": reports,
        "latest_advisories": [_public_alert(db, alert) for alert in active[:3]],
        "villages": [serialize_village(village, public=True) for village in villages],
        "helplines": {
            "forest_control_room": "1926 (national forest helpline)",
            "wildlife_emergency": "Contact the range office listed by your village committee",
            "police": "112",
        },
        "note": "Simulated advisories are labelled separately from field advisories.",
    }


def _receipt(report: SightingReport) -> dict:
    status = report.status
    if report.citizen_id is not None and status == "verified" and report.incident:
        status = _citizen_report_status(report, report.incident.status)
    return {
        "reference_code": report.reference_code,
        "status": status,
        **({"lifecycle_status": lifecycle_status(report, report.incident.status if report.incident else None)}
           if report.citizen_id is not None else {}),
        "message": (
            "Report received. Your range office will review it. If there is an immediate danger "
            "to life, call 112 or the forest helpline (1926)."
        ),
        "contact_note": "Keep the reference code to check the status of this report.",
    }


def _reference(db: Session, keyed: bool) -> str:
    if keyed:
        return f"FG-{secrets.token_hex(12).upper()}"
    # Older clients validate FG-YYYY-NNNN; their lookup only exposes the status summary.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(71239411)"))
    for _ in range(40):
        code = f"FG-{utcnow().year}-{secrets.randbelow(9000) + 1000}"
        if not db.scalar(select(SightingReport.id).where(SightingReport.reference_code == code)):
            return code
    raise HTTPException(503, "Could not allocate a reference. Retry shortly.")


def _read_photo(upload: UploadFile) -> tuple[bytes, str]:
    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    content = upload.file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, f"Photo exceeds the {config.MAX_UPLOAD_MB} MB limit.")
    try:
        with Image.open(io.BytesIO(content)) as image:
            extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}.get(image.format)
            if not extension or image.width * image.height > 32_000_000 or getattr(image, "is_animated", False):
                raise ValueError()
            if upload.content_type not in {Image.MIME[image.format], "application/octet-stream"}:
                raise ValueError()
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            image.load()
    except (ValueError, SyntaxError, OSError, Image.DecompressionBombError, UnidentifiedImageError):
        raise HTTPException(400, "Attach a readable JPEG, PNG or WebP photo of up to 32 megapixels.")
    return content, extension


@router.post("/reports", status_code=201)
def submit_report(
    category: str = Form(default="sighting"),
    species: str = Form(default="unidentified"),
    description: str = Form(..., max_length=4000),
    reporter_name: str = Form(..., max_length=120),
    contact: str | None = Form(default=None, max_length=80),
    village_code: str | None = Form(default=None, max_length=20),
    lat: float | None = Form(default=None),
    lon: float | None = Form(default=None),
    submission_key: UUID | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
) -> dict:
    description, reporter_name = description.strip(), reporter_name.strip()
    contact = (contact or "").strip() or None
    if len(description) < 12 or not reporter_name:
        raise HTTPException(400, "Enter your name and a description of at least 12 characters.")
    return _persist_report(db, category=category, species=species, description=description,
                           reporter_name=reporter_name, contact=contact, village_code=village_code,
                           lat=lat, lon=lon, submission_key=submission_key, image=image)


@citizen_router.post("/reports", status_code=201)
def submit_citizen_report(
    title: str = Form(..., max_length=120),
    category: str = Form(...),
    species: str = Form(default="unidentified"),
    description: str = Form(default="", max_length=4000),
    village_code: str | None = Form(default=None, max_length=20),
    lat: float | None = Form(default=None),
    lon: float | None = Form(default=None),
    submission_key: UUID = Form(...),
    image: UploadFile | None = File(default=None),
    citizen: Citizen = Depends(onboarded_citizen),
    db: Session = Depends(get_db),
) -> dict:
    title = title.strip()
    if not title:
        raise HTTPException(400, "Enter a report title.")
    return _persist_report(db, category=category, species=species, description=description.strip(), title=title,
                           reporter_name=citizen.name, contact=citizen.phone, citizen_id=citizen.id,
                           village_code=village_code, lat=lat, lon=lon, submission_key=submission_key, image=image)


def _persist_report(
    db: Session, *, category: str, species: str, description: str, reporter_name: str, contact: str | None,
    village_code: str | None, lat: float | None, lon: float | None, submission_key: UUID | None,
    image: UploadFile | None, title: str | None = None, citizen_id: int | None = None,
) -> dict:
    if category not in {"sighting", "conflict"} or species not in SPECIES:
        raise HTTPException(400, "Choose a supported category and species.")
    if any("\x00" in value for value in (title or "", description, reporter_name, contact or "", village_code or "")):
        raise HTTPException(400, "Remove invalid characters from the report.")
    if (lat is None) != (lon is None) or (lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180)):
        raise HTTPException(400, "Provide a valid latitude and longitude.")
    village = db.scalar(select(Village).where(Village.code == village_code)) if village_code else None
    if (village_code and not village) or (lat is None and not village):
        raise HTTPException(400, "Capture GPS coordinates or choose a village from the list.")

    content, extension = _read_photo(image) if image else (None, None)
    key = str(submission_key) if submission_key else None
    fields = dict(category=category, species=species, description=description, reporter_name=reporter_name,
                  contact=contact, lat=lat, lon=lon, village_id=village.id if village else None)
    # Keep the legacy digest stable. Profile edits must not change a citizen's retry fingerprint.
    digest_fields = fields if citizen_id is None else {
        key: value for key, value in fields.items() if key not in {"reporter_name", "contact"}
    } | {"title": title}
    digest = hashlib.sha256(json.dumps([digest_fields, hashlib.sha256(content).hexdigest() if content else None],
                                       sort_keys=True).encode()).hexdigest()

    def replay():
        existing = db.scalar(select(SightingReport).where(SightingReport.submission_key == key))
        if existing and (existing.citizen_id != citizen_id or existing.submission_digest != digest):
            raise HTTPException(409, "This submission key was already used for a different report.")
        return _receipt(existing) if existing else None

    if key and (previous := replay()):
        return previous
    relative = f"community/{secrets.token_hex(16)}.{extension}" if content else None
    path = Path(config.UPLOAD_DIR) / relative if relative else None
    report = SightingReport(**fields, citizen_id=citizen_id, title=title, image_path=relative, status="pending", is_simulated=False,
                            reference_code=_reference(db, key is not None),
                            submission_key=key, submission_digest=digest if key else None,
                            analysis_status="queued" if path else "no_photo")
    try:
        db.add(report)
        db.flush()
    except IntegrityError:
        db.rollback()
        if key and (previous := replay()):
            return previous
        raise

    if path:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
        except OSError:
            path.unlink(missing_ok=True)
            raise
    # A connection failure during COMMIT has an ambiguous outcome. Keep the evidence
    # available for a committed row; the retry key resolves the request on reconnect.
    db.commit()
    return _receipt(report)


@router.post("/report-receipt")
def recover_receipt(submission_key: UUID = Form(...), db: Session = Depends(get_db)):
    return _recover_receipt(db, submission_key, None)


@citizen_router.post("/report-receipt")
def recover_citizen_receipt(submission_key: UUID = Form(...), citizen: Citizen = Depends(onboarded_citizen),
                            db: Session = Depends(get_db)):
    return _recover_receipt(db, submission_key, citizen.id)


def _recover_receipt(db: Session, submission_key: UUID, citizen_id: int | None) -> dict:
    report = db.scalar(select(SightingReport).where(SightingReport.submission_key == str(submission_key),
                                                  SightingReport.citizen_id == citizen_id))
    if not report:
        raise HTTPException(404, "Submission has not been received.")
    return _receipt(report)


@router.get("/reports/{reference_code}")
def report_status(reference_code: str, db: Session = Depends(get_db)) -> dict:
    report = db.scalar(
        select(SightingReport).where(SightingReport.reference_code == reference_code.strip().upper(),
                                     SightingReport.citizen_id.is_(None))
    )
    if not report:
        raise HTTPException(status_code=404, detail="No report found with that reference code.")
    return {
        "reference_code": report.reference_code,
        "category": report.category,
        "species_name": species_meta(report.species)["name"],
        "description": report.description if len(report.reference_code) >= 27 or report.is_simulated else None,
        "village_name": report.village.name if report.village else None,
        "status": report.status,
        "created_at": report.created_at.isoformat() + "Z",
        "status_note": {
            "pending": "Received and queued for range-office review.",
            "forwarded": "Forwarded to a field team for verification.",
            "verified": "Verified by the range office.",
            "rejected": "Reviewed and rejected by the range office.",
            "closed": "Reviewed and closed by the range office.",
        }.get(report.status, "Status under review."),
    }


def _citizen_report_status(report: SightingReport, incident_status: str | None) -> str:
    return "closed" if report.status == "verified" and incident_status == "resolved" else report.status


def _citizen_summary(report: SightingReport, incident_status: str | None) -> dict:
    return {"title": report.title, "reference_code": report.reference_code,
            "status": _citizen_report_status(report, incident_status),
            "lifecycle_status": lifecycle_status(report, incident_status),
            "created_at": report.created_at.isoformat() + "Z"}


@citizen_router.get("/reports")
def citizen_reports(citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    reports = db.execute(select(SightingReport, Incident.status).outerjoin(Incident, Incident.report_id == SightingReport.id)
                         .where(SightingReport.citizen_id == citizen.id)
                         .order_by(SightingReport.created_at.desc(), SightingReport.id.desc())).all()
    return {"items": [_citizen_summary(report, status) for report, status in reports]}


def _owned_report(db: Session, reference_code: str, citizen: Citizen) -> SightingReport:
    report = db.scalar(select(SightingReport).where(SightingReport.reference_code == reference_code.strip().upper(),
                                                  SightingReport.citizen_id == citizen.id))
    if not report:
        raise HTTPException(404, "That report could not be found.")
    return report


@citizen_router.get("/reports/{reference_code}")
def citizen_report(reference_code: str, citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    report = _owned_report(db, reference_code, citizen)
    rejection = next((event.get("note") for event in reversed(report.review_history or [])
                      if event.get("status") == "rejected"), None)
    return {**_citizen_summary(report, report.incident.status if report.incident else None),
            "category": report.category, "species_name": species_meta(report.species)["name"],
            "rejection_reason": rejection if report.status == "rejected" else None,
            "confirmed_species_name": species_meta(report.incident.species)["name"] if report.incident else None,
            "description": report.description, "village_name": report.village.name if report.village else None,
            "lat": report.lat, "lon": report.lon, "has_photo": bool(report.image_path),
            "analysis_status": report.analysis_status,
            "suggested_species": [species_meta(item["species"])["name"] for item in report.analysis_results or []
                                  if item.get("species") in SPECIES and item["species"] != "unidentified"]}


@citizen_router.get("/reports/{reference_code}/evidence")
def citizen_report_evidence(reference_code: str, citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    report = _owned_report(db, reference_code, citizen)
    if report.image_path:
        try:
            return FileResponse(evidence_path(report.image_path), headers={"Cache-Control": "private, no-store",
                                "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"})
        except FileNotFoundError:
            pass
    raise HTTPException(404, "Photo unavailable.")


@router.get("/guidelines")
def guidelines(db: Session = Depends(get_db)) -> dict:
    return {
        "general": GENERAL_GUIDELINES,
        "species": [
            {
                **species_info(key),
                "description": species_meta(key)["description"],
                "advice": species_meta(key)["advice"],
            }
            for key in SPECIES_ORDER
        ],
        "emergency": [
            "If a wild animal is inside a settlement, do not surround it. Clear the area and call the forest helpline.",
            "If someone is injured, call 112 first, then inform the range office.",
            "Keep livestock secured and do not chase predators or elephants with vehicles.",
        ],
        "source_note": (
            "Guidance summarises common forest-department safety advice for the demonstration "
            "region. It is not a substitute for local instructions or emergency services."
        ),
    }


@router.get("/villages")
def public_villages(db: Session = Depends(get_db)) -> dict:
    villages = db.scalars(select(Village).order_by(Village.name)).all()
    return {
        "items": [
            {
                "code": village.code,
                "name": village.name,
                "district": village.district,
                "population": village.population,
                "risk_level": village.risk_level,
            }
            for village in villages
        ],
        "note": "Village list for report submission. Exact coordinates are not published here.",
    }
