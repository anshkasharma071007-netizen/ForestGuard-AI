from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ai_engine import detector as ai_detector
from geospatial.mapping import polygon_ring
from geospatial.risk_analysis import build_risk_zones
from geospatial.species import SPECIES_ORDER, species_meta

from backend import config
from backend.api.deps import get_optional_user, require_guard
from backend.services.geography import authority_record, authority_scope
from backend.services.media import discard_uncommitted, evidence_response, save_evidence
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
from backend.models.entities import CameraUpload
from backend.services.risk_service import get_settings, recalculate_all, rescore_detection
from backend.services.serializers import (
    serialize_camera,
    serialize_detection,
    serialize_guard,
    serialize_incident,
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
    user: User,
    *,
    species: list[str] | None = None,
    risk_levels: list[str] | None = None,
    zones: list[str] | None = None,
    cameras: list[str] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    basis: str | None = None,
):
    query = select(Detection).where(authority_scope(db, user, Detection))
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
    except Exception:  # pragma: no cover - diagnostic endpoint
        database = "error"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "ai_mode": ai_detector.engine_status().get("mode"),
        "demo_mode": config.DEMO_MODE,
        "time": utcnow().isoformat() + "Z",
    }


@router.get("/meta")
def meta(db: Session = Depends(get_db)) -> dict:
    settings = get_settings(db)
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
def overview(db: Session = Depends(get_db), user: User = Depends(require_guard)) -> dict:
    now = utcnow()
    day_ago = now - timedelta(hours=24)
    month_ago = now - timedelta(days=30)

    total_detections = db.scalar(select(func.count(Detection.id)).where(authority_scope(db, user, Detection))) or 0
    detections_24h = db.scalar(
        select(func.count(Detection.id)).where(authority_scope(db, user, Detection)).where(Detection.detected_at >= day_ago)
    ) or 0
    species_rows = db.execute(
        select(Detection.species, func.count(Detection.id)).where(authority_scope(db, user, Detection))
        .where(Detection.detected_at >= month_ago)
        .group_by(Detection.species)
    ).all()
    species_counts = {row[0]: row[1] for row in species_rows}

    active_alerts = db.scalars(
        select(Alert).where(authority_scope(db, user, Alert)).where(Alert.status.in_(["active", "acknowledged", "responding"]))
        .order_by(Alert.status, Alert.id)
    ).all()
    high_risk_24h = db.scalar(
        select(func.count(Detection.id)).where(authority_scope(db, user, Detection)).where(
            Detection.risk_level == "high", Detection.detected_at >= day_ago
        )
    ) or 0
    recent = db.scalars(
        select(Detection).where(authority_scope(db, user, Detection)).order_by(Detection.detected_at.desc()).limit(8)
    ).all()
    open_incidents = db.scalars(
        select(Incident).where(authority_scope(db, user, Incident)).where(Incident.status.in_(["open", "verified"]))
        .order_by(Incident.created_at.desc())
        .limit(5)
    ).all()
    cameras = db.scalars(select(Camera).where(authority_scope(db, user, Camera))).all()
    village_risks = db.scalars(select(Village).where(authority_scope(db, user, Village)).order_by(Village.name)).all()

    settings = get_settings(db)
    detections_month = db.scalars(
        select(Detection).where(authority_scope(db, user, Detection)).where(Detection.detected_at >= month_ago)
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
                select(func.count(Incident.id)).where(authority_scope(db, user, Incident)).where(Incident.status.in_(["open", "verified"]))
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
def list_cameras(db: Session = Depends(get_db), user: User = Depends(require_guard)) -> dict:
    cameras = db.scalars(select(Camera).where(authority_scope(db, user, Camera)).order_by(Camera.code)).all()
    last = {
        code: last_seen
        for code, last_seen in db.execute(
            select(Detection.camera_code, func.max(Detection.detected_at)).where(authority_scope(db, user, Detection)).group_by(
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
def list_villages(db: Session = Depends(get_db), user: User = Depends(require_guard)) -> dict:
    villages = db.scalars(select(Village).where(authority_scope(db, user, Village)).order_by(Village.name)).all()
    exposure_counts = {
        village_id: count
        for village_id, count in db.execute(
            select(Detection.nearest_village_id, func.count(Detection.id)).where(authority_scope(db, user, Detection)).group_by(
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
def list_guards(db: Session = Depends(get_db), user: User = Depends(require_guard)) -> dict:
    guards = db.scalars(select(Guard).where(authority_scope(db, user, Guard)).order_by(Guard.name)).all()
    open_tasks = {
        guard_id: count
        for guard_id, count in db.execute(
            select(Alert.assigned_guard_id, func.count(Alert.id)).where(authority_scope(db, user, Alert))
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
    user: User = Depends(require_guard),
) -> dict:
    species_list = query_list(species)
    risk_list = query_list(risk)
    zone_list = query_list(zone)
    camera_list = query_list(camera)
    start = parse_dt(date_from)
    end = parse_dt(date_to, end_of_day=True)

    query = _filtered_detections(
        db, user,
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
    user: User = Depends(require_guard),
) -> dict:
    detection = authority_record(db, user, Detection, detection_id)
    settings = get_settings(db)
    risk = rescore_detection(db, detection, settings)
    alerts = db.scalars(
        select(Alert).where(Alert.detection_id == detection.id, authority_scope(db, user, Alert)).order_by(Alert.created_at.desc())
    ).all()
    track = db.scalar(select(Track).where(
        Track.id == detection.track_id, authority_scope(db, user, Track),
    )) if detection.track_id else None
    return {
        "detection": serialize_detection(detection),
        "species": species_info(detection.species),
        "risk": risk,
        "track": serialize_track(track) if track else None,
        "alerts": [alert_payload(db, alert, include_events=True) for alert in alerts],
        "disclaimer": DISCLAIMER,
    }


@router.get("/detections/{detection_id}/evidence/{kind}")
def detection_evidence(detection_id: int, kind: Literal["original", "annotated"],
                       db: Session = Depends(get_db), user: User = Depends(require_guard)):
    detection = authority_record(db, user, Detection, detection_id)
    return evidence_response(detection.image_path if kind == "original" else detection.annotated_path)


@router.get("/camera-uploads/{upload_id}/evidence/{kind}")
def camera_upload_evidence(upload_id: int, kind: Literal["original", "annotated"],
                           db: Session = Depends(get_db), user: User = Depends(require_guard)):
    upload = db.scalar(select(CameraUpload).join(Camera).where(
        CameraUpload.id == upload_id, authority_scope(db, user, Camera),
    ))
    if upload is None:
        raise HTTPException(404, "Evidence unavailable.")
    return evidence_response(upload.image_path if kind == "original" else upload.annotated_path)


@router.post("/detections/upload")
def upload_media(
    file: UploadFile = File(...),
    camera_code: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    if not file.filename:
        raise HTTPException(400, "A media file is required.")
    content_type = (file.content_type or "").lower()
    is_image = content_type in config.ALLOWED_IMAGE_TYPES
    is_video = content_type in config.ALLOWED_VIDEO_TYPES
    if not (is_image or is_video):
        raise HTTPException(400, "Upload a JPEG/PNG/WebP image or MP4/MOV/WebM video.")
    extensions = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
        "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-msvideo": ".avi",
    }
    camera_query = select(Camera).where(authority_scope(db, user, Camera))
    if camera_code:
        camera_query = camera_query.where(Camera.code == camera_code)
    camera = db.scalar(camera_query.order_by(Camera.code).limit(1))
    if camera is None:
        raise HTTPException(400, "Choose an authorized camera station.")

    maximum = config.MAX_UPLOAD_MB * 1024 * 1024
    content = file.file.read(maximum + 1)
    if len(content) > maximum:
        raise HTTPException(413, f"File exceeds the {config.MAX_UPLOAD_MB} MB upload limit.")
    if not content:
        raise HTTPException(400, "The uploaded file was empty.")

    media_id = uuid.uuid4().hex
    filename = media_id + extensions[content_type]
    with TemporaryDirectory(prefix="fg-camera-") as scratch:
        source = Path(scratch) / filename
        source.write_bytes(content)
        try:
            result = ai_detector.analyze_media(str(source), "video" if is_video else "image", upload_dir=scratch)
        except ai_detector.AIUnavailableError as exc:
            raise HTTPException(503, str(exc)) from exc
        except (ValueError, OSError):
            raise HTTPException(400, "Could not read the uploaded media.") from None
        annotation = result.get("annotated_path")
        annotated_rel = None
        original_rel = save_evidence(f"uploads/{filename}", content)
        if annotation and Path(annotation).is_file():
            try:
                annotated_rel = save_evidence(f"annotated/{media_id}.jpg", Path(annotation).read_bytes())
            except (HTTPException, OSError):
                discard_uncommitted(original_rel)
                raise HTTPException(503, "Could not save the annotated evidence. Retry shortly.") from None

    upload = CameraUpload(camera_id=camera.id, image_path=original_rel, annotated_path=annotated_rel)
    db.add(upload)
    detections = result.get("detections", [])
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
        settings = get_settings(db)
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
            "annotated_url": f"/api/camera-uploads/{upload.id}/evidence/annotated" if annotated_rel else None,
            "original_url": f"/api/camera-uploads/{upload.id}/evidence/original",
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
    user: User = Depends(require_guard),
) -> dict:
    query = select(Track).where(authority_scope(db, user, Track))
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
    operational: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_guard),
) -> dict:
    species_list = query_list(species)
    risk_list = query_list(risk)
    since = utcnow() - timedelta(days=days)
    detections = db.scalars(
        _filtered_detections(
            db, user, species=species_list, risk_levels=risk_list, start=since
        ).order_by(Detection.detected_at.desc()).limit(600)
    ).all()
    villages = db.scalars(select(Village).where(authority_scope(db, user, Village))).all()
    cameras = db.scalars(select(Camera).where(authority_scope(db, user, Camera))).all()
    guards = db.scalars(select(Guard).where(authority_scope(db, user, Guard))).all()
    incident_query = select(Incident).where(authority_scope(db, user, Incident)).order_by(Incident.created_at.desc())
    if operational:
        incident_query = incident_query.where(Incident.verified.is_(True), Incident.status == "verified",
                                              Incident.is_simulated.is_(False))
        if species_list:
            incident_query = incident_query.where(Incident.species.in_(species_list))
        if risk_list:
            incident_query = incident_query.where(Incident.severity.in_(risk_list))
    else:
        incident_query = incident_query.where(Incident.created_at >= since)
    incidents = db.scalars(incident_query).all()
    report_ids = [incident.report_id for incident in incidents if incident.report_id is not None]
    titles = dict(db.execute(select(SightingReport.id, SightingReport.title).where(
        SightingReport.id.in_(report_ids))).all()) if report_ids else {}
    tracks = db.scalars(select(Track).where(authority_scope(db, user, Track)).order_by(Track.ended_at.desc()).limit(60)).all()

    settings = get_settings(db)
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
        "incidents": [dict(serialize_incident(incident), title=titles.get(incident.report_id)) for incident in incidents],
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
