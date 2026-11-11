"""Spatio-temporal association of camera detections into *inferred* tracks.

This intentionally does not claim individual re-identification or GPS
telemetry. A track simply links sequential camera observations of the same
species that are close in space and time, and reports the direction of the
sequence relative to the nearest village boundary.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from geospatial.mapping import haversine_km, polygon_ring, distance_to_polygon_km

from backend.models import Detection, Track, Village

MAX_GAP_HOURS = 24.0
MAX_DISTANCE_KM = 7.0
MAX_SPAN_HOURS = 72.0
MAX_POINTS = 8
MIN_POINTS = 3


def _village_dict(village: Village) -> dict:
    return {
        "id": village.id,
        "name": village.name,
        "lat": village.lat,
        "lon": village.lon,
        "boundary_ring": polygon_ring(village.boundary_geojson),
    }


def _nearest(lat: float, lon: float, villages: list[dict]) -> tuple[dict | None, float]:
    best, distance = None, float("inf")
    for village in villages:
        d = distance_to_polygon_km(lat, lon, village["boundary_ring"])
        if d < distance:
            best, distance = village, d
    return best, distance


def _finalise(chain: list[Detection], villages: list[dict]) -> dict | None:
    if len(chain) < MIN_POINTS:
        return None
    cameras = {det.camera_id for det in chain if det.camera_id is not None}
    if len(cameras) < 2:
        return None
    ordered = sorted(chain, key=lambda det: det.detected_at)
    first, last = ordered[0], ordered[-1]
    last_village, last_distance = _nearest(last.lat, last.lon, villages)
    if last_village is None:
        return None
    _, first_distance_same = _nearest(first.lat, first.lon, [last_village])
    if last_distance < first_distance_same - 0.5:
        direction = "toward_village"
    elif last_distance > first_distance_same + 0.5:
        direction = "away_from_village"
    else:
        direction = "parallel_or_unclear"

    distance = 0.0
    for a, b in zip(ordered, ordered[1:]):
        distance += haversine_km(a.lat, a.lon, b.lat, b.lon)
    return {
        "species": ordered[0].species,
        "started_at": first.detected_at,
        "ended_at": last.detected_at,
        "point_count": len(ordered),
        "path_geojson": {
            "type": "LineString",
            "coordinates": [[round(det.lon, 6), round(det.lat, 6)] for det in ordered],
        },
        "distance_km": round(distance, 2),
        "direction": direction,
        "nearest_village_id": last_village["id"],
        "confidence": round(sum(det.confidence for det in ordered) / len(ordered), 3),
        "is_simulated": all(det.is_simulated for det in ordered),
        "detections": ordered,
    }


def infer_tracks(detections: list[Detection], villages: list[dict]) -> list[dict]:
    grouped: dict[str, list[Detection]] = defaultdict(list)
    for det in detections:
        grouped[det.species].append(det)

    tracks: list[dict] = []
    for species, items in grouped.items():
        ordered = sorted(items, key=lambda det: det.detected_at)
        chain: list[Detection] = []
        for det in ordered:
            if not chain:
                chain = [det]
                continue
            previous = chain[-1]
            gap_hours = (det.detected_at - previous.detected_at).total_seconds() / 3600.0
            distance = haversine_km(previous.lat, previous.lon, det.lat, det.lon)
            span_hours = (det.detected_at - chain[0].detected_at).total_seconds() / 3600.0
            if (
                0 <= gap_hours <= MAX_GAP_HOURS
                and distance <= MAX_DISTANCE_KM
                and span_hours <= MAX_SPAN_HOURS
                and len(chain) < MAX_POINTS
            ):
                chain.append(det)
            else:
                track = _finalise(chain, villages)
                if track:
                    tracks.append(track)
                chain = [det]
        track = _finalise(chain, villages)
        if track:
            tracks.append(track)
    tracks.sort(key=lambda item: item["ended_at"], reverse=True)
    return tracks


def rebuild_tracks(db: Session) -> list[Track]:
    villages = [_village_dict(v) for v in db.scalars(select(Village)).all()]
    detections = db.scalars(select(Detection).order_by(Detection.detected_at)).all()
    for det in detections:
        det.track_id = None
    db.flush()
    db.query(Track).delete(synchronize_session=False)
    db.flush()

    created: list[Track] = []
    for spec in infer_tracks(list(detections), villages):
        track = Track(
            species=spec["species"],
            started_at=spec["started_at"],
            ended_at=spec["ended_at"],
            point_count=spec["point_count"],
            path_geojson=spec["path_geojson"],
            distance_km=spec["distance_km"],
            direction=spec["direction"],
            nearest_village_id=spec["nearest_village_id"],
            confidence=spec["confidence"],
            is_simulated=spec["is_simulated"],
        )
        db.add(track)
        db.flush()
        for det in spec["detections"]:
            det.track_id = track.id
        created.append(track)
    db.commit()
    return created
