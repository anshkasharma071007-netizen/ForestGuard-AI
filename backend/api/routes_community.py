from __future__ import annotations

import hashlib
import io
import json
from uuid import UUID
import secrets
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, literal_column, or_, select, text, update
from sqlalchemy.orm import Session, selectinload

from geospatial.mapping import valid_coordinates
from geospatial.species import REPORT_ANIMALS, SPECIES_ORDER, normalize_report_animal, species_meta

from backend import config
from backend.api.routes_citizen import AlertRadius, LocationLabel, onboarded_citizen, saved_alert_location
from backend.api.utils import now_iso, public_area_label
from backend.database.session import get_db
from backend.models import Alert, Incident, SightingReport, Village, utcnow
from backend.models.entities import Citizen, CitizenNotification
from backend.services.geography import jurisdiction_at, lock_routing, postgis
from backend.services.media import evidence_response, save_evidence
from backend.services.alerts import public_summary
from backend.services.incident_lifecycle import ACTIVE_ALERTS, lifecycle_status
from backend.services.serializers import iso, serialize_village, species_info, village_identity
from backend.services.villages import is_demo_village, resolve_village, village_center

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
    return (select(Alert).outerjoin(Incident, Alert.incident_id == Incident.id)
            .where(Alert.status.in_(ACTIVE_ALERTS),
                   or_(Alert.incident_id.is_(None),
                       Incident.verified.is_(True) & (Incident.status == "verified"))))


def _public_alert(db: Session, alert: Alert, *, approximate: bool = False) -> dict:
    villages = []
    if alert.village_ids:
        villages = db.scalars(select(Village).where(Village.id.in_(alert.village_ids))).all()
    meta = species_meta(alert.species)
    payload = {
        "id": alert.id,
        "species": alert.species,
        "species_name": meta["name"],
        "color": meta["color"],
        "severity": alert.severity,
        "status": alert.status,
        "created_at": alert.created_at.isoformat() + "Z",
        "area_label": public_area_label(villages),
        "village_names": [village.name for village in villages],
        "village_ids": [village.id for village in villages],
        "has_demo_geography": any(is_demo_village(village) for village in villages),
        "summary": alert.public_summary,
        "advice": meta["advice"],
        "is_simulated": alert.is_simulated,
        "note": "Location detail is intentionally coarse. Contact your range office for field guidance.",
    }
    incident = db.get(Incident, alert.incident_id) if alert.incident_id else None
    report = db.get(SightingReport, incident.report_id) if incident and incident.report_id else None
    if report and report.citizen_id is not None:
        animal = REPORT_ANIMALS.get(alert.species, REPORT_ANIMALS["unidentified"])["name"]
        payload["alert_title"] = f"{animal} {'conflict' if incident.category == 'conflict' else 'sighting'}"
        public_village = incident.village
        if public_village and not valid_coordinates(public_village.lat, public_village.lon):
            public_village = None
        names = [public_village.name] if public_village else []
        payload["village_names"] = names
        payload["village_ids"] = [public_village.id] if public_village else []
        payload["has_demo_geography"] = bool(public_village and is_demo_village(public_village))
        payload["area_label"] = public_area_label([public_village]) if public_village else "Approximate incident area"
        payload["summary"] = public_summary(alert.species, alert.severity, names)
        if approximate:
            # Use the submitted village center or a GPS grid center roughly 11 km apart.
            payload["approximate_locations"] = [
                village_center(public_village, public=True) if public_village
                else {"lat": round(incident.lat, 1), "lon": round(incident.lon, 1)}
            ]
    elif approximate:
        payload["approximate_locations"] = [
            village_center(village, public=True) for village in villages
            if valid_coordinates(village.lat, village.lon)
        ]
    return payload


