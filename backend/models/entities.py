from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20), index=True)  # admin | guard
    badge_id: Mapped[str | None] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    guard: Mapped["Guard | None"] = relationship(back_populates="user", uselist=False)


class Village(Base):
    __tablename__ = "villages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    district: Mapped[str] = mapped_column(String(120), default="Seoni")
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    population: Mapped[int] = mapped_column(Integer, default=0)
    households: Mapped[int] = mapped_column(Integer, default=0)
    boundary_geojson: Mapped[dict] = mapped_column(JSON)
    note: Mapped[str | None] = mapped_column(Text)
    risk_level: Mapped[str] = mapped_column(String(20), default="low")
    last_alert_at: Mapped[datetime | None] = mapped_column(DateTime)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    zone: Mapped[str] = mapped_column(String(80), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="online")  # online | maintenance | offline
    last_seen: Mapped[datetime | None] = mapped_column(DateTime)
    installed_on: Mapped[datetime | None] = mapped_column(DateTime)


class Guard(Base):
    __tablename__ = "guards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    badge_id: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    zone: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), default="available")  # available | on_patrol | off_duty
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User | None] = relationship(back_populates="guard")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="assigned_guard")


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    species: Mapped[str] = mapped_column(String(40), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    species_confidence: Mapped[float | None] = mapped_column(Float)
    detector_confidence: Mapped[float | None] = mapped_column(Float)
    detected_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"))
    camera_code: Mapped[str | None] = mapped_column(String(40))
    zone: Mapped[str | None] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float, index=True)
    lon: Mapped[float] = mapped_column(Float, index=True)
    image_path: Mapped[str | None] = mapped_column(String(255))
    annotated_path: Mapped[str | None] = mapped_column(String(255))
    bbox: Mapped[list | None] = mapped_column(JSON)
    source_type: Mapped[str] = mapped_column(String(30), default="camera_trap")
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("tracks.id"))
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="low", index=True)
    risk_basis: Mapped[str | None] = mapped_column(String(40))
    risk_components: Mapped[list | None] = mapped_column(JSON)
    nearest_village_id: Mapped[int | None] = mapped_column(ForeignKey("villages.id"))
    observed_distance_km: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    camera: Mapped[Camera | None] = relationship()
    track: Mapped["Track | None"] = relationship(back_populates="detections")
    nearest_village: Mapped[Village | None] = relationship()
    alerts: Mapped[list["Alert"]] = relationship(back_populates="detection")


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    species: Mapped[str] = mapped_column(String(40), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime] = mapped_column(DateTime)
    point_count: Mapped[int] = mapped_column(Integer, default=0)
    path_geojson: Mapped[dict] = mapped_column(JSON)
    distance_km: Mapped[float] = mapped_column(Float, default=0.0)
    direction: Mapped[str] = mapped_column(String(30), default="unknown")
    nearest_village_id: Mapped[int | None] = mapped_column(ForeignKey("villages.id"))
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    method: Mapped[str] = mapped_column(
        String(120), default="Sequential camera detections (spatial-temporal association)"
    )

    detections: Mapped[list[Detection]] = relationship(back_populates="track")
    nearest_village: Mapped[Village | None] = relationship()


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(60), index=True)
    description: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    village_id: Mapped[int | None] = mapped_column(ForeignKey("villages.id"))
    species: Mapped[str | None] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20), default="moderate")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | verified | resolved | dismissed
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    reported_by: Mapped[str] = mapped_column(String(120), default="Forest department")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    image_path: Mapped[str | None] = mapped_column(String(255))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)

    village: Mapped[Village | None] = relationship()


class SightingReport(Base):
    __tablename__ = "sighting_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(30), default="sighting")  # sighting | conflict
    species: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    village_id: Mapped[int | None] = mapped_column(ForeignKey("villages.id"))
    reporter_name: Mapped[str] = mapped_column(String(120))
    contact: Mapped[str | None] = mapped_column(String(80))
    image_path: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | forwarded | closed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)

    village: Mapped[Village | None] = relationship()


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    detection_id: Mapped[int | None] = mapped_column(ForeignKey("detections.id"))
    species: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20), index=True)  # moderate | high
    score: Mapped[float] = mapped_column(Float)
    risk_basis: Mapped[str] = mapped_column(String(40), default="proximity")
    reason: Mapped[str] = mapped_column(Text)
    village_ids: Mapped[list] = mapped_column(JSON, default=list)
    radius_km: Mapped[float] = mapped_column(Float, default=3.5)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    priority_rank: Mapped[int] = mapped_column(Integer, default=3)
    assigned_guard_id: Mapped[int | None] = mapped_column(ForeignKey("guards.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    public_summary: Mapped[str | None] = mapped_column(Text)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)

    detection: Mapped[Detection | None] = relationship(back_populates="alerts")
    assigned_guard: Mapped[Guard | None] = relationship(back_populates="alerts")
    events: Mapped[list["AlertEvent"]] = relationship(
        back_populates="alert", cascade="all, delete-orphan", order_by="AlertEvent.created_at"
    )


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(120), default="System")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    alert: Mapped[Alert] = relationship(back_populates="events")
