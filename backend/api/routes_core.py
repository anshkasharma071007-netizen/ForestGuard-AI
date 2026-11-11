from __future__ import annotations

import os
import shutil
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ai_engine import detector as ai_detector
from geospatial.mapping import polygon_ring
from geospatial.risk_analysis import build_risk_zones
from geospatial.species import SPECIES_ORDER, species_meta

from backend import config
from backend.api.deps import get_optional_user, require_guard
from backend.api.utils import (
    alert_payload,
    load_study_area,
    parse_dt,
    query_list,
    study_bbox,
)
from backend.database.session import get_db
from backend.models import (
    Alert,
    AlertEvent,
    Camera,
    Detection,
    Guard,
    Incident,
    SightingReport,
    Track,
    User,
    Village,
    utcnow,
)
from backend.services.risk_service import get_settings, recalculate_all, rescore_detection
from backend.services.serializers import (
    media_url,
    serialize_alert,
    serialize_camera,
    serialize_detection,
    serialize_guard,
    serialize_incident,
    serialize_sighting,
    serialize_track,
    serialize_village,
    species_info,
)
from backend.services.tracking import rebuild_tracks

router = APIRouter(prefix="/api", tags=["core"])

DISCLAIMER = (
    "All seeded observations are synthetic demonstration records. Annotated images are "
    "AI-processed reference evidence, not live camera-trap feeds or forest-department data."
)


def _filtered_detections(
    db: Session,
    *,
    species: list[str] | None = None,
    risk_levels: list[str] | None = None,
    zones: list[str] | None = None,
    cameras: list[str] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    basis: str | None = None,
):
    query = select(Detection)
    if species:
        query = query.where(Detection.species.in_(species))
    if risk_levels:
        query = query.where(Detection.risk_level.in_(risk_levels))
    if zones:
        query = query.where(Detection.zone.in_(zones))
    if cameras:
        query = query.where(Detection.camera_code.in_(cameras))
    if basis:
        query = query.where(Detection.risk_basis == basis)
    if start:
        query = query.where(Detection.detected_at >= start)
    if end:
        query = query.where(Detection.detected_at <= end)
    return query


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(select(1))
        database = "ok"
    except Exception as exc:  # pragma: no cover - diagnostic endpoint
        database = f"error: {exc}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "ai_mode": ai_detector.engine_status().get("mode"),
        "demo_mode": config.DEMO_MODE,
        "time": utcnow().isoformat() + "Z",
    }