@router.get("/alerts")
def public_alerts(
    days: int = Query(default=21, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=50),
    field_only: bool = False,
    verified_only: bool = False,
    village_code: str | None = None,
    village_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> dict:
    query = _active_public_alerts().where(
        or_(Incident.id.is_not(None), Alert.created_at >= utcnow() - timedelta(days=days)),
    )
    query = query.order_by(Alert.created_at.desc(), Alert.id.desc())
    if field_only:
        query = query.where(Alert.is_simulated.is_(False))
    if verified_only:
        query = query.where(Incident.verified.is_(True))
    village = resolve_village(db, village_id=village_id, village_code=village_code)
    if village is not None:
        village_id = village.id
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


class NearbyAlertQuery(BaseModel):
    source: Literal["saved", "gps", "selected"] = "saved"
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    radius_km: AlertRadius | None = None
    sort: Literal["time", "risk", "distance"] = "time"
    limit: int = Field(default=20, ge=1, le=50)
    offset: int = Field(default=0, ge=0)


@citizen_router.post("/nearby-alerts")
def nearby_alerts(
    payload: NearbyAlertQuery,
    citizen: Citizen = Depends(onboarded_citizen),
    db: Session = Depends(get_db),
):
    lat, lon = payload.lat, payload.lon
    if payload.source == "saved":
        if lat is not None or lon is not None:
            raise HTTPException(400, "Choose a saved location or provide coordinates.")
        location = saved_alert_location(citizen)
        if location is None:
            raise HTTPException(400, "Choose current GPS or save a location in your profile.")
        lat, lon = location["lat"], location["lon"]
    if not valid_coordinates(lat, lon):
        raise HTTPException(400, "Provide valid location coordinates.")
    radius_km = payload.radius_km if payload.radius_km is not None else citizen.alert_radius_km
    limit, offset = payload.limit, payload.offset
    query = _active_public_alerts()
    if db.get_bind().dialect.name == "postgresql":
        spatial = postgis(db)
        origin = spatial.ST_GeogFromText(f"SRID=4326;POINT({lon} {lat})")
        point = literal_column("alerts.public_point")
        distance = spatial.ST_Distance(point, origin)
        nearby = spatial.ST_DWithin(point, origin, radius_km * 1000)
    else:
        distance = func.fg_distance_m(Alert.public_lat, Alert.public_lon, lat, lon)
        nearby = distance <= radius_km * 1000
    order = {"time": (), "risk": (Alert.priority_rank,), "distance": (distance,)}[payload.sort]
    matches = db.execute(query.add_columns(distance, Incident.village_id).where(
        Incident.verified.is_(True), Incident.is_public.is_(True), Alert.is_simulated.is_(config.demo_jurisdictions_allowed()), nearby
    ).order_by(*order, Alert.created_at.desc(), Alert.id.desc()).offset(offset).limit(limit + 1)).all()
    return {
        "items": [
            {**_public_alert(db, alert), "approximate_locations": [{"lat": alert.public_lat, "lon": alert.public_lon}],
             "uncertainty_radius_m": 1000 if village_id and alert.village_ids else 8000,
             "distance_km": round(metres / 1000)}
            for alert, metres, village_id in matches[:limit]
        ],
        "radius_km": radius_km,
        "next_offset": offset + limit if len(matches) > limit else None,
    }


@router.get("/summary")
def community_summary(db: Session = Depends(get_db)) -> dict:
    query = _active_public_alerts()
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
    village_id: int | None = Form(default=None, gt=0),
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
                           reporter_name=reporter_name, contact=contact, village_code=village_code, village_id=village_id,
                           lat=lat, lon=lon, submission_key=submission_key, image=image)


