from __future__ import annotations

import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geospatial.species import SPECIES, SPECIES_ORDER, species_meta

from backend import config
from backend.api.utils import now_iso, public_area_label
from backend.database.session import get_db
from backend.models import Alert, Incident, SightingReport, Village, utcnow
from backend.services.serializers import serialize_sighting, serialize_village, species_info

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
    db: Session = Depends(get_db),
) -> dict:
    alerts = db.scalars(
        select(Alert)
        .where(
            Alert.created_at >= utcnow() - timedelta(days=days),
            Alert.status.in_(["active", "acknowledged", "responding"]),
        )
        .order_by(Alert.created_at.desc())
        .limit(limit)
    ).all()
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
        "note": "Demonstration portal. Advisories are generated from synthetic data for this prototype.",
    }


def _next_reference(db: Session) -> str:
    year = utcnow().year
    for _ in range(20):
        candidate = f"FG-{year}-{secrets.randbelow(9000) + 1000}"
        exists = db.scalar(
            select(func.count(SightingReport.id)).where(
                SightingReport.reference_code == candidate
            )
        )
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Could not allocate a report reference.")


@router.post("/reports", status_code=201)
async def submit_report(
    category: str = Form(default="sighting"),
    species: str = Form(default="unidentified"),
    description: str = Form(...),
    reporter_name: str = Form(...),
    contact: str | None = Form(default=None),
    village_code: str | None = Form(default=None),
    lat: float | None = Form(default=None),
    lon: float | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if category not in {"sighting", "conflict"}:
        raise HTTPException(status_code=400, detail="Category must be 'sighting' or 'conflict'.")
    if species not in SPECIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported species. Choose one of: {', '.join(SPECIES_ORDER + ['unidentified'])}.",
        )
    if len(description.strip()) < 12:
        raise HTTPException(status_code=400, detail="Please describe what was observed (at least 12 characters).")
    if (lat is None) != (lon is None):
        raise HTTPException(status_code=400, detail="Provide both latitude and longitude, or neither.")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Coordinates are outside the valid range.")

    village = None
    if village_code:
        village = db.scalar(select(Village).where(Village.code == village_code))

    image_rel = None
    if image is not None and image.filename:
        content_type = (image.content_type or "").lower()
        if content_type not in config.ALLOWED_IMAGE_TYPES and not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Attach a JPEG, PNG or WebP photograph.")
        extension = os.path.splitext(image.filename)[1].lower() or ".jpg"
        target_dir = os.path.join(config.UPLOAD_DIR, "community")
        os.makedirs(target_dir, exist_ok=True)
        stored = f"{secrets.token_hex(8)}{extension}"
        target_path = os.path.join(target_dir, stored)
        size = 0
        try:
            with open(target_path, "wb") as handle:
                while chunk := await image.read(1024 * 1024):
                    size += len(chunk)
                    if size > config.MAX_UPLOAD_MB * 1024 * 1024:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Photo exceeds the {config.MAX_UPLOAD_MB} MB limit.",
                        )
                    handle.write(chunk)
        except HTTPException:
            if os.path.exists(target_path):
                os.remove(target_path)
            raise
        finally:
            await image.close()
        if size == 0:
            os.remove(target_path)
            raise HTTPException(status_code=400, detail="The attached photo was empty.")
        image_rel = f"community/{stored}"

    report = SightingReport(
        reference_code=_next_reference(db),
        category=category,
        species=species,
        description=description.strip()[:4000],
        lat=lat,
        lon=lon,
        village_id=village.id if village else None,
        reporter_name=reporter_name.strip()[:120],
        contact=(contact or "").strip()[:80] or None,
        image_path=image_rel,
        status="pending",
        is_simulated=False,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {
        "reference_code": report.reference_code,
        "status": report.status,
        "message": (
            "Report received. Your range office will review it. If there is an immediate danger "
            "to life, call 112 or the forest helpline (1926)."
        ),
        "contact_note": "Keep the reference code to check the status of this report.",
    }


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
        "description": report.description,
        "village_name": report.village.name if report.village else None,
        "status": report.status,
        "created_at": report.created_at.isoformat() + "Z",
        "status_note": {
            "pending": "Received and queued for range-office review.",
            "forwarded": "Forwarded to a field team for verification.",
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
