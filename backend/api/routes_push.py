"""Device registration and consent for citizen remote notifications."""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, text
from sqlalchemy.orm import Session

from backend import config
from backend.api.routes_citizen import _session
from backend.database.session import get_db
from backend.models.entities import Citizen, CitizenNotification, CitizenPushDelivery, CitizenPushDevice, CitizenSession, SightingReport, utcnow
from backend.services.citizen_push import monitoring_point
from backend.services.incident_lifecycle import lock_record

router = APIRouter(prefix="/api/citizen/push", tags=["citizen push"])


class PushPreferences(BaseModel):
    reports: bool
    nearby: bool


class Registration(BaseModel):
    installation: UUID
    token: str = Field(max_length=200, pattern=r"^(ExpoPushToken|ExponentPushToken)\[[a-zA-Z0-9_-]+\]$")


class OpenEvent(BaseModel):
    id: UUID


def _lock_session(db, session):
    if db.get_bind().dialect.name == "sqlite" and not db.connection().connection.driver_connection.in_transaction:
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    active = db.scalar(select(CitizenSession).where(CitizenSession.token_hash == session.token_hash,
                                                   CitizenSession.expires_at > utcnow())
                       .with_for_update().execution_options(populate_existing=True))
    if not active or active.auth_method != "email":
        raise HTTPException(403, "Sign in with your verified email to manage push notifications.")


@router.put("/preferences")
def save_preferences(payload: PushPreferences, session: CitizenSession = Depends(_session), db: Session = Depends(get_db)):
    _lock_session(db, session)
    citizen = lock_record(db, Citizen, session.citizen_id)
    if payload.nearby and monitoring_point(citizen) is None:
        raise HTTPException(400, "Save an alert location before enabling nearby push notifications.")
    citizen.push_reports, citizen.push_nearby = payload.reports, payload.nearby
    db.commit()
    return {"reports": citizen.push_reports, "nearby": citizen.push_nearby}


@router.put("/device")
def register_device(payload: Registration, session: CitizenSession = Depends(_session), db: Session = Depends(get_db)):
    if not config.EXPO_PUSH_ENABLED:
        raise HTTPException(503, "Remote notifications are unavailable on this server.")
    _lock_session(db, session)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(71239411)"))
    installation = str(payload.installation)
    devices = db.scalars(select(CitizenPushDevice).where(or_(
        CitizenPushDevice.installation == installation, CitizenPushDevice.token == payload.token,
    )).order_by(CitizenPushDevice.id).with_for_update()).all()
    for device in devices:
        if (device.session_hash == session.token_hash and device.installation == installation
                and device.token == payload.token):
            return {"registered": True}
        db.delete(device)
    db.flush()
    db.add(CitizenPushDevice(id=str(uuid4()), installation=installation, token=payload.token,
                             session_hash=session.token_hash))
    db.commit()
    return {"registered": True}


@router.delete("/device/{installation}")
def unregister_device(installation: UUID, session: CitizenSession = Depends(_session), db: Session = Depends(get_db)):
    _lock_session(db, session)
    db.execute(delete(CitizenPushDevice).where(CitizenPushDevice.session_hash == session.token_hash,
                                              CitizenPushDevice.installation == str(installation)))
    db.commit()
    return {"removed": True}


@router.post("/open")
def open_event(payload: OpenEvent, session: CitizenSession = Depends(_session), db: Session = Depends(get_db)):
    delivery = db.scalar(select(CitizenPushDelivery).join(CitizenPushDevice).where(
        CitizenPushDevice.session_hash == session.token_hash,
        CitizenPushDelivery.notification_id == str(payload.id),
    ))
    if not delivery:
        raise HTTPException(404, "That notification is no longer available.")
    namespace, event = delivery.event_key.split(":")
    if namespace == "alert":
        return {"screen": "map", "alert_id": int(event)}
    reference = db.scalar(select(SightingReport.reference_code).join(CitizenNotification).where(
        CitizenNotification.report_id == int(namespace), CitizenNotification.event == event,
        CitizenNotification.citizen_id == session.citizen_id, SightingReport.citizen_id == session.citizen_id,
    ))
    if reference is None:
        raise HTTPException(404, "That notification is no longer available.")
    return {"screen": "report", "reference_code": reference}