@citizen_router.post("/reports", status_code=201)
def submit_citizen_report(
    title: str = Form(..., max_length=120),
    category: str = Form(...),
    species: str = Form(default="unidentified"),
    description: str = Form(default="", max_length=4000),
    village_code: str | None = Form(default=None, max_length=20),
    village_id: int | None = Form(default=None, gt=0),
    lat: float | None = Form(default=None),
    lon: float | None = Form(default=None),
    label: LocationLabel | None = Form(default=None),
    submission_key: UUID = Form(...),
    image: UploadFile | None = File(default=None),
    citizen: Citizen = Depends(onboarded_citizen),
    db: Session = Depends(get_db),
) -> dict:
    title = title.strip()
    if not title:
        raise HTTPException(400, "Enter a report title.")
    return _persist_report(db, category=category, species=species, description=description.strip(), title=title,
                           reporter_name=citizen.name, contact=citizen.contact_phone, citizen_id=citizen.id,
                           village_code=village_code, village_id=village_id, lat=lat, lon=lon, submission_key=submission_key, image=image,
                           location_label=label)


def _persist_report(
    db: Session, *, category: str, species: str, description: str, reporter_name: str, contact: str | None,
    village_code: str | None, village_id: int | None, lat: float | None, lon: float | None, submission_key: UUID | None,
    image: UploadFile | None, title: str | None = None, citizen_id: int | None = None,
    location_label: str | None = None,
) -> dict:
    species = normalize_report_animal(species)
    if category not in {"sighting", "conflict"} or species not in REPORT_ANIMALS:
        raise HTTPException(400, "Choose a supported category and animal.")
    if any("\x00" in value for value in (title or "", description, reporter_name, contact or "", village_code or "")):
        raise HTTPException(400, "Remove invalid characters from the report.")
    if (lat is None) != (lon is None) or (lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180)):
        raise HTTPException(400, "Provide a valid latitude and longitude.")
    village = resolve_village(db, village_id=village_id, village_code=village_code or None)
    if village is not None and lat is None and not valid_coordinates(village.lat, village.lon):
        raise HTTPException(400, "This village has no usable location. Choose another village or use GPS.")
    if lat is None and village is None:
        raise HTTPException(400, "Capture GPS coordinates or choose a village from the list.")

    content, extension = _read_photo(image) if image else (None, None)
    key = str(submission_key) if submission_key else None
    fields = dict(category=category, species=species, description=description, reporter_name=reporter_name,
                  contact=contact, lat=lat, lon=lon, village_id=village.id if village else None)
    # Keep the legacy digest stable. Profile edits must not change a citizen's retry fingerprint.
    digest_fields = fields if citizen_id is None else {
        key: value for key, value in fields.items() if key not in {"reporter_name", "contact"}
    } | {"title": title}
    if location_label is not None:
        digest_fields["location_label"] = location_label
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
    lock_routing(db, shared=True)
    incident_lat, incident_lon = (lat, lon) if lat is not None else (village.lat, village.lon)
    simulated = config.demo_jurisdictions_allowed()
    jurisdiction_id = db.scalar(select(jurisdiction_at(db, incident_lat, incident_lon, demo=simulated)))
    report = SightingReport(**fields, citizen_id=citizen_id, jurisdiction_id=jurisdiction_id,
                            title=title, status="pending", is_simulated=simulated, location_label=location_label,
                            reference_code=_reference(db, key is not None),
                            submission_key=key, submission_digest=digest if key else None,
                            analysis_status="queued" if relative else "no_photo")
    try:
        db.add(report)
        db.flush()
    except IntegrityError:
        db.rollback()
        if key and (previous := replay()):
            return previous
        raise

    if relative:
        report.image_path = save_evidence(relative, content)
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
            "created_at": report.created_at.isoformat() + "Z",
            "village_id": report.village_id, "village_name": report.village.name if report.village else None,
            "location_label": report.location_label}


