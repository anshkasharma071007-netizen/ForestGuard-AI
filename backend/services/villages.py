"""Database village lookup and the bundled demonstration geography."""
import json

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend import config
from backend.models import Village
from geospatial.mapping import polygon_ring, valid_coordinates


def resolve_village(db: Session, *, village_id: int | None = None, village_code: str | None = None) -> Village | None:
    if village_id is not None and village_code is not None:
        raise HTTPException(400, "Choose a village by ID or code.")
    if village_id is None and village_code is None:
        return None
    village = db.get(Village, village_id) if village_id is not None else db.scalar(
        select(Village).where(Village.code == village_code)
    )
    if village is None:
        raise HTTPException(400, "Unknown village.")
    return village


def is_demo_village(village: Village) -> bool:
    geometry = village.boundary_geojson
    properties = geometry.get("properties") if isinstance(geometry, dict) else None
    return isinstance(properties, dict) and properties.get("is_demo") is True


def village_center(village: Village, *, public: bool = False) -> dict:
    if not valid_coordinates(village.lat, village.lon):
        return {"lat": None, "lon": None}
    if public and not is_demo_village(village):
        return {"lat": round(village.lat, 2), "lon": round(village.lon, 2)}
    return {"lat": village.lat, "lon": village.lon}


def village_risk_inputs(db: Session) -> list[dict]:
    return [
        {"id": village.id, "name": village.name, "lat": village.lat, "lon": village.lon,
         "population": village.population, "boundary_ring": polygon_ring(village.boundary_geojson)}
        for village in db.scalars(select(Village)).all()
    ]


def bundled_demo_villages() -> list[Village]:
    with open(config.STUDY_AREA_PATH, encoding="utf-8") as file:
        features = json.load(file)["features"]
    villages = []
    for feature in features:
        props = feature["properties"]
        if props.get("layer") != "village" or props.get("is_demo") is not True:
            continue
        villages.append(Village(
            code=props["id"], name=props["name"], district=props["district"],
            lat=props["lat"], lon=props["lon"], population=props.get("population", 0),
            households=props.get("households", 0), boundary_geojson=feature, note=props["note"],
        ))
    return villages


def provision_demo_villages(db: Session) -> dict[str, str]:
    if config.DB_MODE == "cloud":
        raise ValueError("Demo village provisioning is available only in local mode.")
    if config.APP_ENV != "development" or not config.DEMO_VILLAGES_ENABLED:
        raise ValueError("Set APP_ENV=development and DEMO_VILLAGES_ENABLED=true to provision demo villages.")
    with db.begin():
        if db.get_bind().dialect.name == "postgresql":
            if not db.scalar(text("SELECT inet_server_addr() IS NULL OR host(inet_server_addr()) IN ('127.0.0.1', '::1')")):
                raise ValueError("Demo village provisioning requires a local PostgreSQL server.")
            db.execute(text("LOCK TABLE villages IN SHARE ROW EXCLUSIVE MODE"))
        else:
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        existing = db.scalars(select(Village)).all()
        by_code = {village.code: village for village in existing}
        names = {village.name.strip().casefold() for village in existing}
        result = {}
        for village in bundled_demo_villages():
            current = by_code.get(village.code)
            if current is not None:
                result[village.code] = "already provisioned" if (
                    is_demo_village(current) and current.name == village.name
                ) else "existing code preserved"
            elif village.name.casefold() in names:
                result[village.code] = "existing name preserved"
            else:
                db.add(village)
                names.add(village.name.casefold())
                result[village.code] = "created"
    return result
