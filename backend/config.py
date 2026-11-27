from __future__ import annotations

import os
import secrets

from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

DEMO_MODE = os.getenv("DEMO_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}
APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
CITIZEN_DEV_OTP_ENABLED = os.getenv("CITIZEN_DEV_OTP_ENABLED", "false").strip().lower() == "true"
AUTHORITY_DEMO_ACCOUNTS_ENABLED = os.getenv("AUTHORITY_DEMO_ACCOUNTS_ENABLED", "false").strip().lower() == "true"
CORS_ORIGINS = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,"
    "http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081",
).split(",") if origin.strip()]
_configured_secret = os.getenv("SECRET_KEY", "").strip()
SECRET_KEY = _configured_secret or secrets.token_urlsafe(32)


def authority_demo_accounts_allowed() -> bool:
    return APP_ENV == "development" and AUTHORITY_DEMO_ACCOUNTS_ENABLED


def validate_authority_secret():
    if APP_ENV != "development" and (
        len(_configured_secret) < 32
        or _configured_secret in {
            "forest-guard-ai-demo-secret-change-me",
            "change-me-to-a-long-random-string",
        }
    ):
        raise RuntimeError("Set SECRET_KEY to a securely generated random value of at least 32 characters.")

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_ai"
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(ROOT, "backend", "uploads"))
DEMO_IMAGE_DIR = os.path.join(ROOT, "demo_data", "detection_images")
DEMO_WILDLIFE_DIR = os.path.join(ROOT, "demo_data", "wildlife_images")
DETECTION_ASSETS = os.path.join(ROOT, "demo_data", "detection_assets.json")
STUDY_AREA_PATH = os.path.join(ROOT, "geospatial", "geojson", "study_area.geojson")
RISK_CONFIG_PATH = os.getenv("RISK_CONFIG_PATH", os.path.join(ROOT, "demo_data", "risk_config.json"))

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}

DEMO_ADMIN_EMAIL = os.getenv("DEMO_ADMIN_EMAIL", "admin@forestguard.ai")
DEMO_ADMIN_PASSWORD = os.getenv("DEMO_ADMIN_PASSWORD", "forest123")
DEMO_GUARD_EMAIL = os.getenv("DEMO_GUARD_EMAIL", "guard@forestguard.ai")
DEMO_GUARD_PASSWORD = os.getenv("DEMO_GUARD_PASSWORD", "guard123")

TOKEN_MAX_AGE_SECONDS = 12 * 60 * 60

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "demo"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "annotated"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "uploads"), exist_ok=True)
