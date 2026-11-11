"""Build the 10-slide Forest Guard AI pitch deck.

Run:  python deliverables/build_deck.py
"""
from __future__ import annotations

import os

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
DIAGRAMS = os.path.join(ROOT, "docs", "diagrams")
IMAGES = os.path.join(ROOT, "frontend", "public", "images")
OUT = os.path.join(ROOT, "deliverables", "Forest_Guard_AI_Pitch_Deck.pptx")

FOREST = RGBColor(0x0C, 0x24, 0x18)
FOREST_700 = RGBColor(0x19, 0x45, 0x2F)
FOREST_500 = RGBColor(0x2F, 0x72, 0x50)
LIME = RGBColor(0xC4, 0xE8, 0x7A)
SAND = RGBColor(0xF4, 0xF1, 0xE8)
PARCHMENT = RGBColor(0xFB, 0xFA, 0xF5)
INK = RGBColor(0x17, 0x21, 0x1B)
MUTED = RGBColor(0x5C, 0x66, 0x5C)
LINE = RGBColor(0xD8, 0xD1, 0xBE)
CLAY = RGBColor(0xB8, 0x5C, 0x38)
AMBER = RGBColor(0xD9, 0xA4, 0x41)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
MOSS = RGBColor(0x7F, 0xA3, 0x6B)

SERIF = "Georgia"
SANS = "Segoe UI"

W, H = 13.333, 7.5


def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)
    return prs


def blank(prs: Presentation):
    return prs.slides.add_slide(prs.slide_layouts[6])


def rect(slide, x, y, w, h, fill, line=None, radius=False, line_w=0.75):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(shape_type, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_w)
    if radius:
        try:
            shape.adjustments[0] = 0.06
        except (IndexError, ValueError):
            pass
    return shape


def text(
    slide,
    value,
    x,
    y,
    w,
    h,
    *,
    size=14,
    color=INK,
    font=SANS,
    bold=False,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    spacing=1.0,
    italic=False,
    space_after=0,
):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    frame.margin_left = frame.margin_right = Inches(0.02)
    frame.margin_top = frame.margin_bottom = Inches(0.01)
    paragraphs = value.split("\n")
    for index, chunk in enumerate(paragraphs):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.alignment = align
        paragraph.line_spacing = spacing
        paragraph.space_after = Pt(space_after)
        run = paragraph.add_run()
        run.text = chunk
        run.font.size = Pt(size)
        run.font.name = font
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = color
    return box


def picture_fit(slide, path, x, y, w, h, *, border=None):
    with Image.open(path) as image:
        iw, ih = image.size
    scale = min(w / iw, h / ih)
    pw, ph = iw * scale, ih * scale
    px, py = x + (w - pw) / 2, y + (h - ph) / 2
    if border is not None:
        rect(slide, px - 0.035, py - 0.035, pw + 0.07, ph + 0.07, PARCHMENT, border, line_w=1)
    return slide.shapes.add_picture(path, Inches(px), Inches(py), Inches(pw), Inches(ph))


def picture_cover(slide, path, x, y, w, h):
    with Image.open(path) as image:
        iw, ih = image.size
    scale = max(w / iw, h / ih)
    pw, ph = iw * scale, ih * scale
    px, py = x - (pw - w) / 2, y - (ph - h) / 2
    return slide.shapes.add_picture(path, Inches(px), Inches(py), Inches(pw), Inches(ph))


def kicker(slide, value, x=0.75, y=0.5, color=FOREST_500, width=7.0):
    text(slide, value.upper(), x, y, width, 0.3, size=10.5, color=color, bold=True, spacing=1.4)