@router.get("/meta")
def meta() -> dict:
    settings = get_settings()
    return {
        "project": {
            "name": "Forest Guard AI",
            "tagline": "Protecting Forests. Preventing Conflict. Saving Lives.",
            "description": (
                "AI-assisted wildlife monitoring, geospatial risk mapping and human–wildlife "
                "conflict prevention for forest authorities and buffer-zone communities."
            ),
            "version": "1.0.0-demo",
        },
        "demo": {
            "mode": config.DEMO_MODE,
            "study_area": "Illustrative Pench landscape, Seoni district, Madhya Pradesh",
            "disclaimer": DISCLAIMER,
            "credentials": (
                {
                    "admin": config.DEMO_ADMIN_EMAIL,
                    "guard": config.DEMO_GUARD_EMAIL,
                }
                if config.DEMO_MODE
                else None
            ),
        },
        "study_area": load_study_area(),
        "ai": ai_detector.engine_status(),
        "supported_species": [species_info(key) for key in SPECIES_ORDER],
        "risk": settings.to_dict(),
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_guard)) -> dict:
    now = utcnow()
    day_ago = now - timedelta(hours=24)
    month_ago = now - timedelta(days=30)

    total_detections = db.scalar(select(func.count(Detection.id))) or 0
    detections_24h = db.scalar(
        select(func.count(Detection.id)).where(Detection.detected_at >= day_ago)
    ) or 0
    species_rows = db.execute(
        select(Detection.species, func.count(Detection.id))
        .where(Detection.detected_at >= month_ago)
        .group_by(Detection.species)
    ).all()
    species_counts = {row[0]: row[1] for row in species_rows}

    active_alerts = db.scalars(
        select(Alert).where(Alert.status.in_(["active", "acknowledged", "responding"]))
    ).all()
    high_risk_24h = db.scalar(
        select(func.count(Detection.id)).where(
            Detection.risk_level == "high", Detection.detected_at >= day_ago
        )
    ) or 0
    recent = db.scalars(
        select(Detection).order_by(Detection.detected_at.desc()).limit(8)
    ).all()
    open_incidents = db.scalars(
        select(Incident).where(Incident.status.in_(["open", "verified"]))
        .order_by(Incident.created_at.desc())
        .limit(5)
    ).all()
    cameras = db.scalars(select(Camera)).all()
    village_risks = db.scalars(select(Village).order_by(Village.name)).all()

    settings = get_settings()
    detections_month = db.scalars(
        select(Detection).where(Detection.detected_at >= month_ago)
    ).all()
    risk_counts = Counter(detection.risk_level for detection in detections_month)

    daily = defaultdict(int)
    for detection in detections_month:
        daily[detection.detected_at.date().isoformat()] += 1
    activity = [
        {
            "date": (now - timedelta(days=offset)).date().isoformat(),
            "detections": daily.get((now - timedelta(days=offset)).date().isoformat(), 0),
        }
        for offset in range(29, -1, -1)
    ]

    zones = build_risk_zones(
        [
            {
                "lat": detection.lat,
                "lon": detection.lon,
                "detected_at": detection.detected_at,
                "risk_score": detection.risk_score,
                "species": detection.species,
            }
            for detection in detections_month
        ],
        [
            {
                "id": village.id,
                "name": village.name,
                "lat": village.lat,
                "lon": village.lon,
                "boundary_ring": polygon_ring(village.boundary_geojson),
            }
            for village in village_risks
        ],
        settings,
        bbox=study_bbox(),
    )

    return {
        "totals": {
            "detections": total_detections,
            "detections_24h": detections_24h,
            "species_detected": len([key for key, count in species_counts.items() if count]),
            "active_alerts": len(active_alerts),
            "high_risk_24h": high_risk_24h,
            "open_incidents": db.scalar(
                select(func.count(Incident.id)).where(Incident.status.in_(["open", "verified"]))
            ) or 0,
            "villages_monitored": len(village_risks),
            "cameras_online": len([camera for camera in cameras if camera.status == "online"]),
            "cameras_total": len(cameras),
        },
        "species": [
            {
                **species_info(key),
                "count": species_counts.get(key, 0),
            }
            for key in SPECIES_ORDER
        ],
        "risk_distribution": {
            "low": risk_counts.get("low", 0),
            "moderate": risk_counts.get("moderate", 0),
            "high": risk_counts.get("high", 0),
        },
        "activity": activity,
        "recent_detections": [serialize_detection(detection) for detection in recent],
        "active_alerts": [alert_payload(db, alert) for alert in active_alerts[:5]],
        "incidents": [serialize_incident(incident) for incident in open_incidents],
        "villages": [serialize_village(village) for village in village_risks],
        "cameras": [serialize_camera(camera) for camera in cameras],
        "risk_zone_preview": {
            "type": "FeatureCollection",
            "features": zones["features"][:160],
            "feature_count": len(zones["features"]),
        },
        "generated_at": now.isoformat() + "Z",
        "disclaimer": DISCLAIMER,
    }


@router.get("/cameras")
def list_cameras(db: Session = Depends(get_db), _: User = Depends(require_guard)) -> dict:
    cameras = db.scalars(select(Camera).order_by(Camera.code)).all()
    last = {
        code: last_seen
        for code, last_seen in db.execute(
            select(Detection.camera_code, func.max(Detection.detected_at)).group_by(
                Detection.camera_code
            )
        ).all()
    }
    counts = Counter(camera.status for camera in cameras)
    return {
        "items": [
            {
                **serialize_camera(camera),
                "last_detection_at": last.get(camera.code).isoformat() + "Z"
                if last.get(camera.code)
                else None,
            }
            for camera in cameras
        ],
        "summary": {
            "online": counts.get("online", 0),
            "maintenance": counts.get("maintenance", 0),
            "offline": counts.get("offline", 0),
            "total": len(cameras),
        },
        "note": "Camera locations are illustrative station positions in the demonstration landscape.",
    }


@router.get("/villages")
def list_villages(db: Session = Depends(get_db), _: User = Depends(require_guard)) -> dict:
    villages = db.scalars(select(Village).order_by(Village.name)).all()
    exposure_counts = {
        village_id: count
        for village_id, count in db.execute(
            select(Detection.nearest_village_id, func.count(Detection.id)).group_by(
                Detection.nearest_village_id
            )
        ).all()
        if village_id
    }
    return {
        "items": [
            {
                **serialize_village(village),
                "nearby_detections": exposure_counts.get(village.id, 0),
            }
            for village in villages
        ],
        "note": "Village polygons are illustrative demonstration boundaries, not official revenue records.",
    }


