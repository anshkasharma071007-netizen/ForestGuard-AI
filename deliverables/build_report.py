"""Build the Forest Guard AI PDF report (A4, ~10 pages).

Run:  python deliverables/build_report.py
"""
from __future__ import annotations

import os

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
DIAGRAMS = os.path.join(ROOT, "docs", "diagrams")
IMAGES = os.path.join(ROOT, "frontend", "public", "images")
OUT = os.path.join(ROOT, "deliverables", "Forest_Guard_AI_Report.pdf")

FOREST = colors.HexColor("#0C2418")
FOREST_700 = colors.HexColor("#19452F")
FOREST_500 = colors.HexColor("#2F7250")
LIME = colors.HexColor("#C4E87A")
SAND = colors.HexColor("#F4F1E8")
PARCHMENT = colors.HexColor("#FBFAF5")
INK = colors.HexColor("#17211B")
MUTED = colors.HexColor("#5C665C")
LINE = colors.HexColor("#D8D1BE")
CLAY = colors.HexColor("#B85C38")
AMBER = colors.HexColor("#D9A441")
WHITE = colors.white

FONTS = "C:/Windows/Fonts"
pdfmetrics.registerFont(TTFont("Georgia", f"{FONTS}/georgia.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Bold", f"{FONTS}/georgiab.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Italic", f"{FONTS}/georgiai.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-BoldItalic", f"{FONTS}/georgiaz.ttf"))
pdfmetrics.registerFontFamily("Georgia", normal="Georgia", bold="Georgia-Bold",
                              italic="Georgia-Italic", boldItalic="Georgia-BoldItalic")
pdfmetrics.registerFont(TTFont("Segoe", f"{FONTS}/segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Bold", f"{FONTS}/segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Italic", f"{FONTS}/segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-BoldItalic", f"{FONTS}/segoeuiz.ttf"))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="Segoe-Bold",
                              italic="Segoe-Italic", boldItalic="Segoe-BoldItalic")
pdfmetrics.registerFont(TTFont("Consolas", f"{FONTS}/consola.ttf"))
pdfmetrics.registerFont(TTFont("Consolas-Bold", f"{FONTS}/consolab.ttf"))

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Georgia-Bold", fontSize=23,
                    leading=28, textColor=FOREST, spaceAfter=4, spaceBefore=0)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Georgia-Bold", fontSize=14,
                    leading=18, textColor=FOREST, spaceBefore=14, spaceAfter=5)
H3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName="Segoe-Bold", fontSize=9.5,
                    leading=13, textColor=FOREST_500, spaceBefore=10, spaceAfter=3)
BODY = ParagraphStyle("Body", fontName="Segoe", fontSize=9.4, leading=14, textColor=INK,
                      spaceAfter=7)
LEAD = ParagraphStyle("Lead", parent=BODY, fontSize=11, leading=17, textColor=colors.HexColor("#3F4A40"))
SMALL = ParagraphStyle("Small", fontName="Segoe", fontSize=8, leading=11.5, textColor=MUTED)
CAPTION = ParagraphStyle("Caption", fontName="Segoe-Italic", fontSize=7.6, leading=10.5,
                         textColor=MUTED, spaceBefore=3, spaceAfter=8)
BULLET = ParagraphStyle("Bullet", parent=BODY, leftIndent=11, bulletIndent=3, spaceAfter=3.5)
KICKER = ParagraphStyle("Kicker", fontName="Segoe-Bold", fontSize=7.5, leading=10,
                        textColor=CLAY, spaceAfter=2)
CODE = ParagraphStyle("Code", fontName="Consolas", fontSize=7.8, leading=11.5,
                      textColor=colors.HexColor("#DCECE1"))
CELL = ParagraphStyle("Cell", fontName="Segoe", fontSize=8.1, leading=11, textColor=INK)
CELL_B = ParagraphStyle("CellB", parent=CELL, fontName="Segoe-Bold")
CELL_H = ParagraphStyle("CellH", parent=CELL, fontName="Segoe-Bold", textColor=WHITE, fontSize=8)
CELL_S = ParagraphStyle("CellS", parent=CELL, fontSize=7.4, leading=10, textColor=MUTED)

