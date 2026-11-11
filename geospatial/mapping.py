"""Small, dependency-free geodesic helpers used by the risk and tracking engines.

Distances are Haversine/equirectangular approximations intended for regional
(~50 km) conservation planning, not survey-grade measurement.
"""
from __future__ import annotations

import json
import math
from typing import Iterable, Sequence

EARTH_RADIUS_KM = 6371.0088
Coord = Sequence[float]  # (lon, lat) for GeoJSON, or handled explicitly below


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def local_xy(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Equirectangular projection to kilometres relative to an origin."""
    x = math.radians(lon - lon0) * EARTH_RADIUS_KM * math.cos(math.radians(lat0))
    y = math.radians(lat - lat0) * EARTH_RADIUS_KM
    return x, y


def distance_point_to_segment_km(
    lat: float, lon: float, a_lat: float, a_lon: float, b_lat: float, b_lon: float
) -> float:
    px, py = local_xy(lat, lon, lat, lon)
    ax, ay = local_xy(a_lat, a_lon, lat, lon)
    bx, by = local_xy(b_lat, b_lon, lat, lon)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def point_in_polygon(lat: float, lon: float, ring: Sequence[Sequence[float]]) -> bool:
    """Ray casting on a closed ring given as [lon, lat] pairs."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def polygon_ring(geometry: dict) -> list[list[float]]:
    """Return the outer ring of a Polygon/MultiPolygon geometry."""
    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry") or {}
    if geometry.get("type") == "Polygon":
        return list(geometry["coordinates"][0])
    if geometry.get("type") == "MultiPolygon":
        return list(geometry["coordinates"][0][0])
    return []


def distance_to_polygon_km(lat: float, lon: float, ring: Sequence[Sequence[float]]) -> float:
    """Distance in km to a polygon boundary (0 when inside)."""
    if not ring:
        return float("inf")
    if point_in_polygon(lat, lon, ring):
        return 0.0
    best = float("inf")
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        d = distance_point_to_segment_km(lat, lon, a[1], a[0], b[1], b[0])
        if d < best:
            best = d
    return best


def distance_to_geometry_km(lat: float, lon: float, geometry: dict) -> float:
    if geometry.get("type") == "Polygon":
        return distance_to_polygon_km(lat, lon, geometry["coordinates"][0])
    if geometry.get("type") == "MultiPolygon":
        return min(distance_to_polygon_km(lat, lon, poly[0]) for poly in geometry["coordinates"])
    if geometry.get("type") == "Point":
        lon0, lat0 = geometry["coordinates"][:2]
        return haversine_km(lat, lon, lat0, lon0)
    return float("inf")


def polygon_centroid(ring: Sequence[Sequence[float]]) -> tuple[float, float]:
    """Return (lat, lon) centroid of a ring using the shoelace formula."""
    if not ring:
        return 0.0, 0.0
    area = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-12:
        return ring[0][1], ring[0][0]
    return cy / (3 * area), cx / (3 * area)


def polygon_area_km2(ring: Sequence[Sequence[float]]) -> float:
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    lon0 = sum(p[0] for p in ring) / len(ring)
    pts = [local_xy(p[1], p[0], lat0, lon0) for p in ring]
    area = 0.0
    for i in range(len(pts) - 1):
        area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(area) / 2


def circle_ring(lat: float, lon: float, radius_km: float, points: int = 48) -> list[list[float]]:
    """Approximate a small circle as a closed [lon, lat] ring."""
    ring: list[list[float]] = []
    for i in range(points):
        bearing = 2 * math.pi * i / points
        dlat = (radius_km / EARTH_RADIUS_KM) * math.degrees(1) * math.cos(bearing)
        dlon = (radius_km / (EARTH_RADIUS_KM * math.cos(math.radians(lat)))) * math.degrees(1) * math.sin(bearing)
        ring.append([round(lon + dlon, 6), round(lat + dlat, 6)])
    ring.append(ring[0])
    return ring


def bbox_of_ring(ring: Sequence[Sequence[float]]) -> tuple[float, float, float, float]:
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lats), min(lons), max(lats), max(lons)


def feature(geometry: dict, properties: dict | None = None) -> dict:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def point_feature(lat: float, lon: float, properties: dict | None = None) -> dict:
    return feature({"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, properties)


def polygon_feature(ring: Sequence[Sequence[float]], properties: dict | None = None) -> dict:
    return feature({"type": "Polygon", "coordinates": [list(ring)]}, properties)


def collection(features: Iterable[dict]) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: str, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