def footer(slide, number, dark=False, left="Forest Guard AI · hackathon build · November 2026"):
    color = RGBColor(0x9A, 0xA8, 0x9C) if dark else RGBColor(0x8A, 0x92, 0x87)
    text(slide, left, 0.75, 7.12, 8.5, 0.25, size=8.5, color=color)
    text(slide, f"{number:02d}", 12.0, 7.09, 0.58, 0.3, size=10,
         color=RGBColor(0xD8, 0xE4, 0xD8) if dark else color, bold=True, align=PP_ALIGN.RIGHT)


def notes(slide, value):
    slide.notes_slide.notes_text_frame.text = value


def stat_chip(slide, x, y, w, value, label, *, dark=False):
    fill = FOREST_700 if dark else RGBColor(0xEF, 0xF4, 0xEA)
    value_color = LIME if dark else FOREST
    label_color = RGBColor(0xC9, 0xD6, 0xC9) if dark else MUTED
    rect(slide, x, y, w, 1.0, fill, None, radius=True)
    text(slide, value, x + 0.16, y + 0.12, w - 0.32, 0.4, size=20, color=value_color, font=SERIF, bold=True)
    text(slide, label, x + 0.16, y + 0.55, w - 0.32, 0.35, size=9.5, color=label_color)


def bullet_list(slide, items, x, y, w, h, *, size=13, color=INK, gap=0.46, marker_color=FOREST_500):
    for index, item in enumerate(items):
        yy = y + index * gap
        rect(slide, x, yy + 0.13, 0.09, 0.09, marker_color, None, radius=True)
        text(slide, item, x + 0.24, yy, w - 0.24, gap, size=size, color=color, spacing=1.05)


# --------------------------------------------------------------------------- 1
def slide_title(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, FOREST)

    # right hero image, cropped by a frame
    hero = os.path.join(IMAGES, "forest.jpg")
    picture_cover(slide, hero, 7.55, 0, 5.78, H)
    rect(slide, 0, 0, 7.62, H, FOREST)
    rect(slide, 7.55, 0, 0.06, H, LIME)

    text(slide, "FOREST GUARD AI", 0.85, 0.62, 5.6, 0.35, size=12, color=LIME, bold=True, spacing=2.2)
    text(slide, "Protecting Forests.\nPreventing Conflict.\nSaving Lives.", 0.85, 1.3, 6.3, 3.05,
         size=40, color=WHITE, font=SERIF, bold=True, spacing=1.02)
    text(slide,
         "An AI-assisted conflict-prevention console: local detection,\nexplainable GIS risk, guard response and a privacy-safe community portal.",
         0.85, 4.45, 6.2, 1.0, size=13, color=RGBColor(0xC9, 0xD6, 0xC9), spacing=1.3)

    tags = ["FastAPI", "React + Leaflet", "YOLO-World v2", "CLIP", "SQLite"]
    x = 0.85
    for tag in tags:
        width = 0.22 + 0.098 * len(tag)
        rect(slide, x, 5.62, width, 0.34, FOREST_700, FOREST_500, radius=True)
        text(slide, tag, x + 0.1, 5.67, width - 0.15, 0.26, size=9, color=RGBColor(0xDC, 0xEB, 0xE1), bold=True)
        x += width + 0.12

    text(slide, "Synthetic demonstration observations  ·  genuine local inference  ·  no live feeds",
         0.85, 6.42, 6.4, 0.5, size=10.5, color=RGBColor(0x9A, 0xA8, 0x9C))
    footer(slide, 1, dark=True, left="Single-node build · runs offline after model download")
    notes(slide,
          "Open by naming the boundary: the dataset is synthetic and labelled, while every upload "
          "is genuinely analysed by a local two-stage model. No camera feeds or government systems "
          "are connected.")
    return slide