PAGE_W, PAGE_H = A4
MARGIN_X = 19 * mm
BODY_W = PAGE_W - 2 * MARGIN_X
COVER_IMG = os.path.join(ROOT, "deliverables", "_cover.jpg")


def make_cover_image() -> None:
    """Crop the forest photograph to the portrait cover panel and save a temp JPEG."""
    target_w, target_h = 1200, 2400
    with PILImage.open(os.path.join(IMAGES, "forest.jpg")) as image:
        image = image.convert("RGB")
        scale = max(target_w / image.width, target_h / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)))
        left = (resized.width - target_w) // 2
        top = (resized.height - target_h) // 2
        resized.crop((left, top, left + target_w, top + target_h)).save(COVER_IMG, "JPEG", quality=88)


def cover(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(FOREST)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    panel_w = 90 * mm
    canvas.drawImage(COVER_IMG, PAGE_W - panel_w, 0, width=panel_w, height=PAGE_H,
                     preserveAspectRatio=False, mask=None)
    canvas.setFillColor(LIME)
    canvas.rect(PAGE_W - panel_w - 0.9 * mm, 0, 0.9 * mm, PAGE_H, stroke=0, fill=1)

    x = 20 * mm
    canvas.setFillColor(LIME)
    canvas.setFont("Segoe-Bold", 8)
    canvas.drawString(x, PAGE_H - 30 * mm, "FOREST GUARD AI  ·  TECHNICAL REPORT")

    canvas.setFillColor(WHITE)
    canvas.setFont("Georgia-Bold", 26)
    canvas.drawString(x, PAGE_H - 62 * mm, "Protecting Forests.")
    canvas.drawString(x, PAGE_H - 75 * mm, "Preventing Conflict.")
    canvas.drawString(x, PAGE_H - 88 * mm, "Saving Lives.")

    canvas.setFillColor(colors.HexColor("#B4D3BF"))
    canvas.setFont("Segoe", 10.2)
    canvas.drawString(x, PAGE_H - 108 * mm, "AI-assisted wildlife monitoring, explainable GIS risk,")
    canvas.drawString(x, PAGE_H - 114 * mm, "guard response and a privacy-safe community portal.")

    canvas.setStrokeColor(FOREST_500)
    canvas.setLineWidth(0.8)
    canvas.line(x, PAGE_H - 124 * mm, x + 62 * mm, PAGE_H - 124 * mm)

    canvas.setFillColor(colors.HexColor("#DCECE1"))
    canvas.setFont("Segoe", 8.4)
    canvas.drawString(x, PAGE_H - 134 * mm, "Hackathon build  ·  11 November 2026")
    canvas.drawString(x, PAGE_H - 139.5 * mm, "Single-node  ·  CPU inference  ·  synthetic demo dataset")
    canvas.setFillColor(colors.HexColor("#7F9C86"))
    canvas.setFont("Segoe", 7.4)
    canvas.drawString(x, PAGE_H - 146 * mm, "Real local inference. Seeded observations are synthetic and labelled.")

    canvas.setFillColor(FOREST_700)
    canvas.roundRect(x, 20 * mm, 66 * mm, 9 * mm, 1.6 * mm, stroke=0, fill=1)
    canvas.setFillColor(LIME)
    canvas.setFont("Segoe-Bold", 6.9)
    canvas.drawString(x + 3.2 * mm, 23.4 * mm, "REAL INFERENCE  ·  NO LIVE FEEDS  ·  NO GPS CLAIMS")
    canvas.restoreState()


def body_decor(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, PAGE_H - 14 * mm, PAGE_W - MARGIN_X, PAGE_H - 14 * mm)
    canvas.setFont("Segoe-Bold", 7)
    canvas.setFillColor(FOREST_500)
    canvas.drawString(MARGIN_X, PAGE_H - 11.5 * mm, "FOREST GUARD AI")
    canvas.setFont("Segoe", 7)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 11.5 * mm,
                           "Technical report  ·  11 November 2026")
    canvas.line(MARGIN_X, 13 * mm, PAGE_W - MARGIN_X, 13 * mm)
    canvas.setFont("Segoe", 7)
    canvas.drawString(MARGIN_X, 8.5 * mm, "Synthetic demonstration data  ·  local CPU inference  ·  not a field-validated system")
    canvas.drawRightString(PAGE_W - MARGIN_X, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def P(value, style=BODY):
    return Paragraph(value, style)


def bullets(items, style=BULLET):
    return [Paragraph(item, style, bulletText="•") for item in items]


def img(path, width_mm, caption=None):
    with PILImage.open(path) as image:
        w, h = image.size
    height = width_mm * h / w
    flow = [Image(path, width=width_mm * mm, height=height * mm)]
    if caption:
        flow.append(P(caption, CAPTION))
    return flow


def callout(title, body, *, fill=colors.HexColor("#F1F5EC"), border=FOREST_500, title_color=FOREST):
    inner = [
        P(title, ParagraphStyle("ct", fontName="Segoe-Bold", fontSize=8, leading=11,
                                textColor=title_color, spaceAfter=2)),
        P(body, ParagraphStyle("cb", fontName="Segoe", fontSize=8.4, leading=12, textColor=MUTED)),
    ]
    table = Table([[inner]], colWidths=[BODY_W])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.6, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def table(rows, widths, *, header=True, font_size=8, zebra=True, align_center=()):
    data = []
    for r_index, row in enumerate(rows):
        line = []
        for c_index, cell in enumerate(row):
            if isinstance(cell, str):
                if header and r_index == 0:
                    line.append(P(cell, CELL_H))
                else:
                    style = ParagraphStyle("cellx", parent=CELL, fontSize=font_size, leading=font_size + 2.8)
                    if c_index in align_center:
                        style.alignment = 1
                    line.append(P(cell, style))
            else:
                line.append(cell)
        data.append(line)
    tbl = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if header else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), FOREST),
            ("TOPPADDING", (0, 0), (-1, 0), 5.5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5.5),
        ]
    if zebra:
        for r in range(1 if header else 0, len(rows)):
            if (r % 2 == 0):
                commands.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F7F5EE")))
    tbl.setStyle(TableStyle(commands))
    return tbl


