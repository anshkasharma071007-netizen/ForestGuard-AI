"""Deterministic, clearly-labelled demonstration dataset.

Every seeded detection, alert, incident and sighting is synthetic. It is
generated around an illustrative Pench landscape so that the full workflow can
be demonstrated without pretending to access live forest-department feeds.
"""
from __future__ import annotations

import json
import os
import random
import shutil
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from geospatial.risk_analysis import utcnow

from backend import config
from backend.api.deps import hash_password
from backend.models import (
    Alert,
    AlertEvent,
    Camera,
    Detection,
    Guard,
    Incident,
    SightingReport,
    Track,
    User,
    Village,
)
from backend.services.alerts import sync_alerts
from backend.services.risk_service import get_settings, recalculate_all
from backend.services.tracking import rebuild_tracks

RNG_SEED = 20261110

CAMERAS = [
    ("CAM-PEN-01", "Turia buffer station", "Southern buffer", 21.7068, 79.3370, "online"),
    ("CAM-PEN-02", "Kohka edge station", "South-western buffer", 21.6925, 79.3185, "online"),
    ("CAM-PEN-03", "Awarghani west station", "Western buffer", 21.7530, 79.2930, "online"),
    ("CAM-PEN-04", "Sillari corridor station", "Eastern buffer", 21.7870, 79.4090, "online"),
    ("CAM-PEN-05", "Piparia south station", "Southern buffer", 21.6760, 79.3780, "online"),
    ("CAM-PEN-06", "Central meadow station", "Core habitat", 21.7360, 79.3560, "online"),
    ("CAM-PEN-07", "Core north station", "Core habitat", 21.7920, 79.3600, "online"),
    ("CAM-PEN-08", "Core north-west station", "Core habitat", 21.7710, 79.3290, "online"),
    ("CAM-PEN-09", "Core north-east station", "Core habitat", 21.7830, 79.3920, "maintenance"),
    ("CAM-PEN-10", "Eastern corridor station", "Eastern buffer", 21.7610, 79.4200, "online"),
    ("CAM-PEN-11", "Southern corridor station", "Southern buffer", 21.7110, 79.3590, "online"),
    ("CAM-PEN-12", "Western corridor station", "Western buffer", 21.7310, 79.3110, "offline"),
]

GUARDS = [
    ("G-101", "Ramesh Verma", "+91 90000 10101", "Turia range", 21.7075, 79.3385, "on_patrol"),
    ("G-102", "Sunita Patil", "+91 90000 10102", "Kohka range", 21.6905, 79.3180, "available"),
    ("G-103", "Arif Khan", "+91 90000 10103", "Sillari range", 21.7855, 79.4070, "on_patrol"),
    ("G-104", "Mahesh Uikey", "+91 90000 10104", "Awarghani range", 21.7505, 79.2920, "available"),
    ("G-105", "Kavita Bisen", "+91 90000 10105", "Piparia range", 21.6750, 79.3770, "off_duty"),
    ("G-106", "Nadeem Sheikh", "+91 90000 10106", "Central range", 21.7330, 79.3520, "on_patrol"),
]

SPECIES_WEIGHTS = {
    "deer": 0.34,
    "wild_boar": 0.22,
    "leopard": 0.15,
    "elephant": 0.12,
    "tiger": 0.10,
    "sloth_bear": 0.07,
}

CAMERA_PREFERENCE = {
    "tiger": ["CAM-PEN-06", "CAM-PEN-07", "CAM-PEN-08", "CAM-PEN-09", "CAM-PEN-01", "CAM-PEN-11"],
    "leopard": ["CAM-PEN-01", "CAM-PEN-02", "CAM-PEN-03", "CAM-PEN-05", "CAM-PEN-11", "CAM-PEN-12", "CAM-PEN-08"],
    "elephant": ["CAM-PEN-04", "CAM-PEN-09", "CAM-PEN-10", "CAM-PEN-06", "CAM-PEN-05"],
    "deer": [camera[0] for camera in CAMERAS],
    "wild_boar": ["CAM-PEN-01", "CAM-PEN-02", "CAM-PEN-03", "CAM-PEN-05", "CAM-PEN-11"],
    "sloth_bear": ["CAM-PEN-03", "CAM-PEN-06", "CAM-PEN-07", "CAM-PEN-08"],
}