# --------------------------------------------------------------------------- 2
def slide_problem(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, PARCHMENT)
    kicker(slide, "The operational gap")
    text(slide, "Sightings don't wait.\nNeither should the response.", 0.75, 0.9, 7.85, 1.4,
         size=27, color=FOREST, font=SERIF, bold=True, spacing=1.08)
    text(slide,
         "Forest teams already collect camera images, patrol notes, incident logs and village calls.\n"
         "The hard part is turning them into one timely, defensible decision.",
         0.75, 2.35, 7.4, 0.9, size=13, color=MUTED, spacing=1.25)

    cards = [
        ("01", "Sightings arrive late", "A photo on a phone or a note in a register reaches the range officer hours after the animal has moved."),
        ("02", "Maps and records live apart", "Detections, village boundaries, incidents and patrols sit in different tools, so proximity is judged by memory."),
        ("03", "Warnings don't reach the right people", "Advisories are broadcast to everyone or no one, instead of the villages actually inside the risk radius."),
        ("04", "Community reports get lost", "Villagers have no simple way to report a sighting or check what happened next — and trust erodes."),
    ]
    positions = [(0.75, 3.62), (4.55, 3.62), (0.75, 5.28), (4.55, 5.28)]
    for (num, title, body), (x, y) in zip(cards, positions):
        rect(slide, x, y, 3.55, 1.45, WHITE, LINE, radius=True)
        text(slide, num, x + 0.22, y + 0.16, 0.55, 0.35, size=11, color=CLAY, bold=True)
        text(slide, title, x + 0.78, y + 0.13, 2.65, 0.35, size=11.5, color=FOREST, bold=True)
        text(slide, body, x + 0.22, y + 0.62, 3.12, 0.78, size=9.3, color=MUTED, spacing=1.15)

    rect(slide, 8.65, 3.62, 3.95, 3.11, FOREST, None, radius=True)
    text(slide, "WHAT A WARDEN NEEDS", 8.95, 3.88, 3.3, 0.3, size=9.5, color=LIME, bold=True, spacing=1.6)
    needs = [
        ("Where exactly?", "Village-relative distance, not a raw coordinate"),
        ("How serious?", "Species, recency, repeat sightings, incidents"),
        ("Who acts?", "An assigned guard and a tracked status"),
        ("What can I say publicly?", "Guidance without exposing the animal's location"),
    ]
    yy = 4.3
    for index, (head, body) in enumerate(needs, start=1):
        text(slide, f"{index}", 8.95, yy, 0.35, 0.3, size=11, color=LIME, bold=True)
        text(slide, head, 9.28, yy - 0.02, 3.05, 0.28, size=11.5, color=WHITE, bold=True)
        text(slide, body, 9.28, yy + 0.26, 3.0, 0.3, size=8.7, color=RGBColor(0xB4, 0xD3, 0xBF))
        yy += 0.6
    footer(slide, 2)
    notes(slide,
          "No invented statistics here on purpose. The problem is operational fragmentation: "
          "data exists, but timing, geography and accountability are missing. The right panel "
          "sets the four questions the product must answer.")
    return slide