@router.get("/guards")
def list_guards(db: Session = Depends(get_db), _: User = Depends(require_guard)) -> dict:
    guards = db.scalars(select(Guard).order_by(Guard.name)).all()
    open_tasks = {
        guard_id: count
        for guard_id, count in db.execute(
            select(Alert.assigned_guard_id, func.count(Alert.id))
            .where(Alert.status.in_(["active", "acknowledged", "responding"]))
            .group_by(Alert.assigned_guard_id)
        ).all()
        if guard_id
    }
    return {
        "items": [
            {
                **serialize_guard(guard),
                "open_tasks": open_tasks.get(guard.id, 0),
                "email": guard.user.email if guard.user else None,
            }
            for guard in guards
        ],
        "summary": {
            "available": len([guard for guard in guards if guard.status == "available"]),
            "on_patrol": len([guard for guard in guards if guard.status == "on_patrol"]),
            "off_duty": len([guard for guard in guards if guard.status == "off_duty"]),
        },
    }


@router.get("/detections")
def list_detections(
    species: list[str] | None = Query(default=None),
    risk: list[str] | None = Query(default=None),
    zone: list[str] | None = Query(default=None),
    camera: list[str] | None = Query(default=None),
    basis: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    species_list = query_list(species)
    risk_list = query_list(risk)
    zone_list = query_list(zone)
    camera_list = query_list(camera)
    start = parse_dt(date_from)
    end = parse_dt(date_to, end_of_day=True)

    query = _filtered_detections(
        db,
        species=species_list,
        risk_levels=risk_list,
        zones=zone_list,
        cameras=camera_list,
        start=start,
        end=end,
        basis=basis,
    )
    if search:
        needle = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(Detection.species).like(needle)
            | func.lower(Detection.camera_code).like(needle)
            | func.lower(Detection.zone).like(needle)
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Detection.detected_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [serialize_detection(detection) for detection in items],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": max(1, (total + page_size - 1) // page_size),
        },
        "filters": {
            "species": species_list,
            "risk": risk_list,
            "zones": zone_list,
            "cameras": camera_list,
            "basis": basis,
        },
    }


@router.get("/detections/{detection_id}")
def detection_detail(
    detection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found.")
    settings = get_settings()
    risk = rescore_detection(db, detection, settings)
    alerts = db.scalars(
        select(Alert).where(Alert.detection_id == detection.id).order_by(Alert.created_at.desc())
    ).all()
    return {
        "detection": serialize_detection(detection),
        "species": species_info(detection.species),
        "risk": risk,
        "track": serialize_track(detection.track) if detection.track else None,
        "alerts": [alert_payload(db, alert, include_events=True) for alert in alerts],
        "disclaimer": DISCLAIMER,
    }


@router.post("/detections/upload")
async def upload_media(
    file: UploadFile = File(...),
    camera_code: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A media file is required.")
    content_type = (file.content_type or "").lower()
    is_image = content_type in config.ALLOWED_IMAGE_TYPES or content_type.startswith("image/")
    is_video = content_type in config.ALLOWED_VIDEO_TYPES or content_type.startswith("video/")
    if not (is_image or is_video):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a JPEG/PNG/WebP image or MP4/MOV/WebM video.",
        )

    extension = os.path.splitext(file.filename)[1].lower() or (".jpg" if is_image else ".mp4")
    stored_name = f"{uuid.uuid4().hex}{extension}"
    target_dir = os.path.join(config.UPLOAD_DIR, "uploads")
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, stored_name)

    max_bytes = config.MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    try:
        with open(target_path, "wb") as handle:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {config.MAX_UPLOAD_MB} MB upload limit.",
                    )
                handle.write(chunk)
    except HTTPException:
        if os.path.exists(target_path):
            os.remove(target_path)
        raise
    finally:
        await file.close()

    if not os.path.exists(target_path) or size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")

    camera = None
    if camera_code:
        camera = db.scalar(select(Camera).where(Camera.code == camera_code))

    try:
        result = ai_detector.analyze_media(target_path, "video" if is_video else "image")
    except ai_detector.AIUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    detections = result.get("detections", [])
    if camera is None:
        camera = db.scalars(select(Camera).order_by(Camera.code)).first()
    if camera is None:
        if os.path.exists(target_path):
            os.remove(target_path)
        raise HTTPException(status_code=400, detail="No camera stations are configured.")

    annotated_abs = result.get("annotated_path")
    annotated_rel = None
    if annotated_abs and os.path.exists(annotated_abs):
        annotated_rel = os.path.join("annotated", os.path.basename(annotated_abs)).replace("\\", "/")

    original_rel = os.path.join("uploads", stored_name).replace("\\", "/")
    created: list[Detection] = []
    now = utcnow()
    for index, item in enumerate(detections):
        detected_at = now - timedelta(seconds=len(detections) - index - 1)
        detection = Detection(
            species=item["species"],
            confidence=float(item["confidence"]),
            species_confidence=item.get("species_confidence"),
            detector_confidence=item.get("detector_confidence"),
            detected_at=detected_at,
            camera_id=camera.id,
            camera_code=camera.code,
            zone=camera.zone,
            lat=camera.lat,
            lon=camera.lon,
            image_path=original_rel,
            annotated_path=annotated_rel,
            bbox=item.get("bbox"),
            source_type="upload_video" if is_video else "upload_image",
            is_simulated=False,
            notes=(notes or "").strip() or None,
        )
        db.add(detection)
        created.append(detection)
    db.commit()

    if created:
        settings = get_settings()
        rebuild_tracks(db)
        recalculate_all(db, settings)
        for detection in created:
            db.refresh(detection)
        from backend.services.alerts import sync_alerts

        sync_alerts(db, settings, days=7)

    return {
        "analysis": {
            "media_type": "video" if is_video else "image",
            "detections": detections,
            "primary_species": result.get("primary_species"),
            "elapsed_seconds": result.get("elapsed_seconds"),
            "warnings": result.get("warnings", []),
            "frame_samples": result.get("frame_samples"),
            "annotated_url": media_url(annotated_rel),
            "original_url": media_url(original_rel),
        },
        "stored": [serialize_detection(detection) for detection in created],
        "camera": serialize_camera(camera),
        "engine": result.get("engine"),
        "note": "Uploaded media is analysed once. Video support samples frames and does not provide continuous tracking.",
    }


