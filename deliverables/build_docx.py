"""Build the editable Forest Guard AI DOCX report.

Run:  python deliverables/build_docx.py

The document mirrors the PDF report: same sections, screenshots, diagrams and
tables, but with real Word styles so every heading, table and caption is editable.
"""
from __future__ import annotations

import os
import re

from PIL import Image as PILImage
from docx import Document
from docx.enum.table import WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
DIAGRAMS = os.path.join(ROOT, "docs", "diagrams")
OUT = os.path.join(ROOT, "deliverables", "Forest_Guard_AI_Report.docx")
COVER = os.path.join(ROOT, "deliverables", "_docx_cover.jpg")

FOREST = "0C2418"
FOREST_700 = "19452F"
FOREST_500 = "2F7250"
LIME = "C4E87A"
SAND = "F4F1E8"
INK = "17211B"
MUTED = "5C665C"
LINE = "D8D1BE"
CLAY = "B85C38"
AMBER = "D9A441"
PALE_GREEN = "F1F5EC"
PALE_AMBER = "FBF4E2"

BODY_W = 172  # mm, A4 minus 19 mm margins


# --------------------------------------------------------------------------- xml helpers
def hex_rgb(value: str) -> RGBColor:
    return RGBColor.from_string(value)


def set_run_font(run, name: str) -> None:
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rpr.get_or_add_rFonts().set(qn("w:eastAsia"), name)


def shade_cell(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_table_borders(table, color: str = LINE, size: int = 4) -> None:
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tbl_pr.append(borders)


def no_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tbl_pr.append(borders)


def set_cell_margins(table, top=45, bottom=45, left=100, right=100) -> None:
    tbl_pr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for name, value in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{name}")
        el.set(qn("w:w"), str(value))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tbl_pr.append(mar)


def set_cell_border(cell, *, edge="left", color=FOREST_500, size=18) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    el = OxmlElement(f"w:{edge}")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(size))
    el.set(qn("w:space"), "0")
    el.set(qn("w:color"), color)
    borders.append(el)


def repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    tr_pr.append(el)


def no_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    el.set(qn("w:val"), "true")
    tr_pr.append(el)


def paragraph_bottom_rule(paragraph, color: str = LINE, size: int = 8) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "6")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    p_pr.append(borders)


def add_field(paragraph, instruction: str) -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = f" {instruction} "
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(sep)
    run._r.append(text)
    run._r.append(end)


# --------------------------------------------------------------------------- text helpers
TOKEN = re.compile(r"(<b>|</b>|<i>|</i>|<font name='Consolas'>|</font>|<br/>)")


def add_rich(paragraph, html: str, *, size: float | None = None,
             color: str | None = None, bold=False, italic=False) -> None:
    bold_on, italic_on, mono_on = bold, italic, False
    for token in TOKEN.split(html):
        if not token:
            continue
        if token == "<b>":
            bold_on = True
        elif token == "</b>":
            bold_on = bold
        elif token == "<i>":
            italic_on = True
        elif token == "</i>":
            italic_on = italic
        elif token == "<font name='Consolas'>":
            mono_on = True
        elif token == "</font>":
            mono_on = False
        elif token == "<br/>":
            paragraph.add_run().add_break()
        else:
            text = token.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            run = paragraph.add_run(text)
            run.bold = bold_on
            run.italic = italic_on
            set_run_font(run, "Consolas" if mono_on else "Segoe UI")
            if size:
                run.font.size = Pt(size)
            if color:
                run.font.color.rgb = hex_rgb(color)


def para(doc, html="", *, size=9.5, color=INK, space_after=6, space_before=0,
         line=1.3, bold=False, italic=False, align=None):
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.space_after = Pt(space_after)
    fmt.space_before = Pt(space_before)
    fmt.line_spacing = line
    if align is not None:
        p.alignment = align
    if html:
        add_rich(p, html, size=size, color=color, bold=bold, italic=italic)
    return p


def kicker(doc, text: str) -> None:
    p = para(doc, text.upper(), size=7.5, color=CLAY, bold=True, space_after=1, line=1.0)
    for run in p.runs:
        set_run_font(run, "Segoe UI")


def heading(doc, text: str, level=1) -> None:
    p = doc.add_paragraph(style="Heading 1" if level == 1 else "Heading 2")
    fmt = p.paragraph_format
    fmt.keep_with_next = True
    if level == 1:
        fmt.space_before = Pt(0)
        fmt.space_after = Pt(6)
        fmt.line_spacing = 1.0
        run = p.add_run(text)
        set_run_font(run, "Georgia")
        run.bold = True
        run.font.size = Pt(21)
        run.font.color.rgb = hex_rgb(FOREST)
        paragraph_bottom_rule(p, LINE, 8)
        fmt.space_after = Pt(10)
    else:
        fmt.space_before = Pt(10)
        fmt.space_after = Pt(4)
        fmt.line_spacing = 1.0
        run = p.add_run(text)
        set_run_font(run, "Georgia")
        run.bold = True
        run.font.size = Pt(13)
        run.font.color.rgb = hex_rgb(FOREST)