# --------------------------------------------------------------------------- 3
def slide_solution(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, SAND)
    kicker(slide, "The product")
    text(slide, "One loop: detect, locate, score, warn, respond.", 0.75, 0.9, 11.8, 0.65,
         size=29, color=FOREST, font=SERIF, bold=True)
    text(slide,
         "Six modules share one database and one risk configuration, so a new detection immediately "
         "updates the map, the alert queue, the guard board and the public advisory.",
         0.75, 1.62, 11.5, 0.6, size=13, color=MUTED)

    columns = [
        ("SENSE", "AI detection",
         ["Image and short-video upload", "Animal localisation + species", "Confidence and 'unidentified' fallback", "Annotated evidence stored"]),
        ("UNDERSTAND", "GIS + risk",
         ["Village boundaries and cameras", "Explainable weighted score", "Low / moderate / high", "Movement only with evidence"]),
        ("ACT", "Response + public",
         ["Threshold alerts with reasons", "Assign, acknowledge, resolve", "Guard-scoped task board", "Sanitised community advisories"]),
    ]
    x = 0.75
    for idx, (tag, title, items) in enumerate(columns):
        rect(slide, x, 2.45, 3.85, 3.05, WHITE, LINE, radius=True)
        rect(slide, x, 2.45, 3.85, 0.09, [FOREST_500, AMBER, CLAY][idx])
        text(slide, tag, x + 0.25, 2.7, 3.2, 0.3, size=9.5, color=MUTED, bold=True, spacing=1.5)
        text(slide, title, x + 0.25, 2.98, 3.3, 0.4, size=16, color=FOREST, font=SERIF, bold=True)
        bullet_list(slide, items, x + 0.25, 3.55, 3.4, 1.8, size=10.5, gap=0.43)
        x += 4.06

    rect(slide, 0.75, 5.82, 11.9, 0.92, WHITE, LINE, radius=True)
    text(slide, "THE INTEGRATION POINT", 1.0, 5.98, 2.4, 0.25, size=8.5, color=CLAY, bold=True, spacing=1.4)
    text(slide,
         "A single Risk config and Alert lifecycle connect the console and the public portal — "
         "with different payloads for each audience.",
         1.0, 6.22, 11.2, 0.42, size=11.5, color=INK)
    footer(slide, 3)
    notes(slide,
          "Frame the demo as one loop rather than eight pages. The key engineering choice is that "
          "risk configuration and alert state are shared, while serializers enforce what each "
          "audience is allowed to see.")
    return slide


# --------------------------------------------------------------------------- 4
def slide_ai(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, PARCHMENT)
    rect(slide, 0, 0, 0.18, H, FOREST_500)
    kicker(slide, "Module 1 · AI detection", x=0.9)
    text(slide, "Real inference,\nconservative by design.", 0.9, 0.9, 5.6, 1.55,
         size=30, color=FOREST, font=SERIF, bold=True, spacing=1.05)
    text(slide,
         "Two off-the-shelf models run locally on CPU. No fine-tuning, no cloud calls, "
         "and no forced species label when the evidence is weak.",
         0.9, 2.55, 5.35, 0.8, size=12.5, color=MUTED, spacing=1.25)

    bullet_list(slide, [
        "YOLO-World v2 proposes 'animal' boxes",
        "CLIP ViT-B/32 scores six regional species",
        "Low-confidence crops become 'unidentified'",
        "Videos: up to 5 sampled frames, not tracking",
    ], 0.9, 3.5, 5.4, 2.0, size=11.5, gap=0.46)

    stat_chip(slide, 0.9, 5.55, 1.66, "6", "supported species", dark=True)
    stat_chip(slide, 2.7, 5.55, 1.66, "5.2 s", "CPU model load")
    stat_chip(slide, 4.5, 5.55, 1.66, "1.8 s", "6-image smoke check")

    picture_fit(slide, os.path.join(SHOTS, "02_live_monitoring.png"), 6.55, 0.72, 6.1, 4.9,
                border=LINE)
    text(slide,
         "Live upload in the running app: tiger detected, 71 % species confidence, "
         "stored as recognition #231 and scored 86 (high risk).",
         6.6, 5.78, 6.0, 0.62, size=9.5, color=MUTED, italic=True, spacing=1.15)
    text(slide, "Smoke check is one photo per species — not an accuracy claim.",
         0.9, 6.68, 5.6, 0.3, size=8.5, color=CLAY)
    footer(slide, 4)
    notes(slide,
          "Be precise: 6/6 on six licenced reference photos is a plumbing check, not a benchmark. "
          "The screenshot is from a genuine upload; point out the confidence and the risk basis, "
          "not just the species name.")
    return slide


