from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geospatial.mapping import polygon_ring
from geospatial.risk_analysis import build_risk_zones, village_exposure
from geospatial.species import SPECIES_ORDER, species_meta

from backend import config
from backend.api.deps import require_admin, require_guard
from backend.api.utils import study_bbox
from backend.database.session import get_db
from backend.models import Alert, Camera, Detection, Guard, Incident, Track, User, Village, utcnow
from backend.schemas.api import RiskConfigPatch
from backend.services.risk_service import (
    get_settings,
    reset_settings,
    species_summary,
    update_settings,
)
from backend.services.risk_service import recalculate_all

router = APIRouter(prefix="/api", tags=["risk"])


def _village_dicts(db: Session) -> list[dict]:
    return [
        {
            "id": village.id,
            "name": village.name,
            "lat": village.lat,
            "lon": village.lon,
            "population": village.population,
            "boundary_ring": polygon_ring(village.boundary_geojson),
        }
        for village in db.scalars(select(Village)).all()
    ]


@router.get("/risk/config")
def risk_config(_: User = Depends(require_guard)) -> dict:
    settings = get_settings()
    return {
        "settings": settings.to_dict(),
        "species": species_summary(settings),
        "explanation": (
            "Risk scores combine boundary proximity, recency, local same-species frequency, "
            "verified incidents and — only when a camera sequence supports it — inferred "
            "movement toward a village. Scores are prioritisation aids, not predictions."
        ),
        "config_path": "demo_data/risk_config.json",
    }


@router.patch("/risk/config")
def patch_risk_config(
    payload: RiskConfigPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    patch = {key: value for key, value in payload.model_dump(exclude_none=True).items()}
    if "thresholds" in patch:
        thresholds = patch["thresholds"]
        moderate = float(thresholds.get("moderate", 35))
        high = float(thresholds.get("high", 65))
        if not (0 <= moderate < high <= 100):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400, detail="Thresholds must satisfy 0 ≤ moderate < high ≤ 100."
            )
    settings = update_settings(patch)
    summary = recalculate_all(db, get_settings(reload=True))
    return {
        "settings": settings,
        "recalculated": summary,
        "message": "Risk configuration updated and all detections re-scored.",
    }