@citizen_router.get("/reports")
def citizen_reports(citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    reports = db.execute(select(SightingReport, Incident.status).outerjoin(Incident, Incident.report_id == SightingReport.id)
                         .options(selectinload(SightingReport.village))
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
    incident = report.incident
    decision = next((event for event in reversed(report.review_history or [])
                     if event.get("status") == report.status and report.status in {"verified", "rejected"}), {})
    rejection = decision.get("citizen_note", decision.get("note")) if report.status == "rejected" else None
    events = [{"event": "submitted", "at": iso(report.created_at)}]
    if decision.get("at"):
        events.append({"event": "approved" if report.status == "verified" else "rejected", "at": decision["at"]})
    if incident and incident.resolved_at:
        events.append({"event": "resolved", "at": iso(incident.resolved_at)})
    return {**_citizen_summary(report, incident.status if incident else None),
            "category": report.category, "species_name": REPORT_ANIMALS.get(
                report.species, REPORT_ANIMALS["unidentified"])["name"],
            "rejection_reason": rejection,
            "confirmed_species_name": species_meta(incident.species)["name"] if incident else None,
            "risk_level": incident.severity if incident else None,
            "review_note": decision.get("citizen_note") if report.status == "verified" else None,
            "resolution_note": incident.citizen_resolution_note if incident else None,
            "events": events,
            "location_source": "gps" if report.lat is not None and report.lon is not None else "village" if report.village_id else None,
            "description": report.description,
            "lat": report.lat, "lon": report.lon, "has_photo": bool(report.image_path),
            "analysis_status": report.analysis_status,
            "suggested_species": [species_meta(item["species"])["name"] for item in report.analysis_results or []
                                  if report.analysis_status == "completed" and item.get("species") in SPECIES_ORDER]}


@citizen_router.get("/notifications")
def citizen_notifications(citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    rows = db.execute(
        select(CitizenNotification, SightingReport.title, SightingReport.reference_code, Incident.severity)
        .join(SightingReport, SightingReport.id == CitizenNotification.report_id)
        .outerjoin(Incident, Incident.report_id == SightingReport.id)
        .where(CitizenNotification.citizen_id == citizen.id, SightingReport.citizen_id == citizen.id)
        .order_by(CitizenNotification.created_at.desc(), CitizenNotification.report_id.desc(), CitizenNotification.event)
    ).all()
    return {
        "items": [{"id": f"{item.report_id}:{item.event}", "event": item.event,
                   "report_title": title, "reference_code": reference, "created_at": iso(item.created_at),
                   "read_at": iso(item.read_at), "risk_level": severity} for item, title, reference, severity in rows],
        "unread": sum(item.read_at is None for item, *_ in rows),
    }


@citizen_router.post("/notifications/read-all")
def read_citizen_notifications(citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    db.execute(update(CitizenNotification).where(CitizenNotification.citizen_id == citizen.id,
                                               CitizenNotification.read_at.is_(None)).values(read_at=utcnow()))
    db.commit()
    return {"unread": 0}


@citizen_router.post("/notifications/{notification_id}/read")
def read_citizen_notification(notification_id: str, citizen: Citizen = Depends(onboarded_citizen),
                              db: Session = Depends(get_db)):
    report_id, _, event = notification_id.partition(":")
    if not report_id.isascii() or not report_id.isdigit() or len(report_id) > 10 or int(report_id) > 2**31 - 1:
        raise HTTPException(404, "Notification not found.")
    result = db.execute(update(CitizenNotification).where(
        CitizenNotification.report_id == int(report_id), CitizenNotification.event == event,
        CitizenNotification.citizen_id == citizen.id,
    ).values(read_at=func.coalesce(CitizenNotification.read_at, utcnow()))
        .returning(CitizenNotification.read_at)).scalar_one_or_none()
    if result is None:
        raise HTTPException(404, "Notification not found.")
    db.commit()
    return {"read_at": iso(result)}


@citizen_router.get("/reports/{reference_code}/evidence")
def citizen_report_evidence(reference_code: str, citizen: Citizen = Depends(onboarded_citizen), db: Session = Depends(get_db)):
    report = _owned_report(db, reference_code, citizen)
    return evidence_response(report.image_path)

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
            {**village_identity(village), **village_center(village, public=True),
             "population": village.population, "risk_level": village.risk_level}
            for village in villages
        ],
        "note": "Fictional demo geography is labelled. Exact coordinates are not published here for real villages.",
    }
