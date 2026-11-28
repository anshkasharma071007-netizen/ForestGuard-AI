from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import create_token, get_current_user, verify_password
from backend.database.session import get_db
from backend.models import Guard, User
from backend.schemas.api import LoginRequest
from backend.services.authority_demo import GREATER_NOIDA_EMAIL, demo_role_for_credentials, greater_noida_officer
from backend.services.geography import jurisdiction_label, user_jurisdictions
from backend.services.serializers import serialize_guard

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_payload(user: User, db: Session) -> dict:
    guard = db.scalar(select(Guard).where(Guard.user_id == user.id))
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "badge_id": user.badge_id,
        "jurisdictions": [jurisdiction_label(item) for item in user_jurisdictions(db, user)],
        "guard": serialize_guard(guard) if guard else None,
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.strip().lower()
    demo_role = demo_role_for_credentials(email, payload.password)
    if ((demo_role and not config.authority_demo_accounts_allowed())
            or (email == GREATER_NOIDA_EMAIL and config.APP_ENV != "development")):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    user = db.scalar(select(User).where(User.email == email))
    if (not user or (demo_role and user.role != demo_role)
            or not verify_password(payload.password, user.password_hash)):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return _login_response(user, db, authority_demo=demo_role is not None)


def _login_response(user, db, *, authority_demo):
    return {
        "token": create_token(user, authority_demo=authority_demo),
        "token_type": "bearer",
        "user": _user_payload(user, db),
        "demo_mode": config.DEMO_MODE,
    }


@router.get("/demo-accounts", include_in_schema=False)
def demo_accounts(response: Response, db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "private, no-store"
    accounts = {"range_officer": {"name": "Range Officer"}} if greater_noida_officer(db) else {}
    return {"enabled": config.authority_demo_accounts_allowed(), "accounts": accounts}


@router.post("/demo-login", include_in_schema=False)
def demo_login(response: Response, db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "private, no-store"
    officer = greater_noida_officer(db)
    if officer is None:
        raise HTTPException(404, "The Greater Noida demo is unavailable.")
    return _login_response(officer, db, authority_demo=True)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return {"user": _user_payload(user, db)}
