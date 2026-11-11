from __future__ import annotations

import os

from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

DEMO_MODE = os.getenv("DEMO_MODE", "true").strip().lower() in {"1", "true", "yes", "on"}
SECRET_KEY = os.getenv("SECRET_KEY", "forest-guard-ai-demo-secret-change-me")

_default_db = os.path.join(ROOT, "backend", "database", "forest_guard.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_default_db}")

UPLOAD_DIR = os.path.join(ROOT, "backend", "uploads")
DEMO_IMAGE_DIR = os.path.join(ROOT, "demo_data", "detection_images")
DEMO_WILDLIFE_DIR = os.path.join(ROOT, "demo_data", "wildlife_images")
DETECTION_ASSETS = os.path.join(ROOT, "demo_data", "detection_assets.json")
STUDY_AREA_PATH = os.path.join(ROOT, "geospatial", "geojson", "study_area.geojson")
RISK_CONFIG_PATH = os.path.join(ROOT, "demo_data", "risk_config.json")

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