def section(doc, title: str, kick: str) -> None:
    kicker(doc, kick)
    heading(doc, title, 1)


def bullets(doc, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph()
        fmt = p.paragraph_format
        fmt.left_indent = Mm(5)
        fmt.first_line_indent = Mm(-5)
        fmt.space_after = Pt(3)
        fmt.line_spacing = 1.3
        run = p.add_run("•  ")
        set_run_font(run, "Segoe UI")
        run.font.size = Pt(9.5)
        run.font.color.rgb = hex_rgb(FOREST_500)
        run.bold = True
        add_rich(p, item, size=9.5, color=INK)


def add_media(doc, path: str, width_mm: float, caption: str | None = None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.keep_with_next = bool(caption)
    p.add_run().add_picture(path, width=Mm(width_mm))
    if caption:
        cap = doc.add_paragraph()
        cap.paragraph_format.space_before = Pt(3)
        cap.paragraph_format.space_after = Pt(8)
        cap.paragraph_format.line_spacing = 1.1
        run = cap.add_run(caption)
        set_run_font(run, "Segoe UI")
        run.italic = True
        run.font.size = Pt(7.5)
        run.font.color.rgb = hex_rgb(MUTED)


def media_row(doc, left_path, left_w, left_cap, right_path, right_w, right_cap) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    no_borders(table)
    set_cell_margins(table, top=0, bottom=0, left=0, right=0)
    table.autofit = False
    table.columns[0].width = Mm(left_w + 4)
    table.columns[1].width = Mm(BODY_W - left_w - 4)
    for cell, width in zip(table.rows[0].cells, (left_w + 4, BODY_W - left_w - 4)):
        cell.width = Mm(width)
    for cell, path, width, caption, space in (
        (table.rows[0].cells[0], left_path, left_w, left_cap, 4),
        (table.rows[0].cells[1], right_path, right_w, right_cap, 0),
    ):
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(0)
        p.add_run().add_picture(path, width=Mm(width))
        cap = cell.add_paragraph()
        cap.paragraph_format.space_before = Pt(3)
        cap.paragraph_format.space_after = Pt(2)
        cap.paragraph_format.line_spacing = 1.1
        run = cap.add_run(caption)
        set_run_font(run, "Segoe UI")
        run.italic = True
        run.font.size = Pt(7.5)
        run.font.color.rgb = hex_rgb(MUTED)


def data_table(doc, rows: list[list[str]], widths: list[float], *, font=8.0,
               align_center: tuple[int, ...] = ()) -> None:
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    set_table_borders(table, LINE, 4)
    set_cell_margins(table, top=45, bottom=45, left=90, right=90)
    for index, width in enumerate(widths):
        table.columns[index].width = Mm(width)
    for r_index, row in enumerate(rows):
        no_split(table.rows[r_index])
        for c_index, value in enumerate(row):
            cell = table.cell(r_index, c_index)
            cell.width = Mm(widths[c_index])
            p = cell.paragraphs[0]
            fmt = p.paragraph_format
            fmt.space_before = Pt(0)
            fmt.space_after = Pt(0)
            fmt.line_spacing = 1.12
            if c_index in align_center:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            add_rich(p, value, size=font,
                     color="FFFFFF" if r_index == 0 else INK,
                     bold=r_index == 0)
            if r_index == 0:
                shade_cell(cell, FOREST)
            elif r_index % 2 == 0:
                shade_cell(cell, "F7F5EE")
    repeat_header(table.rows[0])
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(4)
    spacer.paragraph_format.line_spacing = 1.0
    spacer.add_run("").font.size = Pt(2)


def callout(doc, title: str, body: str, *, fill=PALE_GREEN, accent=FOREST_500,
            title_color=FOREST) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    no_borders(table)
    table.columns[0].width = Mm(BODY_W)
    cell = table.cell(0, 0)
    cell.width = Mm(BODY_W)
    shade_cell(cell, fill)
    set_cell_border(cell, edge="left", color=accent, size=18)
    set_cell_margins(table, top=110, bottom=110, left=220, right=220)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.05
    run = p.add_run(title)
    set_run_font(run, "Segoe UI")
    run.bold = True
    run.font.size = Pt(8)
    run.font.color.rgb = hex_rgb(title_color)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    p2.paragraph_format.line_spacing = 1.22
    add_rich(p2, body, size=8.4, color=MUTED)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(4)
    spacer.paragraph_format.line_spacing = 1.0
    spacer.add_run("").font.size = Pt(2)


def code_block(doc, lines: list[str]) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    no_borders(table)
    table.columns[0].width = Mm(BODY_W)
    cell = table.cell(0, 0)
    cell.width = Mm(BODY_W)
    shade_cell(cell, FOREST)
    set_cell_margins(table, top=140, bottom=140, left=200, right=200)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.3
    for index, line in enumerate(lines):
        run = p.add_run(line)
        set_run_font(run, "Consolas")
        run.font.size = Pt(8)
        run.font.color.rgb = hex_rgb("DCECE1")
        if index < len(lines) - 1:
            run.add_break()
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(4)
    spacer.add_run("").font.size = Pt(2)


def page_break(doc) -> None:
    doc.add_page_break()


def make_cover_band() -> None:
    """Crop the forest photograph to the 172 x 70 mm cover band."""
    target_w, target_h = 1800, 733
    source = os.path.join(ROOT, "frontend", "public", "images", "forest.jpg")
    with PILImage.open(source) as image:
        image = image.convert("RGB")
        scale = max(target_w / image.width, target_h / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)))
        left = (resized.width - target_w) // 2
        top = (resized.height - target_h) // 2
        resized.crop((left, top, left + target_w, top + target_h)).save(
            COVER, "JPEG", quality=88)