def section(title, kicker=None):
    flow = []
    if kicker:
        flow.append(P(kicker.upper(), KICKER))
    flow.append(P(title, H1))
    flow.append(HRFlowable(width="100%", thickness=1, color=LINE, spaceBefore=2, spaceAfter=10))
    return flow


def build() -> None:
    make_cover_image()
    doc = BaseDocTemplate(
        OUT, pagesize=A4,
        leftMargin=MARGIN_X, rightMargin=MARGIN_X,
        topMargin=20 * mm, bottomMargin=17 * mm,
        title="Forest Guard AI — Technical Report",
        author="Forest Guard AI project",
        subject="AI wildlife monitoring, GIS conflict risk and response workflow",
        creator="Forest Guard AI",
    )
    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0, showBoundary=0)
    body_frame = Frame(MARGIN_X, 17 * mm, BODY_W, PAGE_H - 35 * mm, id="body",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=cover),
        PageTemplate(id="Body", frames=[body_frame], onPage=body_decor),
    ])

    story = [Spacer(1, 1), NextPageTemplate("Body"), PageBreak()]

    # ------------------------------------------------------------------ 1 · summary
    story += section("Executive summary", "01 · Overview")
    story.append(P(
        "Forest Guard AI is a working, local-first platform for human–wildlife conflict prevention. "
        "A detection is analysed on the machine, attached to a real camera station, scored against "
        "village boundaries with an explainable model, converted into an assigned guard task, and "
        "republished to the public as a coarse advisory that never reveals the animal's location. "
        "It was built for a solo-student hackathon, and every screen is wired to a live API.", LEAD))
    story.append(P(
        "The honest boundary matters. Villages, cameras, guards, detections, incidents and alerts in "
        "the shipped dataset are <b>synthetic and labelled</b>. Uploaded images and short videos are "
        "<b>genuinely analysed</b> by YOLO-World v2 and CLIP on CPU. No live feeds, GPS collars, "
        "government systems or cloud inference are involved, and no field accuracy is claimed.", BODY))

    summary_rows = [
        ["Area", "What was delivered", "Evidence"],
        ["Platform", "FastAPI + SQLAlchemy/SQLite API; React 18 + Vite SPA with eight pages", "28 API/domain tests; production build"],
        ["AI", "Two-stage local detection (YOLO-World v2 + CLIP ViT-B/32), image and 5-frame video", "Genuine upload captured in screenshot 02"],
        ["GIS", "Leaflet map with 8 layers, clustering, filters, detail panel and risk cells", "Screenshot 03; map payload tests"],
        ["Risk", "Configurable weighted score with five evidence components and species multipliers", "Risk diagram; boundary tests"],
        ["Response", "Alert lifecycle, guard assignment, RBAC and append-only audit events", "Lifecycle test; screenshot 05"],
        ["Community", "Public advisories, reports with optional image, reference-code status check", "Sanitisation tests; screenshot 07–08"],
        ["Demo data", "5 villages, 12 cameras, 6 guards, 230 detections, 18 tracks, 13 alerts, 6 incidents", "Deterministic seed on first boot"],
    ]
    story.append(table(summary_rows, [23, 95, 52], font_size=7.7))
    story.append(Spacer(1, 4))
    story.append(callout(
        "STATUS AT A GLANCE",
        "Built and verified: all six modules, eight pages, 28 backend tests, production bundle, "
        "10 live screenshots and 3 architecture diagrams. Not built or not claimed: live camera "
        "integration, GPS tracking, real SMS/email dispatch, field accuracy, scale-out infrastructure."))
    story.append(Spacer(1, 5))
    story += img(os.path.join(SHOTS, "01_overview_dashboard.png"), 122,
                 "The operations console at a glance. Figures on every page come from the same seeded dataset, and the demo-data badge is visible throughout.")
    story.append(PageBreak())

    # ------------------------------------------------------------------ 2 · problem
    story += section("The problem and the design response", "02 · Context")
    story.append(P(
        "Forest teams already collect camera images, patrol notes, incident logs and village calls. "
        "The binding constraint is not a lack of data — it is the time and judgement needed to turn "
        "fragmented records into one defensible action.", LEAD))
    story.append(P(
        "Four operational gaps shaped the product: sightings arrive late; maps and records live in "
        "different tools; warnings are broadcast to everyone or no one; and community reports "
        "disappear without a trace. Each maps to a module rather than a dashboard widget.", BODY))
    story.append(P("Design principles", H2))
    principles = [
        ["Principle", "How it is enforced"],
        ["Honesty", "Synthetic records carry demo badges and API flags. Uploads return a real result or a 503 — never a fabricated one."],
        ["Explainability", "Every alert stores its score components, species weight, distance basis and a written reason."],
        ["Privacy by architecture", "Public payloads are sanitised server-side; coordinates and camera codes never reach the browser."],
        ["Local-first", "No cloud inference or external data calls. OpenStreetMap is used only for basemap tiles."],
        ["Reproducibility", "A fixed random seed generates the same landscape and history on every reset."],
        ["Honest movement", "Tracks require ≥3 detections across ≥2 cameras within 24 h and 7 km; GPS is never implied."],
    ]
    story.append(table(principles, [38, 132], font_size=8))
    story.append(P("Explicit non-goals", H2))
    story += bullets([
        "No live camera feeds, CCTV integration or government surveillance access.",
        "No GPS telemetry, animal collars or individual re-identification.",
        "No real dispatch channel: guard notification is simulated in-app and labelled.",
        "No claim of field accuracy, deployment, adoption or measured impact.",
        "No public exposure of sensitive wildlife locations.",
    ])
    story.append(Spacer(1, 3))
    story.append(callout(
        "THE CORE IDEA",
        "A nearby sighting and a confirmed approach are different evidence. The product shows "
        "proximity, recency, frequency, incidents and movement separately, so a high score means "
        "“verify this soon” — not “a conflict will occur”."))
    story.append(P("The evidence chain", H2))
    chain = [
        ["Stage", "Question answered", "Stored artefact"],
        ["Frame", "What was seen, and how sure is the model?", "Annotated media, species, confidence, bounding box"],
        ["Place", "Which station and how far from a village?", "Camera coordinates, boundary distance"],
        ["Risk", "Why is it urgent?", "Components, weights, score, level, written basis"],
        ["Alert", "Who should act, and where?", "Affected villages, assigned guard, timestamp"],
        ["Response", "What happened?", "Acknowledge/respond/resolve events with actor and note"],
    ]
    story.append(table(chain, [22, 66, 82], font_size=7.6))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 3 · architecture
    story += section("System architecture", "03 · Engineering")
    story.append(P(
        "A React single-page client talks to a FastAPI JSON API. The API owns authentication, "
        "domain services, media serving and CSV export. The AI engine is loaded lazily on the first "
        "upload and stays resident. SQLite is the database of record; the study area, village "
        "boundaries and risk configuration are files in the repository.", BODY))
    story += img(os.path.join(DIAGRAMS, "system_architecture.png"), 170,
                 "Figure 1 — Single-node architecture. The public portal and the console read the same data through different serializers.")
    arch_rows = [
        ["Layer", "Technology", "Responsibility"],
        ["Client", "React 18 · Vite 6 · Tailwind · Leaflet 1.9 · Recharts", "Eight pages, map layers, forms, filters, charts"],
        ["API", "FastAPI · Pydantic v2 · SQLAlchemy 2.0", "Auth, RBAC, validation, domain endpoints, CSV export"],
        ["Domain", "Pure-Python services", "Risk scoring, alert sync, tracking, seeding, serializers"],
        ["AI", "PyTorch · YOLO-World v2 · CLIP ViT-B/32", "Localisation, species scoring, annotation"],
        ["Data", "SQLite (WAL) · GeoJSON · media store", "Records, boundaries, risk config, uploads"],
    ]
    story.append(table(arch_rows, [22, 70, 78], font_size=7.7))
    story.append(P(
        "Routers stay thin and services own the logic. The privacy boundary is implemented in "
        "serializers, not in the client: public endpoints physically omit coordinates, camera "
        "identifiers and detection media. Tests assert the absence of those keys, so a future UI "
        "change cannot accidentally leak them.", BODY))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 4 · AI
    story += section("AI detection: local, conservative, bounded", "04 · Module 1")
    story.append(P(
        "The engine uses two off-the-shelf models on CPU, with no fine-tuning. YOLO-World v2 is "
        "configured with the single open-vocabulary class <i>animal</i>; each proposed crop is then "
        "scored by CLIP against three prompts per species for six regional species, plus negative "
        "prompts for empty forest, vehicles and people. If the negative-prompt mass dominates, the "
        "crop is vetoed to <i>unidentified</i> — a wrong dangerous-species label is worse than an "
        "honest “verify this frame”.", BODY))
    ai_rows = [
        ["Decision rule", "Default", "Effect"],
        ["Detector confidence", "0.15", "Boxes below the floor are dropped"],
        ["Minimum box area", "0.8 % of frame", "Rejects tiny spurious boxes"],
        ["Species floor", "0.45", "Weak crops become “unidentified”, not a forced species"],
        ["Combined floor", "0.50", "0.55 × species + 0.45 × detector"],
        ["Full-frame path", "0.62", "Separate floor when a crop fills the frame"],
        ["Box cap", "6 per frame", "After IoU de-duplication at 0.55"],
        ["Video sampling", "up to 5 frames", "Independent frames — no temporal tracking"],
    ]
    story.append(table(ai_rows, [42, 26, 102], font_size=7.4))
    story.append(Spacer(1, 3))
    story += img(os.path.join(SHOTS, "02_live_monitoring.png"), 86,
                 "Figure 2 — A genuine tiger upload in the running app: annotated result, 71 % species confidence, stored recognition #231, risk 86 (high).")
    story.append(P("What the evaluation does and does not show", H2))
    eval_rows = [
        ["Reference image", "Expected", "Predicted", "Detector", "Species", "Overall"],
        ["tiger.jpg", "tiger", "tiger", "0.41", "0.97", "0.71"],
        ["leopard.jpg", "leopard", "leopard", "0.45", "1.00", "0.75"],
        ["elephant.jpg", "elephant", "elephant", "0.66", "1.00", "0.85"],
        ["bear.jpg", "sloth bear", "sloth bear", "0.80", "0.99", "0.90"],
        ["boar.jpg", "wild boar", "wild boar", "0.59", "1.00", "0.81"],
        ["deer.jpg", "deer", "deer", "0.62", "1.00", "0.83"],
    ]
    story.append(table(eval_rows, [38, 30, 32, 22, 22, 26], font_size=7.4, align_center=(3, 4, 5)))
    story.append(Spacer(1, 2))
    story.append(callout(
        "6 / 6 TOP-1 IS A SMOKE CHECK, NOT AN ACCURACY CLAIM",
        "One licenced photograph per class, no train/test split, no night or IR strata. It proves the "
        "plumbing works end to end. A defensible evaluation requires a licenced camera-trap dataset "
        "with location-based splits; see the limitations section.",
        fill=colors.HexColor("#FBF4E2"), border=AMBER, title_color=colors.HexColor("#8A671E")))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 5 · GIS & risk
    story += section("GIS intelligence and the explainable risk score", "05 · Modules 2 & 3")
    story.append(P(
        "The map is the operational core. Forest and village polygons, camera stations, guard posts, "
        "clustered detections, gridded risk cells, alert coverage and inferred tracks are independent "
        "layers with filters, a legend and a click-through detail panel. Distance is measured to the "
        "nearest village <b>boundary</b>, not its centroid, so an edge-of-forest sighting is treated "
        "as genuinely close.", BODY))
    story += img(os.path.join(SHOTS, "03_gis_intelligence_map.png"), 132,
                 "Figure 3 — The live GIS page: layer controls, species/risk/time filters, 222 detections in the 21-day window, and risk cells with inline scores.")
    story += img(os.path.join(DIAGRAMS, "risk_model.png"), 158,
                 "Figure 4 — Risk model: five weighted evidence components, species multipliers, three output levels and configurable alert rules.")
    story.append(P(
        "Movement is a separate component worth 0.08, non-zero only when a camera sequence "
        "(≤24 h, ≤7 km, ≥3 points, ≥2 cameras) supports a direction toward a village. Tracks are "
        "labelled as inferred camera sequences, never GPS.", BODY))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 6 · response
    story += section("From alert to field response", "06 · Modules 4 & 5")
    story.append(P(
        "An alert is a task, not a notification. A detection at or above the configurable threshold "
        "(default 60) inside the alert radius (3.5 km) creates exactly one alert, lists every village "
        "inside that radius, records the score basis and assigns the nearest available guard. "
        "Duplicate alerts per detection are suppressed.", BODY))
    lifecycle = [
        ["Step", "Actor", "What is recorded"],
        ["Detection", "System", "Species, confidence, camera, timestamp, risk score and components"],
        ["Alert", "System", "Threshold, radius, affected villages, reason, synthetic-data flag"],
        ["Assign", "Admin / guard", "Guard id, actor, timestamp"],
        ["Acknowledge", "Guard", "Ownership, optional note, append-only audit event"],
        ["Respond", "Guard", "Response status, note, timestamp"],
        ["Resolve", "Guard", "Closure note and final state"],
    ]
    story.append(table(lifecycle, [27, 28, 115], font_size=7.8))
    story.append(Spacer(1, 4))

    shot_table = Table([[
        img(os.path.join(SHOTS, "05_risk_alerts.png"), 102,
            "Figure 5 — Alert queue, risk surfacing, engine configuration and the full lifecycle controls."),
        img(os.path.join(SHOTS, "06_forest_guard_panel.png"), 58,
            "Figure 6 — Guard board: scoped tasks, statuses and high-risk areas."),
    ]], colWidths=[109 * mm, 61 * mm])
    shot_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 4),
        ("LEFTPADDING", (1, 0), (1, 0), 4),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(shot_table)
    story.append(P(
        "RBAC is enforced in the API: a guard sees only their own board and cannot edit risk "
        "configuration; admins dispatch and inspect any guard. Notifications are simulated in-app — "
        "the interface says so, and no SMS or email is sent.", BODY))
    story.append(P("Who can do what", H2))
    rbac = [
        ["Role", "Scope", "Permitted actions"],
        ["Admin", "Entire range: all alerts, every guard board, risk configuration", "Dispatch, assign, acknowledge, respond, resolve, change or reset risk config, export analytics"],
        ["Guard", "Own assigned tasks, incidents, community inbox", "Acknowledge, respond and resolve own alerts; review reports and incidents"],
        ["Public", "Sanitised advisories and coarse village risk", "Read guidance, submit a report, check status by reference code"],
    ]
    story.append(table(rbac, [22, 70, 78], font_size=7.6))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 7 · community
    story += section("Community portal and the privacy boundary", "07 · Module 6")
    story.append(P(
        "The public portal is a different view of the same data, not a separate dataset. It "
        "publishes coarse advisories by village, safety guidance, a sighting/conflict report form "
        "with an optional image, and a reference-code status lookup. All of it works without a login.",
        BODY))

    community_table = Table([[
        img(os.path.join(SHOTS, "07_community_portal.png"), 100,
            "Figure 7 — Public portal: advisories, guidance and the reporting entry point."),
        img(os.path.join(SHOTS, "08_community_report_status.png"), 66,
            "Figure 8 — Report submission result and status check by reference code."),
    ]], colWidths=[104 * mm, 66 * mm])
    community_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 4),
        ("LEFTPADDING", (1, 0), (1, 0), 4),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(community_table)
    privacy = [
        ["Public payload", "Console payload"],
        ["Village names and coarse risk level", "Exact coordinates and camera station codes"],
        ["Advisory text and safety guidance", "Species confidence, bounding boxes and media"],
        ["Report reference code and status", "Reporter details and moderation fields"],
        ["Aggregated counts and trends", "Guard assignment, notes and audit events"],
    ]
    story.append(P("Server-side sanitisation", H2))
    story.append(table(privacy, [85, 85], font_size=8))
    story.append(Spacer(1, 3))
    story.append(P(
        "The community API never returns latitude, longitude or camera identifiers; automated tests "
        "assert their absence. Submission validation covers category, supported species, description "
        "length, coordinate pairing and image type/size. Reference codes use the form "
        "<font name='Consolas'>FG-YYYY-NNNN</font> and are checked for collisions.", BODY))
    story.append(P("Public report lifecycle", H2))
    story += bullets([
        "<b>Submit</b> — category (sighting or conflict), species, village, description, optional contact and photograph.",
        "<b>Validate</b> — supported species, description of at least 12 characters, paired coordinates, accepted image types and size.",
        "<b>Issue reference</b> — a collision-checked code such as <font name='Consolas'>FG-2026-9707</font> is returned immediately.",
        "<b>Triage</b> — the report appears in the guard-only inbox and can be marked pending, verified or closed with a note.",
        "<b>Status lookup</b> — the reporter checks progress with the code, without an account and without seeing sensitive locations.",
    ])
    story.append(PageBreak())

    # ------------------------------------------------------------------ 8 · verification
    story += section("Verification and testing", "08 · Quality")
    story.append(P(
        "The backend suite runs against a temporary SQLite database created per session, with "
        "the AI engine in demo mode. Tests never touch the demo database, download weights or need a "
        "GPU. The upload test asserts demo mode returns HTTP 503 and leaves record counts unchanged.",
        BODY))
    tests = [
        ["Suite", "Tests", "What is verified"],
        ["test_api_core.py", "9", "Health/meta, login and 401s, seed counts, detection filters, map layers, non-GPS tracks, demo upload 503, CSV export"],
        ["test_api_risk_alerts.py", "5", "Analytics totals, risk zones/exposure, config RBAC + temp-file writes, full alert lifecycle audit, filters/404"],
        ["test_api_guard_community.py", "9", "Admin dispatch vs scoped guard board, sanitised public payloads, report round trip and validation, guard-only incidents"],
        ["test_geospatial.py", "5", "Haversine, point-in-polygon, ring closure, threshold boundaries, explainable score bounds and weight sum"],
        ["Total", "28", "All passed on 11 November 2026 in 1.27 s (2 unrelated deprecation warnings)"],
    ]
    story.append(table(tests, [47, 12, 111], font_size=7.6, align_center=(1,)))
    story.append(Spacer(1, 4))
    story.append(P("Other checks actually performed", H2))
    story += bullets([
        "<b>Production build:</b> <font name='Consolas'>npm run build</font> succeeds with Vite 6.",
        "<b>Browser flows:</b> Playwright + Edge captured all ten screenshots from the live app, including a real tiger upload and a public report submission. No browser errors were reported.",
        "<b>Data consistency:</b> the upload precedes the dashboard captures, so the same 231 detections and 14 alerts appear on the overview, guard panel and analytics pages.",
        "<b>AI smoke evaluation:</b> the production engine was run over the six reference photos; raw JSON is stored in <font name='Consolas'>docs/references/</font>.",
        "<b>Configuration safety:</b> risk-config tests write to a temporary path; the repository's <font name='Consolas'>risk_config.json</font> was verified unchanged.",
    ])
    story.append(P(
        "Not covered: UI component unit tests, load/soak testing, accessibility audit, security "
        "penetration testing and evaluation on a labelled camera-trap dataset. These are explicit "
        "gaps, not implied passes.", SMALL))
    story.append(P("Deliverable verification", H2))
    artifacts = [
        ["Artefact", "Location", "Status"],
        ["Backend suite", "tests/", "28 passed in 1.27 s; isolated temp database"],
        ["Production bundle", "frontend/dist/", "Vite 6 build completed"],
        ["Screenshots", "docs/screenshots/", "10 PNG files captured from the running app"],
        ["Diagrams", "docs/diagrams/", "3 hand-authored SVGs rendered to PNG at 2×"],
        ["AI smoke output", "docs/references/ai_smoke_evaluation.json", "Recorded 11 Nov 2026 with caveats"],
        ["Report sources", "deliverables/build_deck.py · build_report.py", "Reproducible from repository assets"],
    ]
    story.append(table(artifacts, [36, 82, 52], font_size=7.5))
    story.append(PageBreak())

    # ------------------------------------------------------------------ 9 · limitations & close
    story += section("Limitations, roadmap and how to run it", "09 · Close")
    limits = [
        ["Area", "Current limit", "Consequence"],
        ["Classifier", "Zero-shot CLIP, six labels, no fine-tuning", "Will confuse similar species and struggle with night/IR frames"],
        ["Evaluation", "Six reference photos, one per class", "No accuracy or field-performance claim is possible"],
        ["Storage", "SQLite, no spatial index", "Single-node only; polygons parsed in Python"],
        ["Tracking", "Camera-sequence association, no individual IDs", "Movement is a coarse, inferred direction"],
        ["Dispatch", "Simulated in-app notification", "No real responder SLA or SMS delivery"],
        ["Landscape", "Illustrative Seoni-area geometry and synthetic population", "Exposure figures illustrate the method, not census truth"],
    ]
    story.append(table(limits, [26, 66, 78], font_size=7.8))
    story.append(P("Next steps, in priority order", H2))
    story += bullets([
        "<b>1 · Measurement.</b> Licence a regional camera-trap dataset, split by camera location, and report per-species precision/recall at a fixed threshold, stratified by day/night and occlusion.",
        "<b>2 · Spatial infrastructure.</b> Move to PostgreSQL + PostGIS with spatial indexes, then add a task queue so inference scales beyond one process.",
        "<b>3 · Real response.</b> Integrate an SMS/radio gateway with delivery receipts and acknowledgement SLAs; add an offline-first guard client.",
        "<b>4 · Governance.</b> Add audit export, data-retention rules and role-scoped media access before any pilot deployment.",
    ])
    story.append(P("Reproduce the build", H2))
    code_rows = [[
        P("python -m venv .venv &amp;&amp; source .venv/bin/activate<br/>"
          "pip install -r requirements.txt<br/>"
          "python -m uvicorn backend.main:app --port 8000<br/><br/>"
          "cd frontend &amp;&amp; npm install &amp;&amp; npm run dev<br/>"
          "python -m pytest -q", CODE)
    ]]
    code_table = Table(code_rows, colWidths=[BODY_W])
    code_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOREST),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(code_table)
    story.append(Spacer(1, 3))
    story.append(P(
        "Open <font name='Consolas'>http://127.0.0.1:5173</font> and sign in as "
        "<b>admin@forestguard.ai / forest123</b> (admin) or <b>guard@forestguard.ai / guard123</b> "
        "(guard). The community portal is public at <font name='Consolas'>/community</font>. "
        "Setup, API, testing, demo script, AI limits and image credits live in <font name='Consolas'>docs/</font>.", BODY))
    story.append(P(
        "Imagery is CC BY-SA / CC BY-SA-compatible from Wikimedia Commons and individually attributed "
        "in <font name='Consolas'>docs/image-credits.md</font>; basemap © OpenStreetMap contributors. "
        "Model weights are excluded from the repository and must be obtained separately. This report "
        "describes a demonstration system, not a validated or deployed service.", SMALL))

    doc.build(story)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
