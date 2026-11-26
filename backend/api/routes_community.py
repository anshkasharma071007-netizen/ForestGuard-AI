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
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from geospatial.species import SPECIES, SPECIES_ORDER, species_meta

from backend import config
from backend.api.utils import now_iso, public_area_label
from backend.database.session import get_db
from backend.models import Alert, SightingReport, Village, utcnow
from backend.services.serializers import serialize_village, species_info

router = APIRouter(prefix="/api/community", tags=["community"])

GENERAL_GUIDELINES = [
    "Do not approach, chase, surround or corner a wild animal. Give it a clear escape route.",
    "Move indoors or into a vehicle in a group, and keep children and livestock supervised.",
    "Avoid forest roads and field edges after dusk; travel in groups and carry a light.",
    "Do not use firecrackers, flashlights or loudspeakers near elephants — these can provoke charges.",
    "Report sightings through this portal or the forest helpline. Do not attempt to intervene.",
    "Never feed wildlife or leave crop, compost or food waste exposed at the forest edge.",
]


def _public_alert(db: Session, alert: Alert) -> dict:
    villages = []
    if alert.village_ids:
        villages = db.scalars(select(Village).where(Village.id.in_(alert.village_ids))).all()
    codes = [village.code for village in villages]
    meta = species_meta(alert.species)
    return {
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


@router.get("/alerts")
def public_alerts(
    days: int = Query(default=21, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=50),
    field_only: bool = False,
    village_code: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    query = (select(Alert)
        .where(
            Alert.created_at >= utcnow() - timedelta(days=days),
            Alert.status.in_(["active", "acknowledged", "responding"]),
        )
        .order_by(Alert.created_at.desc())
    )
    if field_only:
        query = query.where(Alert.is_simulated.is_(False))
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
        "items": [_public_alert(db, alert) for alert in alerts],
        "window_days": days,
        "note": (
            "Public advisories deliberately omit camera locations, detection coordinates and "
            "patrol positions. Demonstration records are synthetic."
        ),
        "updated_at": now_iso(),
    }


@router.get("/summary")
def community_summary(db: Session = Depends(get_db)) -> dict:
    active = db.scalars(
        select(Alert).where(Alert.status.in_(["active", "acknowledged", "responding"]))
        .order_by(Alert.status, Alert.id)
    ).all()
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
    return {
        "reference_code": report.reference_code,
        "status": report.status,
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
    if category not in {"sighting", "conflict"} or species not in SPECIES:
        raise HTTPException(400, "Choose a supported category and species.")
    description, reporter_name = description.strip(), reporter_name.strip()
    contact = (contact or "").strip() or None
    if len(description) < 12 or not reporter_name:
        raise HTTPException(400, "Enter your name and a description of at least 12 characters.")
    if any("\x00" in value for value in (description, reporter_name, contact or "", village_code or "")):
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
    digest = hashlib.sha256(json.dumps([fields, hashlib.sha256(content).hexdigest() if content else None],
                                       sort_keys=True).encode()).hexdigest()

    def replay():
        existing = db.scalar(select(SightingReport).where(SightingReport.submission_key == key))
        if existing and existing.submission_digest != digest:
            raise HTTPException(409, "This submission key was already used for a different report.")
        return _receipt(existing) if existing else None

    if key and (previous := replay()):
        return previous
    relative = f"community/{secrets.token_hex(16)}.{extension}" if content else None
    path = Path(config.UPLOAD_DIR) / relative if relative else None
    report = SightingReport(**fields, image_path=relative, status="pending", is_simulated=False,
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
    report = db.scalar(select(SightingReport).where(SightingReport.submission_key == str(submission_key)))
    if not report:
        raise HTTPException(404, "Submission has not been received.")
    return _receipt(report)


@router.get("/reports/{reference_code}")
def report_status(reference_code: str, db: Session = Depends(get_db)) -> dict:
    report = db.scalar(
        select(SightingReport).where(SightingReport.reference_code == reference_code.strip().upper())
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
