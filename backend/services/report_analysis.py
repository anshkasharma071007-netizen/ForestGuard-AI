"""A leased database job survives API restarts and uses the shared wildlife engine."""
import logging
from datetime import timedelta
from pathlib import Path
from threading import Event

from sqlalchemy import and_, or_, select, update

from ai_engine.detector import AIUnavailableError, get_engine
from backend import config
from backend.database.session import SessionLocal
from backend.models import SightingReport, utcnow

log = logging.getLogger(__name__)


def evidence_path(relative: str) -> Path:
    root = Path(config.UPLOAD_DIR).resolve()
    path = (root / relative).resolve()
    if path.parent != root / "community" or not path.is_file():
        raise FileNotFoundError("Report evidence unavailable")
    return path


def process_next() -> bool:
    started = utcnow()
    ready = or_(SightingReport.analysis_status == "queued",
                and_(SightingReport.analysis_status == "processing",
                     SightingReport.analysis_started_at < started - timedelta(minutes=15)))
    with SessionLocal.begin() as db:
        job = db.execute(select(SightingReport.id, SightingReport.image_path)
                         .where(ready).order_by(SightingReport.id).limit(1)
                         .with_for_update(skip_locked=True)).first()
        if not job:
            return False
        claimed = db.execute(update(SightingReport).where(SightingReport.id == job.id, ready)
                             .values(analysis_status="processing", analysis_started_at=started))
        if not claimed.rowcount:
            return False
    try:
        path = evidence_path(job.image_path)
        result = get_engine().analyze_image(str(path), save_annotated=False)
        values = dict(analysis_status="completed", analysis_results=result["detections"])
    except AIUnavailableError:
        log.warning("Photo analysis engine unavailable for report %d", job.id)
        values = dict(analysis_status="unavailable")
    except Exception:
        log.exception("Photo analysis failed for report %d", job.id)
        values = dict(analysis_status="failed")
    with SessionLocal.begin() as db:
        db.execute(update(SightingReport).where(SightingReport.id == job.id,
                   SightingReport.analysis_started_at == started).values(**values))
    return True


def run_worker(stop: Event):
    while not stop.is_set():
        try:
            if process_next():
                continue
        except Exception:
            log.exception("Could not poll report jobs")
        stop.wait(3)
