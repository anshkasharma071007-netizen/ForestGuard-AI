from __future__ import annotations

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

AI_MODE = os.getenv("AI_MODE", "auto").strip().lower()
YOLO_WORLD_WEIGHTS = os.getenv("YOLO_WORLD_WEIGHTS", "yolov8s-worldv2.pt")
CLIP_MODEL = os.getenv("CLIP_MODEL", "ViT-B/32")
AI_CONFIDENCE_THRESHOLD = float(os.getenv("AI_CONFIDENCE_THRESHOLD", "0.55"))
DETECTION_CONFIDENCE = 0.15
MIN_BOX_FRACTION = 0.008
CLIP_SPECIES_FLOOR = 0.45
FULL_FRAME_CLASSIFY_THRESHOLD = 0.62

UPLOAD_DIR = os.path.join(ROOT, "backend", "uploads")
ANNOTATED_DIR = os.path.join(UPLOAD_DIR, "annotated")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
