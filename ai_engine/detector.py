"""Two-stage wildlife inference.

Stage 1 — YOLO-World v2 (open vocabulary) proposes "animal" boxes.
Stage 2 — CLIP ViT-B/32 assigns a species label to each crop using text
prompts for the supported regional species.

This is deliberately conservative: low-confidence crops are labelled
"unidentified" instead of being forced into a species. The engine never
claims continuous tracking or species certainty.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from typing import Any

from PIL import Image

from geospatial.species import NEGATIVE_PROMPTS, SPECIES_ORDER, SPECIES_PROMPTS, species_meta

from . import config
from .annotate import draw_detections

_LOCK = threading.Lock()
_ENGINE: "WildlifeEngine | None" = None


class AIUnavailableError(RuntimeError):
    pass


class WildlifeEngine:
    def __init__(self) -> None:
        try:
            import torch
            import clip
            from ultralytics import YOLOWorld
        except Exception as exc:  # pragma: no cover - depends on optional heavy deps
            raise AIUnavailableError(
                "AI dependencies are not installed. Install torch, ultralytics and clip, "
                "or set AI_MODE=demo for a demo-only deployment."
            ) from exc

        self.torch = torch
        self.clip = clip
        torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))

        weights = config.YOLO_WORLD_WEIGHTS
        if not os.path.isabs(weights):
            weights = os.path.join(config.ROOT, weights)
        started = time.time()
        self.detector = YOLOWorld(weights)
        self.detector.set_classes(["animal"])
        self.clip_model, self.clip_preprocess = clip.load(config.CLIP_MODEL, device="cpu")
        self.clip_model.eval()

        self.species = list(SPECIES_ORDER)
        texts: list[str] = []
        self.species_prompt_counts: list[int] = []
        for key in self.species:
            prompts = list(SPECIES_PROMPTS.get(key, []))
            self.species_prompt_counts.append(len(prompts))
            texts.extend(prompts)
        self.negative_start = len(texts)
        texts.extend(NEGATIVE_PROMPTS)

        with torch.no_grad():
            tokens = clip.tokenize(texts)
            features = self.clip_model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        self.text_features = features
        self.load_seconds = round(time.time() - started, 2)
        self.device = "cpu"

    # ------------------------------------------------------------------ CLIP
    def _classify(self, image: Image.Image) -> tuple[str, float, dict[str, float]]:
        torch = self.torch
        with torch.no_grad():
            tensor = self.clip_preprocess(image.convert("RGB")).unsqueeze(0)
            image_features = self.clip_model.encode_image(tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            similarities = (100.0 * image_features @ self.text_features.T)[0]
            probs = similarities.softmax(dim=-1)

        species_scores: dict[str, float] = {}
        cursor = 0
        for key, count in zip(self.species, self.species_prompt_counts):
            if count:
                species_scores[key] = float(probs[cursor : cursor + count].mean())
            cursor += count
        negative_mass = float(probs[self.negative_start :].sum())
        species_mass = sum(species_scores.values())
        if species_mass <= 1e-8:
            return "unidentified", 0.0, {}
        normalized = {key: value / species_mass for key, value in species_scores.items()}
        best_key = max(normalized, key=normalized.get)
        # If the scene-level negative prompts dominate, do not force a species.
        if negative_mass > species_mass * 0.85:
            return "unidentified", round(normalized[best_key] * 0.4, 3), normalized
        return best_key, normalized[best_key], normalized

    # ------------------------------------------------------------ detection
    @staticmethod
    def _iou(a: list[float], b: list[float]) -> float:
        x1, y1 = max(a[0], b[0]), max(a[1], b[1])
        x2, y2 = min(a[2], b[2]), min(a[3], b[3])
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        if inter <= 0:
            return 0.0
        area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
        area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
        return inter / max(1e-9, area_a + area_b - inter)

    def _detect_boxes(self, path: str) -> list[dict]:
        result = self.detector.predict(
            source=path, conf=config.DETECTION_CONFIDENCE, imgsz=640, verbose=False, max_det=12
        )[0]
        image = Image.open(path)
        width, height = image.size
        min_area = width * height * config.MIN_BOX_FRACTION
        boxes = []
        for box in result.boxes:
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            area = max(0.0, xyxy[2] - xyxy[0]) * max(0.0, xyxy[3] - xyxy[1])
            if area < min_area:
                continue
            boxes.append(
                {
                    "bbox": [round(v, 1) for v in xyxy],
                    "detector_confidence": round(float(box.conf), 4),
                    "area": area,
                }
            )
        boxes.sort(key=lambda item: item["detector_confidence"], reverse=True)
        merged: list[dict] = []
        for box in boxes:
            if any(self._iou(box["bbox"], kept["bbox"]) > 0.55 for kept in merged):
                continue
            merged.append(box)
            if len(merged) >= 6:
                break
        return merged

    def _analyze_one(self, image: Image.Image, box: dict) -> dict:
        x1, y1, x2, y2 = box["bbox"]
        pad_x = (x2 - x1) * 0.06
        pad_y = (y2 - y1) * 0.06
        crop = image.crop(
            (
                max(0, int(x1 - pad_x)),
                max(0, int(y1 - pad_y)),
                min(image.width, int(x2 + pad_x)),
                min(image.height, int(y2 + pad_y)),
            )
        )
        species, species_conf, scores = self._classify(crop)
        identified = (
            species != "unidentified"
            and species_conf >= config.CLIP_SPECIES_FLOOR
            and 0.55 * species_conf + 0.45 * box["detector_confidence"] >= 0.5
        )
        if not identified:
            # Keep a box only when the detector is confident but the classifier is not.
            if box["detector_confidence"] < 0.5:
                return {}
            species = "unidentified"
            confidence = round(box["detector_confidence"] * 0.65, 3)
        else:
            confidence = round(
                0.55 * species_conf + 0.45 * box["detector_confidence"], 3
            )
        return {
            "species": species,
            "confidence": confidence,
            "species_confidence": round(species_conf, 3),
            "detector_confidence": box["detector_confidence"],
            "bbox": [round(v, 1) for v in box["bbox"]],
            "is_full_frame": False,
            "is_species_confident": identified,
            "scores": {k: round(v, 3) for k, v in sorted(scores.items(), key=lambda kv: -kv[1])[:3]},
        }

    def analyze_image(
        self,
        path: str,
        *,
        save_annotated: bool = True,
        output_dir: str | None = None,
        footer: str | None = None,
    ) -> dict:
        started = time.time()
        with _LOCK:
            image = Image.open(path).convert("RGB")
            boxes = self._detect_boxes(path)
            detections = []
            for box in boxes:
                item = self._analyze_one(image, box)
                if item:
                    detections.append(item)

            # Fallback: if localisation found nothing, classify the full frame.
            # This is flagged in the UI as classification-only.
            if not detections:
                species, species_conf, scores = self._classify(image)
                if (
                    species != "unidentified"
                    and species_conf >= config.FULL_FRAME_CLASSIFY_THRESHOLD
                ):
                    detections.append(
                        {
                            "species": species,
                            "confidence": round(species_conf * 0.9, 3),
                            "species_confidence": round(species_conf, 3),
                            "detector_confidence": None,
                            "bbox": [0.0, 0.0, float(image.width), float(image.height)],
                            "is_full_frame": True,
                            "is_species_confident": True,
                            "scores": {
                                k: round(v, 3)
                                for k, v in sorted(scores.items(), key=lambda kv: -kv[1])[:3]
                            },
                        }
                    )

            detections.sort(key=lambda item: item["confidence"], reverse=True)
            annotated_path = None
            if detections and save_annotated:
                out_dir = output_dir or config.ANNOTATED_DIR
                os.makedirs(out_dir, exist_ok=True)
                annotated_path = os.path.join(out_dir, f"{uuid.uuid4().hex}.jpg")
                draw_detections(path, detections, annotated_path, footer=footer or "FOREST GUARD AI · AI-assisted analysis")

        meta = species_meta(detections[0]["species"]) if detections else None
        return {
            "detections": detections,
            "annotated_path": annotated_path,
            "primary_species": meta["name"] if meta else None,
            "engine": self.info(),
            "elapsed_seconds": round(time.time() - started, 2),
            "warnings": [] if detections else [
                "No animal was detected above the confidence threshold. The image is stored but not added as a detection."
            ],
        }

    def analyze_video(self, path: str, *, max_frames: int = 5) -> dict:
        """Sample frames across a video; explicitly not continuous tracking."""
        import cv2

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise ValueError("The uploaded video could not be opened.")
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        if frame_count <= 0:
            frame_count = max_frames
        indices = sorted(
            {max(0, min(frame_count - 1, int(frame_count * i / max_frames))) for i in range(max_frames)}
        )
        frame_dir = os.path.join(config.UPLOAD_DIR, "frames", uuid.uuid4().hex)
        os.makedirs(frame_dir, exist_ok=True)

        collected: dict[str, dict] = {}
        frame_rows = []
        annotated = None
        started = time.time()
        try:
            for frame_index in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = cap.read()
                if not ok:
                    continue
                frame_path = os.path.join(frame_dir, f"frame_{frame_index}.jpg")
                cv2.imwrite(frame_path, frame)
                result = self.analyze_image(
                    frame_path,
                    footer=f"FOREST GUARD AI · video frame {frame_index} · sampled, not continuous tracking",
                )
                timestamp = round(frame_index / fps, 1)
                frame_rows.append(
                    {
                        "frame": frame_index,
                        "seconds": timestamp,
                        "detections": len(result["detections"]),
                    }
                )
                if result["annotated_path"] and annotated is None:
                    annotated = result["annotated_path"]
                for det in result["detections"]:
                    det["frame_index"] = frame_index
                    det["video_seconds"] = timestamp
                    key = det["species"]
                    if key not in collected or det["confidence"] > collected[key]["confidence"]:
                        collected[key] = det
        finally:
            cap.release()
            for name in os.listdir(frame_dir):
                try:
                    os.remove(os.path.join(frame_dir, name))
                except OSError:
                    pass
            try:
                os.rmdir(frame_dir)
            except OSError:
                pass

        detections = list(collected.values())
        return {
            "detections": detections,
            "annotated_path": annotated,
            "primary_species": species_meta(detections[0]["species"])["name"] if detections else None,
            "engine": self.info(),
            "elapsed_seconds": round(time.time() - started, 2),
            "frame_samples": frame_rows,
            "warnings": [
                "Video analysis samples frames at intervals; it does not provide continuous animal tracking."
            ],
        }

    def info(self) -> dict:
        return {
            "mode": "auto",
            "loaded": True,
            "device": self.device,
            "detector": "YOLO-World v2 (open-vocabulary animal localisation)",
            "classifier": f"CLIP {config.CLIP_MODEL} zero-shot species classifier",
            "supported_species": [
                {
                    "key": key,
                    "name": species_meta(key)["name"],
                    "scientific": species_meta(key)["scientific"],
                    "risk_weight": species_meta(key)["risk_weight"],
                }
                for key in self.species
            ],
            "confidence_note": (
                "Species confidence is CLIP zero-shot probability. Low-confidence crops are "
                "labelled 'unidentified' rather than forced into a species."
            ),
            "loaded_in_seconds": self.load_seconds,
        }


def get_engine() -> WildlifeEngine:
    global _ENGINE
    if config.AI_MODE == "demo":
        raise AIUnavailableError(
            "AI_MODE=demo. Detection is disabled; seeded demonstration records remain available."
        )
    if _ENGINE is None:
        with _LOCK:
            if _ENGINE is None:
                _ENGINE = WildlifeEngine()
    return _ENGINE


def engine_status() -> dict:
    if config.AI_MODE == "demo":
        return {
            "mode": "demo",
            "loaded": False,
            "message": "AI_MODE=demo. The dashboard uses pre-generated, clearly labelled demonstration records.",
        }
    try:
        return get_engine().info()
    except AIUnavailableError as exc:
        return {"mode": "demo", "loaded": False, "message": str(exc)}
    except Exception as exc:  # model weights unavailable, etc.
        return {"mode": "error", "loaded": False, "message": f"AI engine could not start: {exc}"}


def analyze_media(path: str, media_type: str) -> dict:
    engine = get_engine()
    if media_type == "video":
        return engine.analyze_video(path)
    return engine.analyze_image(path)