# --------------------------------------------------------------------------- 5
def slide_gis(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, PARCHMENT)
    kicker(slide, "Module 2 · GIS intelligence")
    text(slide, "Place changes the decision.", 0.75, 0.88, 4.55, 1.35,
         size=25, color=FOREST, font=SERIF, bold=True, spacing=1.05)
    text(slide,
         "A tiger 4 km deep in the forest and a tiger 200 m from a cattle shed are not the same event. "
         "The map makes that difference visible and filterable.",
         0.75, 2.28, 4.4, 1.1, size=11, color=MUTED, spacing=1.25)

    layers = [
        "Forest and village polygons",
        "Clustered detections + detail panel",
        "Camera stations and guard posts",
        "Gridded risk cells + alert coverage",
        "Inferred movement paths",
    ]
    bullet_list(slide, layers, 0.75, 3.45, 4.4, 2.2, size=10.5, gap=0.42)

    rect(slide, 0.75, 5.72, 4.4, 1.1, FOREST, None, radius=True)
    text(slide, "score = 100 × species × Σ(w × evidence)", 0.98, 5.86, 4.0, 0.32,
         size=12, color=LIME, font="Consolas", bold=True)
    text(slide, "proximity .55 · recency .15 · frequency .12 · incident .10 · movement .08",
         0.98, 6.26, 4.05, 0.42, size=8.3, color=RGBColor(0xDC, 0xEB, 0xE1))

    picture_fit(slide, os.path.join(SHOTS, "03_gis_intelligence_map.png"), 5.45, 0.9, 7.4, 4.85,
                border=LINE)
    text(slide, "Risk cells are indicative 21-day aggregates, not habitat predictions.",
         5.5, 6.0, 7.2, 0.3, size=8.5, color=MUTED, italic=True)
    footer(slide, 5)
    notes(slide,
          "Show the map live if possible: toggle layers, click a cluster, open a detection, "
          "filter by species. Emphasise that proximity and movement are separate evidence, "
          "so a nearby sighting is not mislabeled an approach.")
    return slide


# --------------------------------------------------------------------------- 6
def slide_risk(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, FOREST)
    picture_fit(slide, os.path.join(DIAGRAMS, "risk_model.png"), 0.35, 0.06, 12.63, 6.9)
    footer(slide, 6, dark=True, left="Weights, thresholds and radii are editable at runtime by an admin; reset restores defaults.")
    notes(slide,
          "This is the explainability slide. Every alert stores its components and a written basis. "
          "If asked for the seeded distribution: 136 low, 84 moderate, 10 high with defaults. "
          "The score prioritises verification; it does not predict conflict.")
    return slide


# --------------------------------------------------------------------------- 7
def slide_workflow(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, PARCHMENT)
    kicker(slide, "Modules 4 & 5 · Alert and response")
    text(slide, "An alert is a task,\nnot a notification.", 0.75, 0.88, 4.9, 1.35,
         size=25, color=FOREST, font=SERIF, bold=True, spacing=1.05)
    text(slide,
         "When a detection crosses the configurable threshold inside the alert radius, it becomes "
         "one assigned task with a reason, affected villages and a timestamp.",
         0.75, 2.28, 5.3, 0.95, size=10.8, color=MUTED, spacing=1.22)

    steps = [
        ("1", "Detection", "species, camera, score, basis"),
        ("2", "Alert", "threshold + radius, deduplicated"),
        ("3", "Assign", "nearest available guard"),
        ("4", "Acknowledge", "guard confirms ownership"),
        ("5", "Respond", "status and note recorded"),
        ("6", "Resolve", "audit trail closed"),
    ]
    yy = 3.42
    for index, (num, head, body) in enumerate(steps):
        fill = FOREST if index in (0, 1) else RGBColor(0xEE, 0xF4, 0xEA)
        head_color = WHITE if index in (0, 1) else FOREST
        body_color = RGBColor(0xC9, 0xD6, 0xC9) if index in (0, 1) else MUTED
        rect(slide, 0.75, yy, 4.9, 0.5, fill, LINE if index > 1 else None, radius=True)
        text(slide, num, 0.95, yy + 0.11, 0.3, 0.3, size=10, color=LIME if index in (0, 1) else CLAY, bold=True)
        text(slide, head, 1.3, yy + 0.02, 1.55, 0.3, size=10.5, color=head_color, bold=True)
        text(slide, body, 2.85, yy + 0.05, 2.6, 0.3, size=8.8, color=body_color)
        yy += 0.55

    picture_fit(slide, os.path.join(SHOTS, "05_risk_alerts.png"), 5.95, 0.85, 6.85, 4.5,
                border=LINE)
    rect(slide, 6.0, 5.55, 6.7, 0.92, RGBColor(0xEE, 0xF4, 0xEA), LINE, radius=True)
    text(slide, "Guard board", 6.25, 5.7, 1.3, 0.28, size=9.5, color=FOREST, bold=True)
    text(slide, "RBAC-scoped queues; acknowledge → responding → resolve with an append-only audit trail.",
         7.45, 5.7, 5.05, 0.6, size=9.2, color=MUTED, spacing=1.15)
    text(slide,
         "Simulated in-app notification  ·  no SMS sent  ·  every action appends an event",
         6.0, 6.62, 6.6, 0.3, size=8.8, color=CLAY)
    footer(slide, 7)
    notes(slide,
          "Run one lifecycle live if time allows. Stress that dispatch is simulated: no SMS is "
          "sent, and the UI says so. The audit trail is the accountability mechanism.")
    return slide


