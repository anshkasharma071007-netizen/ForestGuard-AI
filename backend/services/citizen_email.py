"""Database-backed email verification. OTPs are never stored or logged in plaintext."""

import hashlib
import hmac
import secrets
from datetime import timedelta

import httpx
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from backend import config
from backend.models.entities import Citizen, CitizenOtp, CitizenOtpLimit, utcnow

EXPIRY = timedelta(minutes=5)
COOLDOWN = 60
MAX_ATTEMPTS = 5


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def _digest(purpose: str, value: str) -> str:
    return hmac.new(config.CITIZEN_OTP_SECRET.encode(), f"{purpose}:{value}".encode(),
                    hashlib.sha256).hexdigest()


def _check_secret():
    if len(config.CITIZEN_OTP_SECRET) < 32:
        raise HTTPException(503, "Email verification is unavailable. Try again later.")


def _insert(db):
    return sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert


def _rate_row(db, purpose, value, now):
    key = _digest(purpose, value)
    db.execute(_insert(db)(CitizenOtpLimit).values(key=key, window_start=now, count=0).on_conflict_do_nothing())
    return db.scalar(select(CitizenOtpLimit).where(CitizenOtpLimit.key == key).with_for_update())


def _limit(row, maximum, now):
    end = row.window_start + timedelta(hours=1)
    if now >= end:
        row.window_start, row.count = now, 0
    if row.count >= maximum:
        return max(1, int((end - now).total_seconds()) + 1)
    row.count += 1
    return 0


def _throttled(db, seconds):
    db.commit()
    raise HTTPException(429, f"Too many requests. Try again in {seconds} seconds.",
                        headers={"Retry-After": str(seconds)})


def send_brevo(email: str, code: str) -> str:
    try:
        response = httpx.post("https://api.brevo.com/v3/smtp/email", timeout=8,
                             headers={"api-key": config.BREVO_API_KEY},
                             json={"sender": {"email": config.BREVO_SENDER_EMAIL, "name": config.BREVO_SENDER_NAME},
                                   "to": [{"email": email}], "subject": "Your Van Saathi sign-in code",
                                   "textContent": f"Your Van Saathi verification code is {code}. "
                                                  "It expires in five minutes. If you did not request it, ignore this email."})
        response.raise_for_status()
        message_id = response.json()["messageId"]
        if not isinstance(message_id, str) or not message_id:
            raise ValueError("Invalid message ID")
        return message_id
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        raise HTTPException(502, "We could not send the email. Try sending a new code shortly.",
                            headers={"Retry-After": str(COOLDOWN)}) from None


def request_code(db, email, ip):
    _check_secret()
    if not config.BREVO_API_KEY or not config.BREVO_SENDER_EMAIL:
        raise HTTPException(503, "Email verification is unavailable. Try again later.")
    now = utcnow()
    email_key = _digest("email", email)
    if secrets.randbelow(128) == 0:
        cutoff = now - timedelta(days=1)
        db.execute(delete(CitizenOtp).where(CitizenOtp.expires_at < cutoff))
        db.execute(delete(CitizenOtpLimit).where(CitizenOtpLimit.window_start < cutoff))
    if wait := _limit(_rate_row(db, "send-ip", ip, now), 20, now):
        _throttled(db, wait)
    # The email limit serializes simultaneous first requests for the same address.
    rate = _rate_row(db, "send-email", email, now)
    row = db.scalar(select(CitizenOtp).where(CitizenOtp.email_key == email_key).with_for_update())
    if row is not None:
        until = row.expires_at - EXPIRY + timedelta(seconds=COOLDOWN)
        if now < until:
            _throttled(db, int((until - now).total_seconds()) + 1)
    if wait := _limit(rate, 5, now):
        _throttled(db, wait)

    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = secrets.token_hex(16)
    if row is None:
        row = CitizenOtp(email_key=email_key)
        db.add(row)
    row.challenge, row.expires_at, row.attempts, row.delivered = challenge, now + EXPIRY, 0, False
    row.digest = _digest("code", f"{email_key}:{challenge}:{code}")
    db.commit()
    send_brevo(email, code)
    db.execute(update(CitizenOtp).where(CitizenOtp.email_key == email_key, CitizenOtp.challenge == challenge)
               .values(delivered=True))
    db.commit()
    return {"retry_after": COOLDOWN, "expires_in": int(EXPIRY.total_seconds())}


def verify_code(db, email, code, ip):
    _check_secret()
    now = utcnow()
    if wait := _limit(_rate_row(db, "verify-ip", ip, now), 60, now):
        _throttled(db, wait)
    email_key = _digest("email", email)
    row = db.scalar(select(CitizenOtp).where(CitizenOtp.email_key == email_key).with_for_update())
    if row is None or row.expires_at <= now or not row.delivered:
        db.commit()
        raise HTTPException(410, "This code expired or was not delivered. Request a new code.")
    if row.attempts >= MAX_ATTEMPTS:
        db.commit()
        raise HTTPException(429, "Too many incorrect attempts. Request a new code.")
    if row.digest is None:
        db.commit()
        raise HTTPException(410, "This code was already used. Request a new code.")
    row.attempts += 1
    if not hmac.compare_digest(row.digest, _digest("code", f"{email_key}:{row.challenge}:{code}")):
        db.commit()
        raise HTTPException(401, "Incorrect verification code.")
    row.digest = None
    db.execute(_insert(db)(Citizen).values(login_email=email, email_verified_at=now, name="")
               .on_conflict_do_nothing(index_elements=[Citizen.login_email]))
    citizen = db.scalar(select(Citizen).where(Citizen.login_email == email).with_for_update())
    if citizen.email_verified_at is None:
        citizen.email_verified_at = now
    return citizen
