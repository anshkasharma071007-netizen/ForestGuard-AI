from __future__ import annotations

import os
import re
import secrets
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_MODE = os.getenv("FOREST_GUARD_DB_MODE", "local").strip().lower()
if DB_MODE not in {"local", "cloud"}:
    raise RuntimeError("Set FOREST_GUARD_DB_MODE to local or cloud before starting the backend.")

_env_file = os.getenv("FOREST_GUARD_ENV_FILE")
_profile = Path(_env_file) if _env_file else Path(ROOT) / (".env.cloud" if DB_MODE == "cloud" else ".env")
if _env_file and not _profile.is_file():
    raise RuntimeError(f"The selected {DB_MODE} environment file does not exist: {_profile}")
load_dotenv(_profile, interpolate=DB_MODE == "local")


def cloud_database_url() -> URL:
    host = os.getenv("CLOUD_DATABASE_HOST", "").strip()
    user = os.getenv("CLOUD_DATABASE_USER", "").strip()
    password = os.getenv("CLOUD_DATABASE_PASSWORD")
    certificate = os.getenv("CLOUD_DATABASE_SSL_ROOT_CERT", "").strip()
    if not re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host):
        raise RuntimeError("Set CLOUD_DATABASE_HOST to the Supabase session pooler hostname.")
    if not re.fullmatch(r"forest_guard_app\.[a-z0-9]{20}", user):
        raise RuntimeError("Set CLOUD_DATABASE_USER to forest_guard_app.<project-ref>.")
    if not password:
        raise RuntimeError("Set CLOUD_DATABASE_PASSWORD using the private cloud environment.")
    if not certificate or not Path(certificate).is_file():
        raise RuntimeError("Set CLOUD_DATABASE_SSL_ROOT_CERT to the downloaded Supabase CA certificate.")
    if any(os.getenv(key) for key in ("PGSERVICE", "PGHOSTADDR", "PGOPTIONS")):
        raise RuntimeError("Unset PGSERVICE, PGHOSTADDR and PGOPTIONS before using cloud mode.")
    return URL.create(
        "postgresql+psycopg", username=user, password=password, host=host, port=5432, database="postgres",
        query={"sslmode": "verify-full", "sslrootcert": str(Path(certificate).resolve()),
               "gssencmode": "disable", "keepalives_idle": "30", "keepalives_interval": "10",
               "keepalives_count": "3"},
    )

DEMO_MODE = os.getenv("DEMO_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}
APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
DEMO_VILLAGES_ENABLED = os.getenv("DEMO_VILLAGES_ENABLED", "false").strip().lower() == "true"
CITIZEN_DEV_OTP_ENABLED = os.getenv("CITIZEN_DEV_OTP_ENABLED", "false").strip().lower() == "true"
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "").strip()
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "Forest Guard AI").strip()
CITIZEN_OTP_SECRET = os.getenv("CITIZEN_OTP_SECRET", "").strip()
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "").strip()
EXPO_PUSH_ENABLED = os.getenv("EXPO_PUSH_ENABLED", "").strip().lower() == "true"
EXPO_PUSH_ACCESS_TOKEN = os.getenv("EXPO_PUSH_ACCESS_TOKEN", "").strip()
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

DATABASE_URL = cloud_database_url() if DB_MODE == "cloud" else os.getenv(
    "DATABASE_URL", "postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_ai"
)
_demo_jurisdictions = os.getenv("DEMO_JURISDICTIONS_ENABLED", "false").strip().lower() == "true"


def demo_jurisdictions_allowed() -> bool:
    if not (DB_MODE == "local" and APP_ENV == "development" and DEMO_MODE and _demo_jurisdictions):
        return False
    from sqlalchemy.engine import make_url

    database = make_url(DATABASE_URL).database or ""
    return bool(re.search(r"(^|[_-])test($|[_.-])", Path(database).name))


LOCAL_DATABASE_ROLE = os.getenv("LOCAL_DATABASE_ROLE", "forest_guard_app")

_upload_path = ".forest-guard-local/cloud-uploads" if DB_MODE == "cloud" else "backend/uploads"
UPLOAD_DIR = os.getenv("UPLOAD_DIR") or str(Path(ROOT) / _upload_path)
DEMO_IMAGE_DIR = os.path.join(ROOT, "demo_data", "detection_images")
DEMO_WILDLIFE_DIR = os.path.join(ROOT, "demo_data", "wildlife_images")
DETECTION_ASSETS = os.path.join(ROOT, "demo_data", "detection_assets.json")
STUDY_AREA_PATH = os.path.join(ROOT, "geospatial", "geojson", "study_area.geojson")
RISK_CONFIG_PATH = os.getenv("RISK_CONFIG_PATH", os.path.join(ROOT, "demo_data", "risk_config.json"))

MEDIA_STORAGE = os.getenv("MEDIA_STORAGE", "local").strip().lower()
SUPABASE_STORAGE_URL = os.getenv("SUPABASE_STORAGE_URL", "").strip().rstrip("/")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "forest-guard-evidence").strip()
SUPABASE_STORAGE_KEY = os.getenv("SUPABASE_STORAGE_KEY", "").strip()

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
