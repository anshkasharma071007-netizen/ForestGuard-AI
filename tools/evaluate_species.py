"""Run the local YOLO-World + CLIP pipeline over a small labelled image folder.

This is a smoke evaluation, not a benchmark. Filenames must start with the
expected species key (tiger, leopard, elephant, deer, wild_boar, sloth_bear)
or a short alias such as bear.jpg / boar.jpg.

Usage:
    python tools/evaluate_species.py --images demo_data/wildlife_images \
        --output docs/references/ai_smoke_evaluation.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ai_engine.detector import engine_status, get_engine  # noqa: E402

ALIASES = {
    "bear": "sloth_bear",
    "boar": "wild_boar",
    "elephant": "elephant",
    "tiger": "tiger",
    "leopard": "leopard",
    "deer": "deer",
}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def expected_species(filename: str) -> str | None:
    stem = os.path.splitext(os.path.basename(filename))[0].lower()
    for key in sorted(ALIASES, key=len, reverse=True):
        if stem == key or stem.startswith(f"{key}_") or stem.startswith(f"{key}-"):
            return ALIASES[key]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", required=True)
    parser.add_argument("--output", default="docs/references/ai_smoke_evaluation.json")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    files = sorted(
        os.path.join(args.images, name)
        for name in os.listdir(args.images)
        if os.path.splitext(name)[1].lower() in IMAGE_SUFFIXES
    )
    labelled = [(path, expected_species(path)) for path in files]
    labelled = [(path, expected) for path, expected in labelled if expected]
    if args.limit:
        labelled = labelled[: args.limit]
    if not labelled:
        raise SystemExit("No labelled images found. Use <species>_name.jpg filenames.")

    print("engine:", engine_status())
    engine = get_engine()

    rows = []
    correct = 0
    started = time.time()
    for path, expected in labelled:
        with Image.open(path) as image:
            width, height = image.size
        result = engine.analyze_image(path, save_annotated=False)
        detections = result.get("detections") or []
        best = max(detections, key=lambda item: item.get("confidence", 0), default=None)
        primary = best.get("species") if best else "unidentified"
        primary_name = result.get("primary_species")
        confidence = best.get("confidence", 0.0) if best else 0.0
        hit = primary == expected
        correct += int(hit)
        rows.append(
            {
                "file": os.path.basename(path),
                "expected": expected,
                "predicted": primary,
                "predicted_name": primary_name,
                "confidence": round(confidence, 3),
                "correct": hit,
                "detections": [
                    {
                        "species": item.get("species"),
                        "confidence": item.get("confidence"),
                        "species_confidence": item.get("species_confidence"),
                        "detector_confidence": item.get("detector_confidence"),
                        "is_full_frame": item.get("is_full_frame"),
                    }
                    for item in detections
                ],
                "image_size": [width, height],
                "warnings": result.get("warnings", []),
            }
        )
        print(f"{os.path.basename(path):16s} expected={expected:11s} predicted={primary}")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "engine": engine_status(),
        "image_source": "Wikimedia Commons, CC BY-SA licensed reference photographs shipped in demo_data/wildlife_images",
        "method": "YOLO-World 'animal' localisation + CLIP zero-shot species classification, CPU, single image per class",
        "sample_size": len(rows),
        "top1_correct": correct,
        "top1_accuracy": round(correct / len(rows), 3),
        "elapsed_seconds": round(time.time() - started, 1),
        "images": rows,
        "caveat": (
            "This six-image smoke check uses promotional reference photographs, one per species. "
            "It is NOT a validation of field accuracy, does not cover camera-trap conditions, "
            "occlusion, night IR imagery or population-level variation, and must not be cited "
            "as model performance. A proper evaluation requires a licensed, labelled open dataset "
            "(e.g. a LILA BC camera-trap collection) and species-level train/test splits."
        ),
    }
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(
        f"\n{correct}/{len(rows)} top-1 ({payload['top1_accuracy']:.0%}) in "
        f"{payload['elapsed_seconds']}s -> {args.output}"
    )
    print(payload["caveat"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
