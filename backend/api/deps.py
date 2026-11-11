from __future__ import annotations

import hashlib
import hmac
import os
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from backend import config
from backend.database.session import get_db
from backend.models import User

security = HTTPBearer(auto_error=False)
_serializer = URLSafeTimedSerializer(config.SECRET_KEY, salt="forest-guard-auth")

PBKDF2_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    return _serializer.dumps({"uid": user.id, "role": user.role, "name": user.name})


def read_token(token: str) -> dict:
    try:
        return _serializer.loads(token, max_age=config.TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired as exc:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.") from exc
    except BadSignature as exc:
        raise HTTPException(status_code=401, detail="Invalid session token.") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    payload = read_token(credentials.credentials)
    user = db.get(User, payload.get("uid"))
    if not user:
        raise HTTPException(status_code=401, detail="Account not found.")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = read_token(credentials.credentials)
    except HTTPException:
        return None
    return db.get(User, payload.get("uid"))


def require_roles(*roles: str) -> Callable:
    def _dependency(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have access to this resource.",
            )
        return user

    return _dependency


require_guard = require_roles("guard", "admin")
require_admin = require_roles("admin")