# --------------------------------------------------------------------------- 8
def slide_community(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, PARCHMENT)
    kicker(slide, "Module 6 · Community portal (public)")
    text(slide, "Warn the village.\nDon't expose the animal.", 0.75, 0.88, 5.9, 1.55,
         size=25, color=FOREST, font=SERIF, bold=True, spacing=1.05)
    text(slide,
         "The public portal republishes the same underlying risk as a coarse advisory. "
         "Sanitisation happens on the server, so coordinates never reach the public payload.",
         0.75, 2.35, 5.8, 0.95, size=10.8, color=MUTED, spacing=1.22)

    public_items = ["Village names and risk level", "Safety guidance", "Report sighting / conflict", "Reference-code status check"]
    console_items = ["Exact coordinates and camera codes", "Detection media and confidence", "Reporter details", "Guard assignment and audit"]

    text(slide, "PUBLIC SEES", 0.75, 3.45, 2.2, 0.28, size=9, color=CLAY, bold=True, spacing=1.4)
    bullet_list(slide, public_items, 0.75, 3.76, 5.4, 1.45, size=9.8, gap=0.33, marker_color=MOSS)
    text(slide, "CONSOLE SEES", 0.75, 5.15, 2.2, 0.28, size=9, color=FOREST_500, bold=True, spacing=1.4)
    bullet_list(slide, console_items, 0.75, 5.46, 5.4, 1.45, size=9.8, gap=0.31, marker_color=FOREST)

    picture_fit(slide, os.path.join(SHOTS, "07_community_portal.png"), 7.15, 0.62, 5.45, 3.41,
                border=LINE)
    picture_fit(slide, os.path.join(SHOTS, "08_community_report_status.png"), 7.55, 4.2, 4.65, 2.66,
                border=LINE)
    text(slide, "Report FG-2026-9707 accepted and checked live.", 7.6, 6.9, 4.6, 0.3,
         size=8.5, color=MUTED, italic=True)
    footer(slide, 8)
    notes(slide,
          "Switch to the public tab and submit a report live. The reference code round trip is the "
          "proof that the portal is functional, not a static page. The right-hand screenshot is the "
          "status lookup.")
    return slide


# --------------------------------------------------------------------------- 9
def slide_architecture(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, FOREST)
    picture_fit(slide, os.path.join(DIAGRAMS, "system_architecture.png"), 0.28, 0.04, 12.77, 6.95)
    footer(slide, 9, dark=True, left="React SPA · FastAPI · SQLite · local AI · OSM basemap · 28 backend tests")
    notes(slide,
          "Engineering quality slide: thin routers, services for risk/alerts/tracking, serializer-"
          "enforced privacy, 28 tests with an isolated temporary database, and a production build "
          "that the API can serve from one process.")
    return slide