RAW_IMAGES = {
    "tiger": "tiger.jpg",
    "leopard": "leopard.jpg",
    "elephant": "elephant.jpg",
    "deer": "deer.jpg",
    "wild_boar": "boar.jpg",
    "sloth_bear": "bear.jpg",
}


def _load_study_area() -> tuple[dict, list[dict]]:
    with open(config.STUDY_AREA_PATH, "r", encoding="utf-8") as fh:
        study = json.load(fh)
    villages = [f for f in study["features"] if f["properties"].get("layer") == "village"]
    return study, villages


def _copy_assets(manifest: dict) -> dict[str, list[dict]]:
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    demo_dir = os.path.join(config.UPLOAD_DIR, "demo")
    raw_dir = os.path.join(demo_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    grouped: dict[str, list[dict]] = {}
    for item in manifest.get("items", []):
        source = os.path.join(config.DEMO_IMAGE_DIR, item["image"])
        target = os.path.join(demo_dir, item["image"])
        if os.path.exists(source) and not os.path.exists(target):
            shutil.copyfile(source, target)
        grouped.setdefault(item["key"], []).append(item)
    for key, filename in RAW_IMAGES.items():
        source = os.path.join(config.DEMO_WILDLIFE_DIR, filename)
        target = os.path.join(raw_dir, f"{key}.jpg")
        if os.path.exists(source) and not os.path.exists(target):
            shutil.copyfile(source, target)
    return grouped


def _asset_paths(asset: dict) -> tuple[str, str]:
    return (
        f"demo/raw/{asset['key']}.jpg",
        f"demo/{asset['image']}",
    )


def seed_database(db: Session) -> dict:
    if db.scalar(select(Detection).limit(1)) is not None:
        return {"seeded": False, "reason": "Database already contains detections."}

    rng = random.Random(RNG_SEED)
    now = utcnow().replace(microsecond=0)
    study, village_features = _load_study_area()
    with open(config.DETECTION_ASSETS, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    assets = _copy_assets(manifest)

    # --- users -----------------------------------------------------------
    admin = User(
        name="Dr. A. Deshmukh",
        email=config.DEMO_ADMIN_EMAIL,
        role="admin",
        badge_id="RFO-01",
        password_hash=hash_password(config.DEMO_ADMIN_PASSWORD),
    )
    guard_user = User(
        name="Ramesh Verma",
        email=config.DEMO_GUARD_EMAIL,
        role="guard",
        badge_id="G-101",
        password_hash=hash_password(config.DEMO_GUARD_PASSWORD),
    )
    db.add_all([admin, guard_user])
    db.flush()

    # --- villages --------------------------------------------------------
    villages: list[Village] = []
    for feature in village_features:
        props = feature["properties"]
        village = Village(
            code=props["id"],
            name=props["name"],
            district="Seoni",
            lat=float(props["lat"]),
            lon=float(props["lon"]),
            population=int(props.get("population", 0)),
            households=int(props.get("households", 0)),
            boundary_geojson=feature,
            note=props.get("note"),
            risk_level="low",
        )
        db.add(village)
        villages.append(village)
    db.flush()
    village_by_code = {village.code: village for village in villages}

    # --- cameras ---------------------------------------------------------
    cameras: list[Camera] = []
    for code, name, zone, lat, lon, status in CAMERAS:
        last_seen = now - timedelta(minutes=rng.randint(2, 18))
        if status == "maintenance":
            last_seen = now - timedelta(days=2, hours=4)
        elif status == "offline":
            last_seen = now - timedelta(days=5, hours=7)
        camera = Camera(
            code=code,
            name=name,
            zone=zone,
            lat=lat,
            lon=lon,
            status=status,
            last_seen=last_seen,
            installed_on=now - timedelta(days=rng.randint(240, 900)),
        )
        db.add(camera)
        cameras.append(camera)
    db.flush()
    camera_by_code = {camera.code: camera for camera in cameras}

    # --- guards ----------------------------------------------------------
    guards: list[Guard] = []
    for index, (badge, name, phone, zone, lat, lon, status) in enumerate(GUARDS):
        guard = Guard(
            badge_id=badge,
            name=name,
            phone=phone,
            zone=zone,
            lat=lat,
            lon=lon,
            status=status,
            user_id=guard_user.id if index == 0 else None,
        )
        db.add(guard)
        guards.append(guard)
    db.flush()

    # --- incidents & community reports -----------------------------------
    incident_specs = [
        (
            "livestock_depredation",
            "A goat was killed at the northern edge of Turia during the night. Pugmarks were recorded by the village watcher.",
            21.7095,
            79.3415,
            "V-TUR",
            "leopard",
            "high",
            "verified",
            True,
            3,
            "Turia village committee",
        ),
        (
            "crop_damage",
            "Elephant herd entered a paddy field on the eastern edge of Kohka and damaged approximately one acre before being deterred by lights.",
            21.6920,
            79.3210,
            "V-KOH",
            "elephant",
            "moderate",
            "verified",
            True,
            7,
            "Kohka patwari",
        ),
        (
            "human_injury",
            "A farm worker sustained minor injuries while attempting to move an elephant herd away from stored grain. Treated at the primary health centre.",
            21.7895,
            79.4110,
            "V-SIL",
            "elephant",
            "high",
            "resolved",
            True,
            18,
            "Sillari health worker",
        ),
        (
            "crop_damage",
            "Night-time rooting reported in a maize field near Awarghani. No clear species evidence was recorded.",
            21.7545,
            79.2915,
            "V-AWA",
            "wild_boar",
            "low",
            "dismissed",
            False,
            25,
            "Awarghani resident",
        ),
        (
            "sighting",
            "Tiger sighting reported by a tourist vehicle on the Turia approach road; no photograph or track evidence supplied.",
            21.7120,
            79.3390,
            "V-TUR",
            "tiger",
            "moderate",
            "open",
            False,
            1,
            "Turia gate logbook",
        ),
        (
            "livestock_depredation",
            "Two sheep reported missing from a pen on the eastern side of Piparia. Scat collected for verification.",
            21.6745,
            79.3835,
            "V-PIP",
            "leopard",
            "moderate",
            "resolved",
            True,
            12,
            "Piparia village committee",
        ),
    ]
    for category, description, lat, lon, code, species, severity, status, verified, days, reporter in incident_specs:
        created = now - timedelta(days=days, hours=rng.randint(1, 8))
        db.add(
            Incident(
                category=category,
                description=description,
                lat=lat,
                lon=lon,
                village_id=village_by_code[code].id,
                species=species,
                severity=severity,
                status=status,
                verified=verified,
                reported_by=reporter,
                created_at=created,
                resolved_at=created + timedelta(days=1) if status == "resolved" else None,
                is_simulated=True,
                is_public=False,
            )
        )
    db.flush()

    report_specs = [
        (
            "FG-2026-0184",
            "tiger",
            "Pugmarks seen beside the canal road after sunset. No direct sighting.",
            21.7140,
            79.3388,
            "V-TUR",
            "Lakhan Yadav",
            "+91 90000 20184",
            "pending",
            1,
        ),
        (
            "FG-2026-0179",
            "elephant",
            "A herd of about nine elephants moved east of the village towards the forest boundary.",
            21.7920,
            79.4180,
            "V-SIL",
            "Meena Bai",
            "+91 90000 20179",
            "forwarded",
            3,
        ),
        (
            "FG-2026-0161",
            "leopard",
            "Leopard crossed the field track early in the morning and moved towards the ridge.",
            21.6755,
            79.3810,
            "V-PIP",
            "Rafiq Khan",
            "+91 90000 20161",
            "closed",
            9,
        ),
    ]
    for code, species, description, lat, lon, village_code, name, contact, status, days in report_specs:
        db.add(
            SightingReport(
                reference_code=code,
                species=species,
                description=description,
                lat=lat,
                lon=lon,
                village_id=village_by_code[village_code].id,
                reporter_name=name,
                contact=contact,
                status=status,
                created_at=now - timedelta(days=days, hours=rng.randint(1, 10)),
                is_simulated=True,
            )
        )
    db.flush()

    # --- detections ------------------------------------------------------
    def make_detection(
        species: str,
        camera_code: str,
        when: datetime,
        *,
        asset: dict | None = None,
        source_type: str = "demo",
    ) -> Detection:
        camera = camera_by_code[camera_code]
        asset = asset or rng.choice(assets[species])
        raw_path, annotated_path = _asset_paths(asset)
        lat = round(camera.lat + rng.uniform(-0.0012, 0.0012), 6)
        lon = round(camera.lon + rng.uniform(-0.0012, 0.0012), 6)
        detection = Detection(
            species=species,
            confidence=float(asset["confidence"]),
            species_confidence=float(asset.get("species_confidence") or asset["confidence"]),
            detector_confidence=asset.get("detector_confidence"),
            detected_at=when,
            camera_id=camera.id,
            camera_code=camera.code,
            zone=camera.zone,
            lat=lat,
            lon=lon,
            image_path=raw_path,
            annotated_path=annotated_path,
            bbox=asset["bbox"],
            source_type=source_type,
            is_simulated=True,
            notes=(
                "Synthetic demonstration record. The annotated image is AI-processed reference "
                "evidence, not a real camera-trap observation."
            ),
        )
        db.add(detection)
        return detection

    # Scripted sequences create interpretable movement evidence.
    script = [
        ("tiger", "CAM-PEN-07", now - timedelta(hours=75)),
        ("tiger", "CAM-PEN-06", now - timedelta(hours=61)),
        ("tiger", "CAM-PEN-11", now - timedelta(hours=34)),
        ("tiger", "CAM-PEN-01", now - timedelta(hours=8)),
        ("leopard", "CAM-PEN-08", now - timedelta(hours=53)),
        ("leopard", "CAM-PEN-12", now - timedelta(hours=39)),
        ("leopard", "CAM-PEN-02", now - timedelta(hours=20)),
        ("leopard", "CAM-PEN-02", now - timedelta(hours=5)),
        ("elephant", "CAM-PEN-07", now - timedelta(hours=45)),
        ("elephant", "CAM-PEN-09", now - timedelta(hours=31)),
        ("elephant", "CAM-PEN-04", now - timedelta(hours=14)),
        ("sloth_bear", "CAM-PEN-03", now - timedelta(hours=20)),
        ("sloth_bear", "CAM-PEN-03", now - timedelta(days=3, hours=4)),
        ("wild_boar", "CAM-PEN-05", now - timedelta(hours=26)),
        ("wild_boar", "CAM-PEN-01", now - timedelta(hours=12)),
        ("deer", "CAM-PEN-06", now - timedelta(hours=6)),
        ("deer", "CAM-PEN-11", now - timedelta(hours=17)),
        ("deer", "CAM-PEN-02", now - timedelta(hours=29)),
        ("leopard", "CAM-PEN-11", now - timedelta(days=3, hours=6)),
        ("elephant", "CAM-PEN-10", now - timedelta(days=3, hours=2)),
    ]
    for species, camera_code, when in script:
        make_detection(species, camera_code, when.replace(second=0, microsecond=0))

    # Random background activity over 55 days.
    species_keys = list(SPECIES_WEIGHTS.keys())
    species_probs = [SPECIES_WEIGHTS[key] for key in species_keys]
    day_weights = [max(0.15, 1.0 - day / 70.0) for day in range(56)]
    for _ in range(210):
        species = rng.choices(species_keys, weights=species_probs, k=1)[0]
        camera_code = rng.choice(CAMERA_PREFERENCE[species])
        days_ago = rng.choices(range(56), weights=day_weights, k=1)[0]
        hour = rng.choices(
            [5, 6, 7, 8, 10, 13, 16, 17, 18, 19, 20, 22, 2],
            weights=[5, 8, 8, 5, 3, 2, 4, 7, 9, 8, 6, 3, 2],
            k=1,
        )[0]
        anchor = (now - timedelta(days=days_ago)).replace(hour=hour, minute=rng.randint(0, 59), second=0)
        if anchor > now - timedelta(minutes=30):
            anchor -= timedelta(days=1)
        make_detection(species, camera_code, anchor)

    db.commit()

    # --- tracks, risk, alerts --------------------------------------------
    rebuild_tracks(db)
    settings = get_settings(reload=True)
    risk_summary = recalculate_all(db, settings, now=now)
    alerts = sync_alerts(db, settings, days=30)

    # Give the alert history a realistic mix of states and responses.
    ordered_alerts = sorted(alerts, key=lambda alert: alert.created_at, reverse=True)
    for index, alert in enumerate(ordered_alerts):
        actor = alert.assigned_guard.name if alert.assigned_guard else "Forest control room"
        created = alert.created_at
        if index in (0, 1):
            alert.status = "active"
        elif index == 2:
            alert.status = "acknowledged"
            alert.acknowledged_at = created + timedelta(minutes=18)
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="acknowledged",
                    note="Alert acknowledged by the range control room; field verification requested.",
                    actor=actor,
                    created_at=alert.acknowledged_at,
                )
            )
        elif index == 3:
            alert.status = "responding"
            alert.acknowledged_at = created + timedelta(minutes=11)
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="acknowledged",
                    note="Alert acknowledged.",
                    actor=actor,
                    created_at=alert.acknowledged_at,
                )
            )
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="responding",
                    note="Patrol dispatched to the buffer track. Village focal point informed by phone.",
                    actor=actor,
                    created_at=created + timedelta(minutes=36),
                )
            )
        elif index in (4, 5):
            alert.status = "resolved"
            alert.acknowledged_at = created + timedelta(minutes=15)
            alert.resolved_at = min(now - timedelta(minutes=30), created + timedelta(hours=4))
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="acknowledged",
                    note="Alert acknowledged and patrol assigned.",
                    actor=actor,
                    created_at=alert.acknowledged_at,
                )
            )
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="resolved",
                    note="Field team completed verification. No further conflict activity around the village boundary.",
                    actor=actor,
                    created_at=alert.resolved_at,
                )
            )
        else:
            alert.status = "resolved"
            alert.acknowledged_at = created + timedelta(minutes=22)
            alert.resolved_at = min(now - timedelta(hours=2), created + timedelta(hours=8))
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="acknowledged",
                    note="Alert acknowledged.",
                    actor=actor,
                    created_at=alert.acknowledged_at,
                )
            )
            db.add(
                AlertEvent(
                    alert_id=alert.id,
                    kind="resolved",
                    note="Closed after patrol report; area returned to normal activity.",
                    actor=actor,
                    created_at=alert.resolved_at,
                )
            )
    db.commit()

    counts = {
        "villages": len(villages),
        "cameras": len(cameras),
        "guards": len(guards),
        "detections": db.query(Detection).count(),
        "tracks": db.query(Track).count(),
        "alerts": db.query(Alert).count(),
    }
    return {
        "seeded": True,
        "counts": counts,
        "risk": risk_summary,
        "demo": True,
        "description": "Synthetic demonstration dataset around an illustrative Pench landscape. Not real wildlife observations.",
    }
