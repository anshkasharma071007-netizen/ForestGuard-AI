"""Deliver opted-in lifecycle and nearby alert messages through Expo."""

import logging
from datetime import timedelta
from threading import Event
from uuid import uuid4

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, selectinload

from backend import config
from backend.database.session import SessionLocal
from backend.models.entities import Alert, Citizen, CitizenPushDelivery as Delivery, CitizenPushDevice as Device
from backend.models.entities import CitizenSession, Incident, utcnow
from backend.services.villages import village_center
from geospatial.mapping import haversine_km, valid_coordinates

logger = logging.getLogger(__name__)
BASE_URL = "https://exp.host/--/api/v2/push"
ACTIVE_ALERT_STATES = ("active", "acknowledged", "responding")


def monitoring_point(citizen):
    village = citizen.alert_village
    if village and valid_coordinates(village.lat, village.lon):
        point = village_center(village, public=True)
        return point["lat"], point["lon"]
    if valid_coordinates(citizen.alert_lat, citizen.alert_lon):
        return citizen.alert_lat, citizen.alert_lon
    return None


def _in_range(citizen, alert):
    point = monitoring_point(citizen)
    return point is not None and haversine_km(*point, alert.public_lat, alert.public_lon) <= citizen.alert_radius_km


def _subscribers(at):
    return (select(Device.id, Citizen).options(selectinload(Citizen.alert_village)).join(CitizenSession, CitizenSession.token_hash == Device.session_hash)
            .join(Citizen, Citizen.id == CitizenSession.citizen_id)
            .where(CitizenSession.expires_at > at, CitizenSession.auth_method == "email")
            .with_for_update(of=Device, read=True, key_share=True))


def _queue(db, device_ids, event_key, at):
    rows = [{"device_id": device, "event_key": event_key, "notification_id": str(uuid4()), "next_at": at,
             "expires_at": at + timedelta(hours=24), "attempts": 0} for device in device_ids]
    if rows:
        insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
        for offset in range(0, len(rows), 100):
            db.execute(insert(Delivery).values(rows[offset:offset + 100]).on_conflict_do_nothing())


def queue_report(db, citizen_id, report_id, event, at):
    if config.EXPO_PUSH_ENABLED:
        devices = db.execute(_subscribers(at).where(Citizen.id == citizen_id, Citizen.push_reports.is_(True)))
        _queue(db, [device for device, _ in devices], f"{report_id}:{event}", at)


def queue_nearby(db, alert, incident):
    if (not config.EXPO_PUSH_ENABLED or not incident.verified or alert.is_simulated
            or not valid_coordinates(alert.public_lat, alert.public_lon)):
        return
    now = utcnow()
    devices = db.execute(_subscribers(now).where(Citizen.push_nearby.is_(True)))
    _queue(db, [device for device, citizen in devices if _in_range(citizen, alert)], f"alert:{alert.id}", now)


def _deliverable(db, citizen, event_key):
    if not event_key.startswith("alert:"):
        return citizen.push_reports
    if not citizen.push_nearby:
        return False
    alert_id = int(event_key.removeprefix("alert:"))
    alert = db.scalar(select(Alert).join(Incident, Alert.incident_id == Incident.id).where(
        Alert.id == alert_id, Alert.status.in_(ACTIVE_ALERT_STATES), Alert.is_simulated.is_(False),
        Incident.verified.is_(True), Incident.is_public.is_(True),
    ))
    return bool(alert and valid_coordinates(alert.public_lat, alert.public_lon) and _in_range(citizen, alert))


def _message(device, delivery, now):
    event_key = delivery.event_key
    nearby = event_key.startswith("alert:")
    title = "Nearby wildlife alert" if nearby else "Report update"
    body = "Open the risk map for the latest warning." if nearby else "Open Forest Guard AI for the update."
    return {"to": device.token, "title": title, "body": body, "channelId": "forest-guard-alerts",
            "ttl": min(3600, max(0, int((delivery.expires_at - now).total_seconds()))),
            "collapseId": delivery.notification_id, "tag": delivery.notification_id,
            "data": {"id": delivery.notification_id, "kind": "map" if nearby else "report"}}