# --------------------------------------------------------------------------- 10
def slide_status(prs):
    slide = blank(prs)
    rect(slide, 0, 0, W, H, FOREST)
    rect(slide, 0, 0, W, 0.09, LIME)
    kicker(slide, "Status · 11 November 2026", x=0.75, color=LIME)
    text(slide, "What is real, what is not,\nand what comes next.", 0.75, 0.88, 7.0, 1.55,
         size=29, color=WHITE, font=SERIF, bold=True, spacing=1.05)

    text(slide, "BUILT AND VERIFIED", 0.75, 2.62, 4.0, 0.3, size=9.5, color=LIME, bold=True, spacing=1.5)
    built = [
        "8 working dashboard pages, all controls wired",
        "Genuine image/video inference on CPU",
        "GIS map with 8 layers and filters",
        "Explainable, configurable risk engine",
        "Alert → guard response with audit trail",
        "Public portal with server-side sanitisation",
        "28 pytest tests · production build passes",
        "10 live screenshots · 3 architecture diagrams",
    ]
    bullet_list(slide, built, 0.75, 3.0, 5.6, 3.0, size=10, color=WHITE, gap=0.38, marker_color=LIME)

    text(slide, "NOT BUILT / NOT CLAIMED", 6.75, 2.62, 4.2, 0.3, size=9.5, color=RGBColor(0xE8, 0xB4, 0x9A), bold=True, spacing=1.5)
    not_built = [
        "No live camera feeds or CCTV integration",
        "No GPS collars or individual identification",
        "No SMS/email dispatch (simulated in-app)",
        "No field accuracy claim — smoke check only",
        "No government or restricted data access",
        "Single-node SQLite, not a scale-out service",
    ]
    bullet_list(slide, not_built, 6.75, 3.0, 5.7, 2.4, size=10, color=WHITE, gap=0.38, marker_color=RGBColor(0xE8, 0xB4, 0x9A))

    rect(slide, 6.75, 5.42, 5.7, 1.12, FOREST_700, FOREST_500, radius=True)
    text(slide, "NEXT", 6.98, 5.57, 0.8, 0.25, size=8.5, color=LIME, bold=True, spacing=1.4)
    text(slide, "Licenced camera-trap benchmark · PostGIS · real dispatch · offline guard app",
         6.98, 5.83, 5.25, 0.55, size=10.5, color=WHITE, spacing=1.15)

    text(slide, "Run it", 0.75, 6.42, 1.0, 0.25, size=8.5, color=LIME, bold=True, spacing=1.4)
    text(slide, "python -m uvicorn backend.main:app --port 8000   ·   cd frontend && npm run dev",
         0.75, 6.66, 7.6, 0.3, size=9.5, color=RGBColor(0xDC, 0xEB, 0xE1), font="Consolas")
    text(slide, "admin@forestguard.ai / forest123   ·   guard@forestguard.ai / guard123",
         8.6, 6.66, 4.0, 0.3, size=8.5, color=RGBColor(0x9A, 0xA8, 0x9C), align=PP_ALIGN.RIGHT)
    notes(slide,
          "Close with the honesty slide. Judges trust a clear boundary more than a perfect claim. "
          "Offer the run commands and demo accounts so they can verify everything themselves.")
    return slide


def main() -> None:
    prs = new_deck()
    slide_title(prs)
    slide_problem(prs)
    slide_solution(prs)
    slide_ai(prs)
    slide_gis(prs)
    slide_risk(prs)
    slide_workflow(prs)
    slide_community(prs)
    slide_architecture(prs)
    slide_status(prs)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    prs.save(OUT)
    print(f"wrote {OUT} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    main()
