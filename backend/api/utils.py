from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import config
from backend.models import Alert, Village
from backend.services.serializers import alert_village_details, iso, serialize_alert
from backend.services.villages import is_demo_village

def query_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    out: list[str] = []
    for value in values:
        out.extend(part.strip() for part in value.split(",") if part.strip())
    return out


def parse_dt(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        cleaned = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(cleaned)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        if end_of_day and len(value) <= 10:
            parsed = parsed.replace(hour=23, minute=59, second=59)
        return parsed
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {value}") from exc


def load_study_area() -> dict:
    try:
        with open(config.STUDY_AREA_PATH, "r", encoding="utf-8") as fh:
            study = json.load(fh)
            study["features"] = [feature for feature in study["features"] if feature["properties"].get("layer") != "village"]
            return study
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Study area geometry is unavailable.") from exc


def study_bbox() -> tuple[float, float, float, float]:
    study = load_study_area()
    landscapes = [
        f for f in study["features"] if f["properties"].get("layer") == "landscape"
    ]
    ring = landscapes[0]["geometry"]["coordinates"][0] if landscapes else []
    lats = [point[1] for point in ring]
    lons = [point[0] for point in ring]
    if not lats:
        return (21.63, 79.22, 21.84, 79.47)
    return (min(lats), min(lons), max(lats), max(lons))


def alert_payload(
    db: Session,
    alert: Alert,
    *,
    include_events: bool = False,
    include_detection: bool = False,
    public: bool = False,
) -> dict:
    details = alert_village_details(db, alert, public=public)
    return serialize_alert(
        alert,
        include_events=include_events,
        include_detection=include_detection,
        villages=details,
    )


def village_map(db: Session) -> dict[int, Village]:
    return {village.id: village for village in db.query(Village).all()}


def public_area_label(villages: list[Village]) -> str:
    if villages and all(is_demo_village(village) for village in villages):
        return "Illustrative Pench area (Demo)"
    return next((village.district for village in villages if village.district and not is_demo_village(village)),
                "Buffer landscape")


def now_iso() -> str:
    return iso(datetime.now(timezone.utc).replace(tzinfo=None))