def _retry(delivery, now):
    delivery.attempts += 1
    retry_at = now + timedelta(seconds=min(3600, 30 * 2 ** (delivery.attempts - 1)))
    delivery.next_at = retry_at if delivery.attempts < 8 and retry_at < delivery.expires_at else None


def _process(db, client, delivery, device, session, citizen, now):
    if session.expires_at <= now or (not delivery.ticket and not _deliverable(db, citizen, delivery.event_key)):
        delivery.next_at = None
        return
    try:
        if delivery.ticket:
            response = client.post(f"{BASE_URL}/getReceipts", json={"ids": [delivery.ticket]})
            response.raise_for_status()
            result = response.json()["data"].get(delivery.ticket)
            if not result:
                _retry(delivery, now)
                return
        else:
            response = client.post(f"{BASE_URL}/send", json=_message(device, delivery, now))
            response.raise_for_status()
            result = response.json()["data"]
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429 or error.response.status_code >= 500:
            _retry(delivery, now)
        else:
            logger.warning("Expo rejected a push request with HTTP %s", error.response.status_code)
            delivery.next_at = None
        return
    except (httpx.RequestError, KeyError, ValueError, TypeError, AttributeError):
        _retry(delivery, now)
        return

    if not isinstance(result, dict):
        _retry(delivery, now)
        return
    if result.get("status") == "ok":
        if delivery.ticket:
            delivery.next_at = None
        elif isinstance(result.get("id"), str):
            delivery.ticket = result["id"]
            delivery.attempts = 0
            delivery.next_at = now + timedelta(minutes=15)
        else:
            _retry(delivery, now)
        return

    details = result.get("details") or {}
    reason = details.get("error") if isinstance(details, dict) else None
    if reason == "DeviceNotRegistered":
        db.delete(device)
    elif reason == "MessageRateExceeded" or result.get("status") != "error":
        delivery.ticket = None
        _retry(delivery, now)
    else:
        logger.warning("Expo could not deliver a citizen push notification")
        delivery.next_at = None


def process_next(db: Session, client) -> bool:
    now = utcnow()
    if db.get_bind().dialect.name == "sqlite":
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    result = db.execute(select(Delivery, Device, CitizenSession, Citizen)
                        .join(Device, Device.id == Delivery.device_id)
                        .join(CitizenSession, CitizenSession.token_hash == Device.session_hash)
                        .join(Citizen, Citizen.id == CitizenSession.citizen_id)
                        .where(Delivery.next_at <= now, Delivery.expires_at > now)
                        .order_by(Delivery.next_at).limit(1)
                        .with_for_update(of=Device, skip_locked=True, key_share=True)).first()
    if result is None:
        return False
    _process(db, client, *result, now)
    return True


def run_worker(stop: Event):
    headers = {"Authorization": f"Bearer {config.EXPO_PUSH_ACCESS_TOKEN}"} if config.EXPO_PUSH_ACCESS_TOKEN else {}
    cleanup_at = utcnow()
    with httpx.Client(timeout=8, headers=headers) as client:
        while not stop.is_set():
            try:
                now = utcnow()
                if now >= cleanup_at:
                    with SessionLocal.begin() as db:
                        db.execute(delete(Delivery).where(Delivery.expires_at < now - timedelta(days=7)))
                        db.execute(delete(Device).where(Device.session_hash.in_(
                            select(CitizenSession.token_hash).where(CitizenSession.expires_at <= now))))
                    cleanup_at = now + timedelta(hours=1)
                with SessionLocal.begin() as db:
                    active = process_next(db, client)
                if not active:
                    stop.wait(3)
            except Exception:
                logger.exception("Citizen push processing failed")
                stop.wait(5)

