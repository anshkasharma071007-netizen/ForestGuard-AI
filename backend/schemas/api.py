from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=1, max_length=200)


class RiskConfigPatch(BaseModel):
    alert_threshold: float | None = Field(default=None, ge=0, le=100)
    alert_radius_km: float | None = Field(default=None, ge=0.2, le=25)
    influence_radius_km: float | None = Field(default=None, ge=0.5, le=30)
    thresholds: dict[str, float] | None = None
    weights: dict[str, float] | None = None
    species_weights: dict[str, float] | None = None
    frequency_target: float | None = Field(default=None, ge=1, le=100)
    incident_target: float | None = Field(default=None, ge=1, le=50)
    recency_halflife_days: float | None = Field(default=None, ge=0.5, le=120)


class AlertActionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class AlertAssignRequest(BaseModel):
    guard_id: int
    note: str | None = Field(default=None, max_length=1000)


class AlertResolveRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class IncidentUpdateRequest(BaseModel):
    status: Literal["open", "verified", "resolved", "dismissed"] | None = None
    verified: bool | None = None
    note: str | None = Field(default=None, max_length=1000)


class SightingStatusUpdate(BaseModel):
    status: Literal["pending", "forwarded", "closed"] | None = None
    note: str | None = Field(default=None, max_length=1000)


class CommunityReportResponse(BaseModel):
    reference_code: str
    status: str
    message: str


class MetaResponse(BaseModel):
    project: dict[str, Any]
    demo: dict[str, Any]
    study_area: dict[str, Any]
    ai: dict[str, Any]
    supported_species: list[dict[str, Any]]