# --------------------------------------------------------------------------- document
def build() -> None:
    make_cover_band()
    doc = Document()

    # Base styles
    normal = doc.styles["Normal"]
    normal.font.name = "Segoe UI"
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = hex_rgb(INK)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Segoe UI")

    section_ = doc.sections[0]
    section_.page_width = Mm(210)
    section_.page_height = Mm(297)
    section_.left_margin = Mm(19)
    section_.right_margin = Mm(19)
    section_.top_margin = Mm(20)
    section_.bottom_margin = Mm(17)
    section_.header_distance = Mm(8)
    section_.footer_distance = Mm(8)
    section_.different_first_page_header_footer = True

    # Header
    header = section_.header
    hp = header.paragraphs[0]
    hp.paragraph_format.space_after = Pt(2)
    hp.paragraph_format.tab_stops.add_tab_stop(Mm(BODY_W), WD_TAB_ALIGNMENT.RIGHT)
    run = hp.add_run("FOREST GUARD AI")
    set_run_font(run, "Segoe UI")
    run.bold = True
    run.font.size = Pt(7)
    run.font.color.rgb = hex_rgb(FOREST_500)
    run = hp.add_run("\tTechnical report  ·  11 November 2026")
    set_run_font(run, "Segoe UI")
    run.font.size = Pt(7)
    run.font.color.rgb = hex_rgb(MUTED)
    paragraph_bottom_rule(hp, LINE, 4)

    # Footer
    footer = section_.footer
    fp = footer.paragraphs[0]
    fp.paragraph_format.space_before = Pt(2)
    fp.paragraph_format.tab_stops.add_tab_stop(Mm(BODY_W), WD_TAB_ALIGNMENT.RIGHT)
    run = fp.add_run("Synthetic demonstration data  ·  local CPU inference  ·  not a field-validated system\tPage ")
    set_run_font(run, "Segoe UI")
    run.font.size = Pt(7)
    run.font.color.rgb = hex_rgb(MUTED)
    add_field(fp, "PAGE")
    run = fp.add_run(" of ")
    set_run_font(run, "Segoe UI")
    run.font.size = Pt(7)
    run.font.color.rgb = hex_rgb(MUTED)
    add_field(fp, "NUMPAGES")
    for r in fp.runs:
        r.font.size = Pt(7)
        r.font.color.rgb = hex_rgb(MUTED)
        set_run_font(r, "Segoe UI")

    # ------------------------------------------------------------------ cover
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    p.add_run().add_picture(COVER, width=Mm(BODY_W))

    cover_table = doc.add_table(rows=1, cols=1)
    cover_table.autofit = False
    no_borders(cover_table)
    cover_table.columns[0].width = Mm(BODY_W)
    cell = cover_table.cell(0, 0)
    cell.width = Mm(BODY_W)
    shade_cell(cell, FOREST)
    set_cell_margins(cover_table, top=420, bottom=260, left=560, right=560)
    cover_table.rows[0].height = Mm(170)
    cover_table.rows[0].height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST

    cp = cell.paragraphs[0]
    cp.paragraph_format.space_after = Pt(24)
    cp.paragraph_format.line_spacing = 1.0
    run = cp.add_run("FOREST GUARD AI  ·  TECHNICAL REPORT")
    set_run_font(run, "Segoe UI")
    run.bold = True
    run.font.size = Pt(8.5)
    run.font.color.rgb = hex_rgb(LIME)

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.04
    for line in ("Protecting Forests.", "Preventing Conflict.", "Saving Lives."):
        run = p.add_run(line)
        set_run_font(run, "Georgia")
        run.bold = True
        run.font.size = Pt(27)
        run.font.color.rgb = hex_rgb("FFFFFF")
        if line != "Saving Lives.":
            run.add_break()

    p = cell.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(16)
    p.paragraph_format.line_spacing = 1.35
    run = p.add_run("AI-assisted wildlife monitoring, explainable GIS risk,\nguard response and a privacy-safe community portal.")
    set_run_font(run, "Segoe UI")
    run.font.size = Pt(10.5)
    run.font.color.rgb = hex_rgb("B4D3BF")

    p = cell.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(18)
    paragraph_bottom_rule(p, FOREST_500, 8)
    p.add_run("").font.size = Pt(1)

    for text, size, color in (
        ("Hackathon build  ·  11 November 2026", 8.6, "DCECE1"),
        ("Single-node  ·  CPU inference  ·  synthetic demo dataset", 8.6, "DCECE1"),
        ("Real local inference. Seeded observations are synthetic and labelled.", 7.6, "7F9C86"),
    ):
        p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(5)
        p.paragraph_format.line_spacing = 1.0
        run = p.add_run(text)
        set_run_font(run, "Segoe UI")
        run.font.size = Pt(size)
        run.font.color.rgb = hex_rgb(color)

    p = cell.add_paragraph()
    p.paragraph_format.space_before = Pt(30)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run("REAL INFERENCE  ·  NO LIVE FEEDS  ·  NO GPS CLAIMS")
    set_run_font(run, "Segoe UI")
    run.bold = True
    run.font.size = Pt(7.2)
    run.font.color.rgb = hex_rgb(LIME)

    page_break(doc)

    # ------------------------------------------------------------------ 1 summary
    section(doc, "Executive summary", "01 · Overview")
    para(doc,
         "Forest Guard AI is a working, local-first platform for human–wildlife conflict prevention. "
         "A detection is analysed on the machine, attached to a real camera station, scored against "
         "village boundaries with an explainable model, converted into an assigned guard task, and "
         "republished to the public as a coarse advisory that never reveals the animal's location. "
         "It was built for a solo-student hackathon, and every screen is wired to a live API.",
         size=11, color="3F4A40", space_after=8, line=1.38)
    para(doc,
         "The honest boundary matters. Villages, cameras, guards, detections, incidents and alerts in "
         "the shipped dataset are <b>synthetic and labelled</b>. Uploaded images and short videos are "
         "<b>genuinely analysed</b> by YOLO-World v2 and CLIP on CPU. No live feeds, GPS collars, "
         "government systems or cloud inference are involved, and no field accuracy is claimed.")

    data_table(doc, [
        ["Area", "What was delivered", "Evidence"],
        ["Platform", "FastAPI + SQLAlchemy/SQLite API; React 18 + Vite SPA with eight pages", "28 API/domain tests; production build"],
        ["AI", "Two-stage local detection (YOLO-World v2 + CLIP ViT-B/32), image and 5-frame video", "Genuine upload captured in screenshot 02"],
        ["GIS", "Leaflet map with 8 layers, clustering, filters, detail panel and risk cells", "Screenshot 03; map payload tests"],
        ["Risk", "Configurable weighted score with five evidence components and species multipliers", "Risk diagram; boundary tests"],
        ["Response", "Alert lifecycle, guard assignment, RBAC and append-only audit events", "Lifecycle test; screenshot 05"],
        ["Community", "Public advisories, reports with optional image, reference-code status check", "Sanitisation tests; screenshot 07–08"],
        ["Demo data", "5 villages, 12 cameras, 6 guards, 230 detections, 18 tracks, 13 alerts, 6 incidents", "Deterministic seed on first boot"],
    ], [23, 95, 54], font=7.7)

    callout(doc, "STATUS AT A GLANCE",
            "Built and verified: all six modules, eight pages, 28 backend tests, production bundle, "
            "10 live screenshots and 3 architecture diagrams. Not built or not claimed: live camera "
            "integration, GPS tracking, real SMS/email dispatch, field accuracy, scale-out infrastructure.")

    add_media(doc, os.path.join(SHOTS, "01_overview_dashboard.png"), 116,
              "The operations console at a glance. Figures on every page come from the same seeded dataset, and the demo-data badge is visible throughout.")
    page_break(doc)

    # ------------------------------------------------------------------ 2 problem
    section(doc, "The problem and the design response", "02 · Context")
    para(doc,
         "Forest teams already collect camera images, patrol notes, incident logs and village calls. "
         "The binding constraint is not a lack of data — it is the time and judgement needed to turn "
         "fragmented records into one defensible action.", size=11, color="3F4A40", line=1.38)
    para(doc,
         "Four operational gaps shaped the product: sightings arrive late; maps and records live in "
         "different tools; warnings are broadcast to everyone or no one; and community reports "
         "disappear without a trace. Each maps to a module rather than a dashboard widget.")

    heading(doc, "Design principles", 2)
    data_table(doc, [
        ["Principle", "How it is enforced"],
        ["Honesty", "Synthetic records carry demo badges and API flags. Uploads return a real result or a 503 — never a fabricated one."],
        ["Explainability", "Every alert stores its score components, species weight, distance basis and a written reason."],
        ["Privacy by architecture", "Public payloads are sanitised server-side; coordinates and camera codes never reach the browser."],
        ["Local-first", "No cloud inference or external data calls. OpenStreetMap is used only for basemap tiles."],
        ["Reproducibility", "A fixed random seed generates the same landscape and history on every reset."],
        ["Honest movement", "Tracks require ≥3 detections across ≥2 cameras within 24 h and 7 km; GPS is never implied."],
    ], [38, 134], font=8)

    heading(doc, "Explicit non-goals", 2)
    bullets(doc, [
        "No live camera feeds, CCTV integration or government surveillance access.",
        "No GPS telemetry, animal collars or individual re-identification.",
        "No real dispatch channel: guard notification is simulated in-app and labelled.",
        "No claim of field accuracy, deployment, adoption or measured impact.",
        "No public exposure of sensitive wildlife locations.",
    ])

    callout(doc, "THE CORE IDEA",
            "A nearby sighting and a confirmed approach are different evidence. The product shows "
            "proximity, recency, frequency, incidents and movement separately, so a high score means "
            "“verify this soon” — not “a conflict will occur”.")

    heading(doc, "The evidence chain", 2)
    data_table(doc, [
        ["Stage", "Question answered", "Stored artefact"],
        ["Frame", "What was seen, and how sure is the model?", "Annotated media, species, confidence, bounding box"],
        ["Place", "Which station and how far from a village?", "Camera coordinates, boundary distance"],
        ["Risk", "Why is it urgent?", "Components, weights, score, level, written basis"],
        ["Alert", "Who should act, and where?", "Affected villages, assigned guard, timestamp"],
        ["Response", "What happened?", "Acknowledge/respond/resolve events with actor and note"],
    ], [22, 66, 84], font=7.7)
    page_break(doc)

    # ------------------------------------------------------------------ 3 architecture
    section(doc, "System architecture", "03 · Engineering")
    para(doc,
         "A React single-page client talks to a FastAPI JSON API. The API owns authentication, "
         "domain services, media serving and CSV export. The AI engine is loaded lazily on the first "
         "upload and stays resident. SQLite is the database of record; the study area, village "
         "boundaries and risk configuration are files in the repository.")
    add_media(doc, os.path.join(DIAGRAMS, "system_architecture.png"), 170,
              "Figure 1 — Single-node architecture. The public portal and the console read the same data through different serializers.")
    data_table(doc, [
        ["Layer", "Technology", "Responsibility"],
        ["Client", "React 18 · Vite 6 · Tailwind · Leaflet 1.9 · Recharts", "Eight pages, map layers, forms, filters, charts"],
        ["API", "FastAPI · Pydantic v2 · SQLAlchemy 2.0", "Auth, RBAC, validation, domain endpoints, CSV export"],
        ["Domain", "Pure-Python services", "Risk scoring, alert sync, tracking, seeding, serializers"],
        ["AI", "PyTorch · YOLO-World v2 · CLIP ViT-B/32", "Localisation, species scoring, annotation"],
        ["Data", "SQLite (WAL) · GeoJSON · media store", "Records, boundaries, risk config, uploads"],
    ], [22, 70, 80], font=7.8)
    para(doc,
         "Routers stay thin and services own the logic. The privacy boundary is implemented in "
         "serializers, not in the client: public endpoints physically omit coordinates, camera "
         "identifiers and detection media. Tests assert the absence of those keys, so a future UI "
         "change cannot accidentally leak them.")
    page_break(doc)

    # ------------------------------------------------------------------ 4 AI
    section(doc, "AI detection: local, conservative, bounded", "04 · Module 1")
    para(doc,
         "The engine uses two off-the-shelf models on CPU, with no fine-tuning. YOLO-World v2 is "
         "configured with the single open-vocabulary class <i>animal</i>; each proposed crop is then "
         "scored by CLIP against three prompts per species for six regional species, plus negative "
         "prompts for empty forest, vehicles and people. If the negative-prompt mass dominates, the "
         "crop is vetoed to <i>unidentified</i> — a wrong dangerous-species label is worse than an "
         "honest “verify this frame”.")
    data_table(doc, [
        ["Decision rule", "Default", "Effect"],
        ["Detector confidence", "0.15", "Boxes below the floor are dropped"],
        ["Minimum box area", "0.8 % of frame", "Rejects tiny spurious boxes"],
        ["Species floor", "0.45", "Weak crops become “unidentified”, not a forced species"],
        ["Combined floor", "0.50", "0.55 × species + 0.45 × detector"],
        ["Full-frame path", "0.62", "Separate floor when a crop fills the frame"],
        ["Box cap", "6 per frame", "After IoU de-duplication at 0.55"],
        ["Video sampling", "up to 5 frames", "Independent frames — no temporal tracking"],
    ], [42, 26, 104], font=7.6)
    add_media(doc, os.path.join(SHOTS, "02_live_monitoring.png"), 92,
              "Figure 2 — A genuine tiger upload in the running app: annotated result, 71 % species confidence, stored recognition #231, risk 86 (high).")
    heading(doc, "What the evaluation does and does not show", 2)
    data_table(doc, [
        ["Reference image", "Expected", "Predicted", "Detector", "Species", "Overall"],
        ["tiger.jpg", "tiger", "tiger", "0.41", "0.97", "0.71"],
        ["leopard.jpg", "leopard", "leopard", "0.45", "1.00", "0.75"],
        ["elephant.jpg", "elephant", "elephant", "0.66", "1.00", "0.85"],
        ["bear.jpg", "sloth bear", "sloth bear", "0.80", "0.99", "0.90"],
        ["boar.jpg", "wild boar", "wild boar", "0.59", "1.00", "0.81"],
        ["deer.jpg", "deer", "deer", "0.62", "1.00", "0.83"],
    ], [38, 30, 32, 22, 22, 28], font=7.6, align_center=(3, 4, 5))
    callout(doc, "6 / 6 TOP-1 IS A SMOKE CHECK, NOT AN ACCURACY CLAIM",
            "One licenced photograph per class, no train/test split, no night or IR strata. It proves the "
            "plumbing works end to end. A defensible evaluation requires a licenced camera-trap dataset "
            "with location-based splits; see the limitations section.",
            fill=PALE_AMBER, accent=AMBER, title_color="8A671E")
    page_break(doc)

    # ------------------------------------------------------------------ 5 GIS & risk
    section(doc, "GIS intelligence and the explainable risk score", "05 · Modules 2 & 3")
    para(doc,
         "The map is the operational core. Forest and village polygons, camera stations, guard posts, "
         "clustered detections, gridded risk cells, alert coverage and inferred tracks are independent "
         "layers with filters, a legend and a click-through detail panel. Distance is measured to the "
         "nearest village <b>boundary</b>, not its centroid, so an edge-of-forest sighting is treated "
         "as genuinely close.")
    add_media(doc, os.path.join(SHOTS, "03_gis_intelligence_map.png"), 128,
              "Figure 3 — The live GIS page: layer controls, species/risk/time filters, 222 detections in the 21-day window, and risk cells with inline scores.")
    add_media(doc, os.path.join(DIAGRAMS, "risk_model.png"), 156,
              "Figure 4 — Risk model: five weighted evidence components, species multipliers, three output levels and configurable alert rules.")
    para(doc,
         "Movement is a separate component worth 0.08, non-zero only when a camera sequence "
         "(≤24 h, ≤7 km, ≥3 points, ≥2 cameras) supports a direction toward a village. Tracks are "
         "labelled as inferred camera sequences, never GPS.")
    page_break(doc)

    # ------------------------------------------------------------------ 6 response
    section(doc, "From alert to field response", "06 · Modules 4 & 5")
    para(doc,
         "An alert is a task, not a notification. A detection at or above the configurable threshold "
         "(default 60) inside the alert radius (3.5 km) creates exactly one alert, lists every village "
         "inside that radius, records the score basis and assigns the nearest available guard. "
         "Duplicate alerts per detection are suppressed.")
    data_table(doc, [
        ["Step", "Actor", "What is recorded"],
        ["Detection", "System", "Species, confidence, camera, timestamp, risk score and components"],
        ["Alert", "System", "Threshold, radius, affected villages, reason, synthetic-data flag"],
        ["Assign", "Admin / guard", "Guard id, actor, timestamp"],
        ["Acknowledge", "Guard", "Ownership, optional note, append-only audit event"],
        ["Respond", "Guard", "Response status, note, timestamp"],
        ["Resolve", "Guard", "Closure note and final state"],
    ], [27, 28, 117], font=7.9)
    media_row(doc,
              os.path.join(SHOTS, "05_risk_alerts.png"), 100,
              "Figure 5 — Alert queue, risk surfacing, engine configuration and the full lifecycle controls.",
              os.path.join(SHOTS, "06_forest_guard_panel.png"), 62,
              "Figure 6 — Guard board: scoped tasks, statuses and high-risk areas.")
    para(doc,
         "RBAC is enforced in the API: a guard sees only their own board and cannot edit risk "
         "configuration; admins dispatch and inspect any guard. Notifications are simulated in-app — "
         "the interface says so, and no SMS or email is sent.")
    heading(doc, "Who can do what", 2)
    data_table(doc, [
        ["Role", "Scope", "Permitted actions"],
        ["Admin", "Entire range: all alerts, every guard board, risk configuration", "Dispatch, assign, acknowledge, respond, resolve, change or reset risk config, export analytics"],
        ["Guard", "Own assigned tasks, incidents, community inbox", "Acknowledge, respond and resolve own alerts; review reports and incidents"],
        ["Public", "Sanitised advisories and coarse village risk", "Read guidance, submit a report, check status by reference code"],
    ], [22, 70, 80], font=7.7)
    page_break(doc)

    # ------------------------------------------------------------------ 7 community
    section(doc, "Community portal and the privacy boundary", "07 · Module 6")
    para(doc,
         "The public portal is a different view of the same data, not a separate dataset. It "
         "publishes coarse advisories by village, safety guidance, a sighting/conflict report form "
         "with an optional image, and a reference-code status lookup. All of it works without a login.")
    media_row(doc,
              os.path.join(SHOTS, "07_community_portal.png"), 100,
              "Figure 7 — Public portal: advisories, guidance and the reporting entry point.",
              os.path.join(SHOTS, "08_community_report_status.png"), 64,
              "Figure 8 — Report submission result and status check by reference code.")
    heading(doc, "Server-side sanitisation", 2)
    data_table(doc, [
        ["Public payload", "Console payload"],
        ["Village names and coarse risk level", "Exact coordinates and camera station codes"],
        ["Advisory text and safety guidance", "Species confidence, bounding boxes and media"],
        ["Report reference code and status", "Reporter details and moderation fields"],
        ["Aggregated counts and trends", "Guard assignment, notes and audit events"],
    ], [85, 87], font=8)
    para(doc,
         "The community API never returns latitude, longitude or camera identifiers; automated tests "
         "assert their absence. Submission validation covers category, supported species, description "
         "length, coordinate pairing and image type/size. Reference codes use the form "
         "<font name='Consolas'>FG-YYYY-NNNN</font> and are checked for collisions.")
    heading(doc, "Public report lifecycle", 2)
    bullets(doc, [
        "<b>Submit</b> — category (sighting or conflict), species, village, description, optional contact and photograph.",
        "<b>Validate</b> — supported species, description of at least 12 characters, paired coordinates, accepted image types and size.",
        "<b>Issue reference</b> — a collision-checked code such as <font name='Consolas'>FG-2026-9707</font> is returned immediately.",
        "<b>Triage</b> — the report appears in the guard-only inbox and can be marked pending, verified or closed with a note.",
        "<b>Status lookup</b> — the reporter checks progress with the code, without an account and without seeing sensitive locations.",
    ])
    page_break(doc)

    # ------------------------------------------------------------------ 8 verification
    section(doc, "Verification and testing", "08 · Quality")
    para(doc,
         "The backend suite runs against a temporary SQLite database created per session, with "
         "the AI engine in demo mode. Tests never touch the demo database, download weights or need a "
         "GPU. The upload test asserts demo mode returns HTTP 503 and leaves record counts unchanged.")
    data_table(doc, [
        ["Suite", "Tests", "What is verified"],
        ["test_api_core.py", "9", "Health/meta, login and 401s, seed counts, detection filters, map layers, non-GPS tracks, demo upload 503, CSV export"],
        ["test_api_risk_alerts.py", "5", "Analytics totals, risk zones/exposure, config RBAC + temp-file writes, full alert lifecycle audit, filters/404"],
        ["test_api_guard_community.py", "9", "Admin dispatch vs scoped guard board, sanitised public payloads, report round trip and validation, guard-only incidents"],
        ["test_geospatial.py", "5", "Haversine, point-in-polygon, ring closure, threshold boundaries, explainable score bounds and weight sum"],
        ["Total", "28", "All passed on 11 November 2026 in 1.27 s (2 unrelated deprecation warnings)"],
    ], [47, 13, 112], font=7.7, align_center=(1,))
    heading(doc, "Other checks actually performed", 2)
    bullets(doc, [
        "<b>Production build:</b> <font name='Consolas'>npm run build</font> succeeds with Vite 6.",
        "<b>Browser flows:</b> Playwright + Edge captured all ten screenshots from the live app, including a real tiger upload and a public report submission. No browser errors were reported.",
        "<b>Data consistency:</b> the upload precedes the dashboard captures, so the same 231 detections and 14 alerts appear on the overview, guard panel and analytics pages.",
        "<b>AI smoke evaluation:</b> the production engine was run over the six reference photos; raw JSON is stored in <font name='Consolas'>docs/references/</font>.",
        "<b>Configuration safety:</b> risk-config tests write to a temporary path; the repository's <font name='Consolas'>risk_config.json</font> was verified unchanged.",
    ])
    para(doc,
         "Not covered: UI component unit tests, load/soak testing, accessibility audit, security "
         "penetration testing and evaluation on a labelled camera-trap dataset. These are explicit "
         "gaps, not implied passes.", size=8, color=MUTED, space_before=2)
    heading(doc, "Deliverable verification", 2)
    data_table(doc, [
        ["Artefact", "Location", "Status"],
        ["Backend suite", "tests/", "28 passed in 1.27 s; isolated temp database"],
        ["Production bundle", "frontend/dist/", "Vite 6 build completed"],
        ["Screenshots", "docs/screenshots/", "10 PNG files captured from the running app"],
        ["Diagrams", "docs/diagrams/", "3 hand-authored SVGs rendered to PNG at 2×"],
        ["AI smoke output", "docs/references/ai_smoke_evaluation.json", "Recorded 11 Nov 2026 with caveats"],
        ["Report sources", "deliverables/build_deck.py · build_report.py · build_docx.py", "Reproducible from repository assets"],
    ], [36, 86, 50], font=7.6)
    page_break(doc)

    # ------------------------------------------------------------------ 9 close
    section(doc, "Limitations, roadmap and how to run it", "09 · Close")
    data_table(doc, [
        ["Area", "Current limit", "Consequence"],
        ["Classifier", "Zero-shot CLIP, six labels, no fine-tuning", "Will confuse similar species and struggle with night/IR frames"],
        ["Evaluation", "Six reference photos, one per class", "No accuracy or field-performance claim is possible"],
        ["Storage", "SQLite, no spatial index", "Single-node only; polygons parsed in Python"],
        ["Tracking", "Camera-sequence association, no individual IDs", "Movement is a coarse, inferred direction"],
        ["Dispatch", "Simulated in-app notification", "No real responder SLA or SMS delivery"],
        ["Landscape", "Illustrative Seoni-area geometry and synthetic population", "Exposure figures illustrate the method, not census truth"],
    ], [26, 66, 80], font=7.9)
    heading(doc, "Next steps, in priority order", 2)
    bullets(doc, [
        "<b>1 · Measurement.</b> Licence a regional camera-trap dataset, split by camera location, and report per-species precision/recall at a fixed threshold, stratified by day/night and occlusion.",
        "<b>2 · Spatial infrastructure.</b> Move to PostgreSQL + PostGIS with spatial indexes, then add a task queue so inference scales beyond one process.",
        "<b>3 · Real response.</b> Integrate an SMS/radio gateway with delivery receipts and acknowledgement SLAs; add an offline-first guard client.",
        "<b>4 · Governance.</b> Add audit export, data-retention rules and role-scoped media access before any pilot deployment.",
    ])
    heading(doc, "Reproduce the build", 2)
    code_block(doc, [
        "python -m venv .venv && source .venv/bin/activate",
        "pip install -r requirements.txt",
        "python -m uvicorn backend.main:app --port 8000",
        "",
        "cd frontend && npm install && npm run dev",
        "python -m pytest -q",
    ])
    para(doc,
         "Open <font name='Consolas'>http://127.0.0.1:5173</font> and sign in as "
         "<b>admin@forestguard.ai / forest123</b> (admin) or <b>guard@forestguard.ai / guard123</b> "
         "(guard). The community portal is public at <font name='Consolas'>/community</font>. "
         "Setup, API, testing, demo script, AI limits and image credits live in <font name='Consolas'>docs/</font>.")
    para(doc,
         "Imagery is CC BY-SA / CC BY-SA-compatible from Wikimedia Commons and individually attributed "
         "in <font name='Consolas'>docs/image-credits.md</font>; basemap © OpenStreetMap contributors. "
         "Model weights are excluded from the repository and must be obtained separately. This report "
         "describes a demonstration system, not a validated or deployed service.",
         size=8, color=MUTED)

    props = doc.core_properties
    props.title = "Forest Guard AI — Technical Report"
    props.author = "Forest Guard AI project"
    props.subject = "AI wildlife monitoring, GIS conflict risk and response workflow"
    props.keywords = "forest, wildlife, YOLO-World, CLIP, GIS, risk, FastAPI, React"

    doc.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