@router.get("/tracks")
def list_tracks(
    species: list[str] | None = Query(default=None),
    direction: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    query = select(Track)
    species_list = query_list(species)
    if species_list:
        query = query.where(Track.species.in_(species_list))
    if direction:
        query = query.where(Track.direction == direction)
    tracks = db.scalars(query.order_by(Track.ended_at.desc())).all()
    return {
        "items": [serialize_track(track) for track in tracks],
        "total": len(tracks),
        "disclaimer": (
            "Tracks link sequential camera observations of the same species. They are not "
            "GPS telemetry and do not identify individual animals."
        ),
    }


@router.get("/map/layers")
def map_layers(
    species: list[str] | None = Query(default=None),
    risk: list[str] | None = Query(default=None),
    days: int = Query(default=45, ge=1, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    species_list = query_list(species)
    risk_list = query_list(risk)
    since = utcnow() - timedelta(days=days)
    detections = db.scalars(
        _filtered_detections(
            db, species=species_list, risk_levels=risk_list, start=since
        ).order_by(Detection.detected_at.desc()).limit(600)
    ).all()
    villages = db.scalars(select(Village)).all()
    cameras = db.scalars(select(Camera)).all()
    guards = db.scalars(select(Guard)).all()
    incidents = db.scalars(
        select(Incident).where(Incident.created_at >= since).order_by(Incident.created_at.desc())
    ).all()
    tracks = db.scalars(select(Track).order_by(Track.ended_at.desc()).limit(60)).all()

    settings = get_settings()
    zones = build_risk_zones(
        [
            {
                "lat": detection.lat,
                "lon": detection.lon,
                "detected_at": detection.detected_at,
                "risk_score": detection.risk_score,
                "species": detection.species,
            }
            for detection in detections
        ],
        [
            {
                "id": village.id,
                "name": village.name,
                "lat": village.lat,
                "lon": village.lon,
                "boundary_ring": polygon_ring(village.boundary_geojson),
            }
            for village in villages
        ],
        settings,
        bbox=study_bbox(),
    )

    return {
        "study_area": load_study_area(),
        "villages": [serialize_village(village) for village in villages],
        "cameras": [serialize_camera(camera) for camera in cameras],
        "guards": [serialize_guard(guard) for guard in guards],
        "detections": [serialize_detection(detection) for detection in detections],
        "incidents": [serialize_incident(incident) for incident in incidents],
        "tracks": [serialize_track(track) for track in tracks],
        "risk_zones": zones,
        "risk": {
            "thresholds": settings.thresholds,
            "alert_radius_km": settings.data["alert_radius_km"],
            "alert_threshold": settings.data["alert_threshold"],
        },
        "window_days": days,
        "generated_at": utcnow().isoformat() + "Z",
        "bounds": study_bbox(),
        "disclaimer": DISCLAIMER,
    }


@router.get("/ai/status")
def ai_status(_: User | None = Depends(get_optional_user)) -> dict:
    status = ai_detector.engine_status()
    status["upload_limit_mb"] = config.MAX_UPLOAD_MB
    status["allowed_media"] = sorted(config.ALLOWED_IMAGE_TYPES | config.ALLOWED_VIDEO_TYPES)
    status["supported_species"] = [species_info(key) for key in SPECIES_ORDER]
    status["method"] = (
        "YOLO-World v2 localises animals; CLIP zero-shot classification assigns a species only "
        "above a calibrated confidence floor, otherwise the record stays 'unidentified'."
    )
    return status
