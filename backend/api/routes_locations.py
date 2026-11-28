"""Authenticated proxy for Geoapify. Provider errors never expose the API key."""

import json
import time
from functools import lru_cache
from typing import Annotated, Literal
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from backend import config
from backend.api.routes_citizen import get_citizen
from geospatial.mapping import valid_coordinates

router = APIRouter(prefix="/api/citizen/locations", tags=["citizen locations"], dependencies=[Depends(get_citizen)])


class PlaceSearch(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)]
    mode: Literal["autocomplete", "search"] = "autocomplete"


class ReverseLocation(BaseModel):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)


@lru_cache(maxsize=512)
def _geoapify(operation: str, parameters: tuple, _cache_window: int):
    if not config.GEOAPIFY_API_KEY:
        raise HTTPException(503, "Place search is unavailable. You can still choose a point on the map.")
    url = f"https://api.geoapify.com/v1/geocode/{operation}?" + urlencode(
        (*parameters, ("apiKey", config.GEOAPIFY_API_KEY), ("format", "json")))
    try:
        with urlopen(url, timeout=6) as response:
            results = json.load(response)["results"]
        return tuple({"label": item["formatted"][:250], "lat": item["lat"], "lon": item["lon"]}
                     for item in results if isinstance(item.get("formatted"), str) and item["formatted"]
                     and valid_coordinates(item.get("lat"), item.get("lon")))
    except (URLError, TimeoutError, ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(502, "Could not look up this location. Try again or choose a point on the map.") from None


@router.post("/search")
def search_places(payload: PlaceSearch):
    text = " ".join(payload.text.split())
    if len(text) < 3:
        return {"items": []}
    return {"items": _geoapify(payload.mode, (("text", text), ("filter", "countrycode:in"), ("limit", 6)),
                              int(time.monotonic() // 300))}


@router.post("/reverse")
def reverse_place(payload: ReverseLocation):
    results = _geoapify("reverse", (("lat", round(payload.lat, 5)), ("lon", round(payload.lon, 5)), ("limit", 1)),
                        int(time.monotonic() // 300))
    return {"label": results[0]["label"] if results else None}
