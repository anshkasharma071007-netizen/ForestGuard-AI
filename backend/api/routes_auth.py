from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import create_token, get_current_user, verify_password
from backend.database.session import get_db
from backend.models import Guard, User
from backend.schemas.api import LoginRequest
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
        "guard": serialize_guard(guard) if guard else None,
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return {
        "token": create_token(user),
        "token_type": "bearer",
        "user": _user_payload(user, db),
        "demo_mode": config.DEMO_MODE,
    }


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return {"user": _user_payload(user, db)}
