from __future__ import annotations

import os
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

from geospatial.species import species_meta

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]
SMALL_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def _font(size: int, bold: bool = True) -> ImageFont.ImageFont:
    for path in FONT_CANDIDATES if bold else SMALL_FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_detections(
    image_path: str,
    detections: Iterable[dict],
    output_path: str,
    *,
    footer: str = "FOREST GUARD AI · AI-assisted analysis · demo annotation",
) -> str:
    """Draw labelled boxes and a transparency banner, then save a JPEG."""
    image = Image.open(image_path).convert("RGB")
    # Keep evidence legible without huge files.
    max_width = 1600
    if image.width > max_width:
        image = image.resize((max_width, round(image.height * max_width / image.width)), Image.LANCZOS)
    original_w, original_h = Image.open(image_path).size
    scale = image.width / original_w
    draw = ImageDraw.Draw(image, "RGBA")

    box_font = _font(max(16, image.width // 55))
    label_font = _font(max(13, image.width // 74))
    small_font = _font(max(11, image.width // 95), bold=False)

    for det in detections:
        bbox = det.get("bbox") or []
        if len(bbox) != 4:
            continue
        x1, y1, x2, y2 = [float(v) * scale for v in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2 = min(image.width - 1, x2)
        y2 = min(image.height - 1, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        meta = species_meta(det.get("species", "unidentified"))
        color = det.get("color") or meta["color"]
        width = max(3, image.width // 380)
        # Soft outer glow + crisp inner line for readability on busy photos.
        draw.rectangle([x1 - 2, y1 - 2, x2 + 2, y2 + 2], outline=(0, 0, 0, 90), width=width + 3)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=width)

        label = f"{meta['name']}  {det.get('confidence', 0):.0%}"
        if det.get("is_full_frame"):
            label += " · classification-only"
        text_box = draw.textbbox((0, 0), label, font=label_font)
        tw, th = text_box[2] - text_box[0], text_box[3] - text_box[1]
        plate_h = th + 12
        plate_w = tw + 18
        plate_y = max(0, y1 - plate_h)
        draw.rounded_rectangle(
            [x1, plate_y, x1 + plate_w, plate_y + plate_h], radius=4, fill=(12, 43, 33, 230)
        )
        draw.text((x1 + 9, plate_y + 5), label, font=label_font, fill=(255, 255, 255))

    # Transparency banner (kept small so the evidence stays visible).
    banner_h = max(34, image.height // 26)
    draw.rectangle([0, image.height - banner_h, image.width, image.height], fill=(8, 31, 24, 205))
    draw.text((16, image.height - banner_h + banner_h // 6), footer, font=small_font, fill=(226, 240, 229))
    engine = "YOLO-World + CLIP · not a confirmed field observation"
    tw = draw.textlength(engine, font=small_font)
    draw.text((image.width - tw - 16, image.height - banner_h + banner_h // 6), engine, font=small_font, fill=(167, 196, 176))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    image.save(output_path, "JPEG", quality=88, optimize=True, progressive=True)
    return output_path