@router.post("/risk/config/reset")
def reset_risk_config(
    db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> dict:
    settings = reset_settings()
    summary = recalculate_all(db, get_settings(reload=True))
    return {
        "settings": settings,
        "recalculated": summary,
        "message": "Risk configuration restored to defaults and detections re-scored.",
    }


@router.post("/risk/recalculate")
def recalculate_risk(
    db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> dict:
    from backend.services.alerts import sync_alerts

    settings = get_settings(reload=True)
    summary = recalculate_all(db, settings)
    sync_alerts(db, settings, days=30)
    return {
        "summary": summary,
        "settings": settings.to_dict(),
        "message": "Risk scores refreshed from the current configuration.",
    }


@router.get("/risk/zones")
def risk_zones(
    days: int = Query(default=21, ge=1, le=120),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    settings = get_settings()
    since = utcnow() - timedelta(days=days)
    detections = db.scalars(
        select(Detection).where(Detection.detected_at >= since)
    ).all()
    villages = _village_dicts(db)
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
        villages,
        settings,
        bbox=study_bbox(),
    )
    counts = Counter(feature["properties"]["level"] for feature in zones["features"])
    exposure = village_exposure(villages, [
        {
            "lat": detection.lat,
            "lon": detection.lon,
            "detected_at": detection.detected_at,
            "risk_score": detection.risk_score,
            "species": detection.species,
        }
        for detection in detections
    ], settings)
    return {
        "zones": zones,
        "summary": {
            "cells": len(zones["features"]),
            "low": counts.get("low", 0),
            "moderate": counts.get("moderate", 0),
            "high": counts.get("high", 0),
            "window_days": days,
        },
        "villages": exposure,
        "settings": {
            "thresholds": settings.thresholds,
            "cell_degrees": settings.data["zone_cell_deg"],
            "detection_radius_km": settings.data["zone_detection_radius_km"],
        },
        "method": (
            "Indicative gridded risk: the strongest recent detection signal within the "
            "cell radius plus a small village-exposure term. Empty habitat cells are omitted."
        ),
    }


@router.get("/analytics")
def analytics(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> dict:
    now = utcnow()
    since = now - timedelta(days=days)
    detections = db.scalars(
        select(Detection).where(Detection.detected_at >= since).order_by(Detection.detected_at)
    ).all()
    prior = db.scalars(select(Detection).where(Detection.detected_at < since)).all()

    species_counts = Counter(detection.species for detection in detections)
    risk_counts = Counter(detection.risk_level for detection in detections)
    basis_counts = Counter(detection.risk_basis or "unknown" for detection in detections)
    zone_counts = Counter(detection.zone or "Unassigned" for detection in detections)
    hour_counts = Counter(detection.detected_at.hour for detection in detections)
    camera_counts = Counter(detection.camera_code or "Unknown" for detection in detections)

    daily = defaultdict(int)
    for detection in detections:
        daily[detection.detected_at.date().isoformat()] += 1
    timeline = []
    for offset in range(days - 1, -1, -1):
        key = (now - timedelta(days=offset)).date().isoformat()
        timeline.append({"date": key, "detections": daily.get(key, 0)})

    species_rows = []
    for key in SPECIES_ORDER + ["unidentified"]:
        count = species_counts.get(key, 0)
        if not count:
            continue
        items = [detection for detection in detections if detection.species == key]
        species_rows.append(
            {
                "key": key,
                "name": species_meta(key)["name"],
                "count": count,
                "share": round(100 * count / max(1, len(detections)), 1),
                "avg_risk": round(sum(d.risk_score for d in items) / len(items), 1),
                "high_risk": len([d for d in items if d.risk_level == "high"]),
                "previous_period": len([d for d in prior if d.species == key]),
            }
        )

    incidents = db.scalars(select(Incident).where(Incident.created_at >= since)).all()
    incident_categories = Counter(incident.category for incident in incidents)
    incident_severity = Counter(incident.severity for incident in incidents)

    alerts = db.scalars(select(Alert).where(Alert.created_at >= since)).all()
    resolved = [alert for alert in alerts if alert.resolved_at and alert.acknowledged_at]
    ack_minutes = [
        (alert.acknowledged_at - alert.created_at).total_seconds() / 60
        for alert in alerts
        if alert.acknowledged_at
    ]
    resolve_hours = [
        (alert.resolved_at - alert.created_at).total_seconds() / 3600
        for alert in alerts
        if alert.resolved_at
    ]

    cameras = db.scalars(select(Camera)).all()
    guards = db.scalars(select(Guard)).all()

    return {
        "window_days": days,
        "totals": {
            "detections": len(detections),
            "previous_detections": len(prior),
            "species": len([key for key, count in species_counts.items() if count]),
            "high_risk": risk_counts.get("high", 0),
            "alerts": len(alerts),
            "open_alerts": len([a for a in alerts if a.status in ("active", "acknowledged", "responding")]),
            "incidents": len(incidents),
            "tracked_sequences": db.scalar(
                select(func.count(Track.id)).where(Track.ended_at >= since)
            ) or 0,
        },
        "species": species_rows,
        "timeline": timeline,
        "risk_distribution": {
            "low": risk_counts.get("low", 0),
            "moderate": risk_counts.get("moderate", 0),
            "high": risk_counts.get("high", 0),
        },
        "risk_basis": {
            "proximity": basis_counts.get("proximity", 0),
            "buffer_proximity": basis_counts.get("buffer_proximity", 0),
            "core_activity": basis_counts.get("core_activity", 0),
            "confirmed_movement": basis_counts.get("confirmed_movement", 0),
        },
        "zones": [{"name": key, "count": count} for key, count in zone_counts.most_common()],
        "hours": [{"hour": hour, "detections": hour_counts.get(hour, 0)} for hour in range(24)],
        "cameras": {
            "top": [
                {"code": code, "detections": count}
                for code, count in camera_counts.most_common(8)
            ],
            "online": len([c for c in cameras if c.status == "online"]),
            "maintenance": len([c for c in cameras if c.status == "maintenance"]),
            "offline": len([c for c in cameras if c.status == "offline"]),
        },
        "incidents": {
            "by_category": [
                {"category": key, "count": count}
                for key, count in incident_categories.most_common()
            ],
            "by_severity": [
                {"severity": key, "count": count}
                for key, count in incident_severity.most_common()
            ],
        },
        "response": {
            "alerts_total": len(alerts),
            "resolved": len(resolved),
            "acknowledged": len([a for a in alerts if a.acknowledged_at]),
            "avg_ack_minutes": round(sum(ack_minutes) / len(ack_minutes), 1) if ack_minutes else None,
            "avg_resolve_hours": round(sum(resolve_hours) / len(resolve_hours), 1)
            if resolve_hours
            else None,
            "acknowledgement_rate": round(
                100 * len([a for a in alerts if a.acknowledged_at]) / max(1, len(alerts)), 1
            ),
        },
        "guards": {
            "total": len(guards),
            "available": len([g for g in guards if g.status == "available"]),
            "on_patrol": len([g for g in guards if g.status == "on_patrol"]),
            "off_duty": len([g for g in guards if g.status == "off_duty"]),
        },
        "generated_at": now.isoformat() + "Z",
        "note": "Demonstration dataset. Response-time figures are artefactual for synthetic records.",
    }


@router.get("/analytics/export")
def export_analytics(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_guard),
) -> Response:
    since = utcnow() - timedelta(days=days)
    detections = db.scalars(
        select(Detection)
        .where(Detection.detected_at >= since)
        .order_by(Detection.detected_at.desc())
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "detection_id",
            "species",
            "species_name",
            "confidence",
            "detected_at_utc",
            "camera_code",
            "zone",
            "latitude",
            "longitude",
            "risk_score",
            "risk_level",
            "risk_basis",
            "nearest_village",
            "distance_km",
            "source_type",
            "is_simulated",
        ]
    )
    for detection in detections:
        writer.writerow(
            [
                detection.id,
                detection.species,
                species_meta(detection.species)["name"],
                round(detection.confidence, 3),
                detection.detected_at.isoformat() + "Z",
                detection.camera_code,
                detection.zone,
                detection.lat,
                detection.lon,
                detection.risk_score,
                detection.risk_level,
                detection.risk_basis,
                detection.nearest_village.name if detection.nearest_village else "",
                detection.observed_distance_km,
                detection.source_type,
                "yes" if detection.is_simulated else "no",
            ]
        )
    filename = f"forest_guard_detections_{days}d.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
