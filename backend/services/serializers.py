from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from geospatial.species import species_meta

from sqlalchemy.orm import Session

from backend.models import Alert, Camera, Detection, Guard, Incident, SightingReport, Track, Village


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def media_url(path: str | None) -> str | None:
    if not path:
        return None
    return f"/media/{path.lstrip('/')}"


def species_info(key: str) -> dict:
    meta = species_meta(key)
    return {
        "key": key,
        "name": meta["name"],
        "scientific": meta["scientific"],
        "color": meta["color"],
        "accent": meta["accent"],
        "image": f"/images/{meta['image'].replace('.jpg', '.webp')}",
        "threat": meta["threat"],
        "advice": meta["advice"],
    }


def serialize_camera(camera: Camera, *, public: bool = False) -> dict:
    data = {
        "id": camera.id,
        "code": camera.code,
        "name": camera.name,
        "zone": camera.zone,
        "status": camera.status,
        "last_seen": iso(camera.last_seen),
        "installed_on": iso(camera.installed_on),
    }
    if not public:
        data.update({"lat": camera.lat, "lon": camera.lon})
    return data


def serialize_village(village: Village, *, public: bool = False) -> dict:
    data = {
        "id": village.id,
        "code": village.code,
        "name": village.name,
        "district": village.district,
        "population": village.population,
        "households": village.households,
        "risk_level": village.risk_level,
        "last_alert_at": iso(village.last_alert_at),
        "boundary": village.boundary_geojson,
        "note": village.note,
    }
    if not public:
        data.update({"lat": village.lat, "lon": village.lon})
    return data


def serialize_guard(guard: Guard) -> dict:
    return {
        "id": guard.id,
        "badge_id": guard.badge_id,
        "name": guard.name,
        "phone": guard.phone,
        "zone": guard.zone,
        "status": guard.status,
        "lat": guard.lat,
        "lon": guard.lon,
    }


def serialize_detection(det: Detection, *, include_bbox: bool = True) -> dict:
    meta = species_meta(det.species)
    data = {
        "id": det.id,
        "species": det.species,
        "species_name": meta["name"],
        "scientific": meta["scientific"],
        "color": meta["color"],
        "confidence": round(det.confidence, 3),
        "species_confidence": round(det.species_confidence, 3) if det.species_confidence is not None else None,
        "detector_confidence": round(det.detector_confidence, 3) if det.detector_confidence is not None else None,
        "detected_at": iso(det.detected_at),
        "camera_id": det.camera_id,
        "camera_code": det.camera_code,
        "camera_name": det.camera.name if det.camera else None,
        "zone": det.zone,
        "lat": det.lat,
        "lon": det.lon,
        "image_url": media_url(det.image_path),
        "annotated_url": media_url(det.annotated_path),
        "source_type": det.source_type,
        "is_simulated": det.is_simulated,
        "track_id": det.track_id,
        "risk_score": det.risk_score,
        "risk_level": det.risk_level,
        "risk_basis": det.risk_basis,
        "nearest_village": det.nearest_village.name if det.nearest_village else None,
        "nearest_village_id": det.nearest_village_id,
        "distance_km": det.observed_distance_km,
        "notes": det.notes,
        "track_direction": det.track.direction if det.track else None,
    }
    if include_bbox:
        data["bbox"] = det.bbox
    return data


def serialize_track(track: Track) -> dict:
    coords = (track.path_geojson or {}).get("coordinates", [])
    return {
        "id": track.id,
        "species": track.species,
        "species_name": species_meta(track.species)["name"],
        "color": species_meta(track.species)["color"],
        "started_at": iso(track.started_at),
        "ended_at": iso(track.ended_at),
        "point_count": track.point_count,
        "distance_km": round(track.distance_km, 2),
        "direction": track.direction,
        "nearest_village": track.nearest_village.name if track.nearest_village else None,
        "confidence": round(track.confidence, 3),
        "points": [[lat, lon] for lon, lat in coords],
        "geojson": track.path_geojson,
        "is_simulated": track.is_simulated,
        "method": track.method,
        "disclaimer": "Inferred from sequential camera detections — not GPS telemetry or individual identification.",
    }


def serialize_alert(
    alert: Alert,
    *,
    include_events: bool = False,
    include_detection: bool = False,
    villages: list[dict] | None = None,
) -> dict:
    detection = alert.detection
    meta = species_meta(alert.species)
    villages = villages or []
    village_names = [v["name"] for v in villages]
    data = {
        "id": alert.id,
        "detection_id": alert.detection_id,
        "species": alert.species,
        "species_name": meta["name"],
        "color": meta["color"],
        "severity": alert.severity,
        "score": round(alert.score, 1),
        "risk_basis": alert.risk_basis,
        "reason": alert.reason,
        "village_ids": alert.village_ids or [],
        "village_names": village_names,
        "villages": villages,
        "radius_km": alert.radius_km,
        "status": alert.status,
        "priority_rank": alert.priority_rank,
        "created_at": iso(alert.created_at),
        "acknowledged_at": iso(alert.acknowledged_at),
        "resolved_at": iso(alert.resolved_at),
        "public_summary": alert.public_summary,
        "is_simulated": alert.is_simulated,
        "assigned_guard": serialize_guard(alert.assigned_guard) if alert.assigned_guard else None,
        "detection": serialize_detection(detection) if (include_detection and detection) else None,
        "advice": meta["advice"],
    }
    if include_events:
        data["events"] = [
            {
                "id": event.id,
                "kind": event.kind,
                "note": event.note,
                "actor": event.actor,
                "created_at": iso(event.created_at),
            }
            for event in alert.events
        ]
    return data


def serialize_incident(incident: Incident) -> dict:
    return {
        "id": incident.id,
        "category": incident.category,
        "description": incident.description,
        "lat": incident.lat,
        "lon": incident.lon,
        "village_id": incident.village_id,
        "village_name": incident.village.name if incident.village else None,
        "species": incident.species,
        "species_name": species_meta(incident.species)["name"] if incident.species else None,
        "severity": incident.severity,
        "status": incident.status,
        "verified": incident.verified,
        "reported_by": incident.reported_by,
        "created_at": iso(incident.created_at),
        "resolved_at": iso(incident.resolved_at),
        "image_url": media_url(incident.image_path),
        "is_simulated": incident.is_simulated,
        "is_public": incident.is_public,
    }


def serialize_sighting(report: SightingReport, *, public: bool = False) -> dict:
    data = {
        "id": report.id if not public else None,
        "reference_code": report.reference_code,
        "category": report.category,
        "species": report.species,
        "species_name": species_meta(report.species)["name"],
        "description": report.description,
        "village_id": report.village_id,
        "village_name": report.village.name if report.village else None,
        "reporter_name": report.reporter_name,
        "image_url": media_url(report.image_path),
        "status": report.status,
        "created_at": iso(report.created_at),
        "is_simulated": report.is_simulated,
    }
    if not public:
        data.update({"lat": report.lat, "lon": report.lon, "contact": report.contact})
    return data


def alert_village_details(db: Session, alert: Alert, *, public: bool = False) -> list[dict]:
    if not alert.village_ids:
        return []
    villages = db.query(Village).filter(Village.id.in_(alert.village_ids)).all()
    ordered = {village.id: village for village in villages}
    return [
        serialize_village(ordered[vid], public=public)
        for vid in alert.village_ids
        if vid in ordered
    ]
