from __future__ import annotations

import hashlib
import re
import secrets
from datetime import timedelta
from typing import Annotated, Literal

import phonenumbers
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import security
from backend.database.session import get_db
from backend.models.entities import Citizen, CitizenSession, Village, utcnow

COOKIE = "forest_guard_citizen"
SESSION_SECONDS = 30 * 24 * 60 * 60
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[^\x00-\x1f\x7f]+$")]
Email = Annotated[EmailStr, Field(max_length=254)]


router = APIRouter(prefix="/api/citizen", tags=["citizen"])


class PhoneInput(BaseModel):
    phone: str = Field(max_length=40)


class Verification(PhoneInput):
    code: str = Field(max_length=12)
    name: Name | None = None
    email: Email | None = None
    transport: Literal["bearer", "cookie"] = "bearer"


class Location(BaseModel):
    village_code: str | None = Field(default=None, min_length=1, max_length=20)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)

    @model_validator(mode="after")
    def select_one_location(self):
        has_coordinates = self.lat is not None and self.lon is not None
        if (self.lat is None) != (self.lon is None) or (self.village_code is not None) == has_coordinates:
            raise ValueError("Choose a village or provide both GPS coordinates.")
        return self


class ProfileUpdate(BaseModel):
    name: Name
    email: Email | None = None
    location: Location


def _normalize_phone(value: str) -> str:
    if not re.fullmatch(r"[6-9][0-9]{9}", value):
        raise HTTPException(400, "Enter 10 digits starting with 6, 7, 8 or 9.")
    canonical = "+91" + value
    kind = phonenumbers.number_type(phonenumbers.parse(canonical))
    if kind not in {phonenumbers.PhoneNumberType.MOBILE, phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
                    phonenumbers.PhoneNumberType.UNKNOWN}:
        raise HTTPException(400, "Enter an Indian mobile number.")
    return canonical


def _profile(citizen: Citizen) -> dict:
    location = None
    if citizen.village:
        village = citizen.village
        location = {"type": "village", "village": {"code": village.code, "name": village.name, "district": village.district},
                    "lat": round(village.lat, 2), "lon": round(village.lon, 2)}
    elif citizen.lat is not None and citizen.lon is not None:
        location = {"type": "gps", "lat": citizen.lat, "lon": citizen.lon}
    return {"id": citizen.id, "phone": citizen.phone, "name": citizen.name, "email": citizen.email, "location": location}


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _dev_verification_enabled() -> bool:
    return config.APP_ENV == "development" and config.CITIZEN_DEV_OTP_ENABLED


def _trusted_origin(request: Request):
    origin = request.headers.get("Origin")
    if origin and origin not in config.CORS_ORIGINS and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Origin is not permitted for citizen sessions.")


def _session(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> CitizenSession:
    token = credentials.credentials if credentials else request.cookies.get(COOKIE)
    if not token or len(token) != 43 or not _dev_verification_enabled():
        raise HTTPException(401, "Sign in to your citizen account.")
    if not credentials and request.method not in {"GET", "HEAD", "OPTIONS"}:
        _trusted_origin(request)
    session = db.get(CitizenSession, _token_hash(token))
    if not session or session.expires_at <= utcnow():
        raise HTTPException(401, "Citizen session expired. Sign in again.")
    _check_account(request, session)
    return session


def _check_account(request: Request, session: CitizenSession):
    expected = request.headers.get("X-Citizen-Account")
    if expected is not None and expected != str(session.citizen_id):
        raise HTTPException(401, "The citizen session changed. Sign in again.")


def get_citizen(session: CitizenSession = Depends(_session)) -> Citizen:
    return session.citizen


def onboarded_citizen(citizen: Citizen = Depends(get_citizen)) -> Citizen:
    if citizen.village_id is None and (citizen.lat is None or citizen.lon is None):
        raise HTTPException(403, "Save a profile location before using reports.")
    return citizen


def _require_dev_verification():
    if not _dev_verification_enabled():
        raise HTTPException(403, "Development phone verification is disabled.")


@router.post("/validate-phone", dependencies=[Depends(_require_dev_verification)])
def validate_phone(payload: PhoneInput):
    _normalize_phone(payload.phone)
    return {"valid": True}


@router.post("/verify", dependencies=[Depends(_require_dev_verification)])
def verify(payload: Verification, request: Request, response: Response, db: Session = Depends(get_db)):
    if payload.transport == "cookie":
        _trusted_origin(request)
    phone = _normalize_phone(payload.phone)
    if not secrets.compare_digest(payload.code.encode(), b"1234"):
        raise HTTPException(401, "Incorrect verification code.")
    matches = db.scalars(select(Citizen).where(Citizen.normalized_phone == phone).limit(2)).all()
    if len(matches) > 1:
        raise HTTPException(409, "Multiple historical accounts use this number. Contact support to review them.")
    if matches:
        citizen = matches[0]
    else:
        if not payload.name:
            raise HTTPException(400, "Enter your full name to create an account.")
        insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
        db.execute(insert(Citizen).values(phone=phone, normalized_phone=phone, name=payload.name, email=payload.email)
                   .on_conflict_do_nothing(index_elements=[Citizen.phone]))
        citizen = db.scalars(select(Citizen).where(Citizen.phone == phone)).one()

    now = utcnow()
    if payload.transport == "cookie" and (previous := request.cookies.get(COOKIE)) and len(previous) == 43:
        db.execute(delete(CitizenSession).where(CitizenSession.token_hash == _token_hash(previous)))
    db.execute(delete(CitizenSession).where(CitizenSession.citizen_id == citizen.id, CitizenSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    db.add(CitizenSession(token_hash=_token_hash(token), citizen_id=citizen.id,
                          expires_at=now + timedelta(seconds=SESSION_SECONDS)))
    profile = _profile(citizen)
    db.commit()
    if payload.transport == "cookie":
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, path="/api/citizen", httponly=True,
                            secure=config.APP_ENV != "development", samesite="strict")
        return {"profile": profile}
    return {"profile": profile, "token": token}


@router.get("/profile")
def profile(citizen: Citizen = Depends(get_citizen)):
    return _profile(citizen)


@router.put("/profile")
def update_profile(payload: ProfileUpdate, citizen: Citizen = Depends(get_citizen), db: Session = Depends(get_db)):
    location = payload.location
    village = None
    if location.village_code is not None:
        village = db.scalar(select(Village).where(Village.code == location.village_code))
        if not village:
            raise HTTPException(400, "Choose a supported village.")
    citizen.name = payload.name
    citizen.email = payload.email
    citizen.village = village
    citizen.lat, citizen.lon = location.lat, location.lon
    db.commit()
    return _profile(citizen)


@router.post("/sign-out")
def sign_out(request: Request, response: Response, credentials: HTTPAuthorizationCredentials | None = Depends(security),
             db: Session = Depends(get_db)):
    if not credentials:
        _trusted_origin(request)
    token = credentials.credentials if credentials else request.cookies.get(COOKIE)
    if token and len(token) == 43:
        session = db.get(CitizenSession, _token_hash(token))
        if session:
            _check_account(request, session)
            db.execute(delete(CitizenSession).where(CitizenSession.token_hash == session.token_hash))
            db.commit()
    if not credentials:
        response.delete_cookie(COOKIE, path="/api/citizen", httponly=True,
                               secure=config.APP_ENV != "development", samesite="strict")
    return {"signed_out": True}
