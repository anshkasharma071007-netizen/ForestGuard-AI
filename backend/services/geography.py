import json
from weakref import WeakKeyDictionary

from fastapi import HTTPException
from sqlalchemy import case, false, func, literal_column, or_, select, text, true, update
from sqlalchemy.orm import Session

from backend import config
from backend.models import Alert, Detection, Guard, Incident, SightingReport, Track, Village
from backend.models.entities import AuthorityJurisdiction, Jurisdiction


_postgis_schemas = WeakKeyDictionary()


def postgis(db: Session):
    engine = db.get_bind()
    schema = _postgis_schemas.get(engine)
    if schema is None:
        schema = db.scalar(text("""
            SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
            WHERE e.extname = 'postgis'
        """))
        if not schema:
            raise RuntimeError("PostGIS is required for geographical queries.")
        _postgis_schemas[engine] = schema
    return getattr(func, schema)


def covers(boundary, lat, lon):
    """SQLite development equivalent of ST_Covers, including hole boundaries."""
    if lat is None or lon is None:
        return False
    if isinstance(boundary, str):
        boundary = json.loads(boundary)
    polygons = (boundary["coordinates"] if boundary["type"] == "MultiPolygon"
                else [boundary["coordinates"]])

    def ring_position(ring):
        inside = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            cross = (x2 - x1) * (lat - y1) - (y2 - y1) * (lon - x1)
            if (abs(cross) < 1e-12 and min(x1, x2) <= lon <= max(x1, x2)
                    and min(y1, y2) <= lat <= max(y1, y2)):
                return 0
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
        return 1 if inside else -1

    return any(ring_position(outer) >= 0 and all(ring_position(hole) <= 0 for hole in holes)
               for outer, *holes in polygons)


def lock_routing(db, *, shared=False):
    if db.get_bind().dialect.name == "postgresql":
        lock = func.pg_advisory_xact_lock_shared if shared else func.pg_advisory_xact_lock
        db.execute(select(lock(71239412)))
    elif not db.connection().connection.driver_connection.in_transaction:
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")


def jurisdiction_at(db, lat, lon, *, demo=False, point=None):
    if db.get_bind().dialect.name == "postgresql":
        spatial = postgis(db)
        if point is None:
            point = spatial.ST_SetSRID(spatial.ST_MakePoint(lon, lat), 4326)
        covered = spatial.ST_Covers(literal_column("jurisdictions.boundary_geom"), point)
    else:
        covered = func.fg_covers(Jurisdiction.boundary, lat, lon)
    return (select(Jurisdiction.id).where(Jurisdiction.is_demo.is_(demo), covered)
            .order_by(Jurisdiction.priority, Jurisdiction.id).limit(1).correlate_except(Jurisdiction)
            .scalar_subquery())


def assigned_ids(user):
    return select(AuthorityJurisdiction.jurisdiction_id).where(AuthorityJurisdiction.user_id == user.id).correlate(None)


def jurisdiction_label(jurisdiction):
    return {"id": jurisdiction.id, "name": jurisdiction.name, "is_demo": jurisdiction.is_demo}


def user_jurisdictions(db, user):
    return db.scalars(select(Jurisdiction).where(Jurisdiction.id.in_(assigned_ids(user)))
                      .order_by(Jurisdiction.name)).all()


def position_scope(db, user, lat, lon, *, simulated=None, point=None):
    if user.role == "admin":
        return true()
    assigned = assigned_ids(user)
    production = jurisdiction_at(db, lat, lon, point=point).in_(assigned)
    if simulated is None:
        return production
    demo = jurisdiction_at(db, lat, lon, demo=True, point=point).in_(assigned)
    if config.APP_ENV == "development" and config.DEMO_MODE and user.email == config.DEMO_GUARD_EMAIL:
        # The existing synthetic patrol demo remains available to its demo account.
        demo = or_(demo, ~assigned.exists())
    return case((simulated.is_(True), demo), else_=production)


def authority_scope(db, user, model):
    if user.role == "admin":
        return true()
    assigned = assigned_ids(user)
    if model is SightingReport:
        return SightingReport.jurisdiction_id.in_(assigned)
    if model is Incident:
        report = select(SightingReport.id).where(
            SightingReport.id == Incident.report_id, SightingReport.jurisdiction_id.in_(assigned)).exists()
        point = (literal_column("incidents.incident_point")
                 if db.get_bind().dialect.name == "postgresql" else None)
        return case((Incident.report_id.is_not(None), report), else_=position_scope(
            db, user, Incident.lat, Incident.lon, simulated=Incident.is_simulated, point=point))
    if model is Alert:
        incident = select(Incident.id).where(Incident.id == Alert.incident_id,
                                             authority_scope(db, user, Incident)).exists()
        detection = select(Detection.id).where(Detection.id == Alert.detection_id,
                                              authority_scope(db, user, Detection)).exists()
        return case((Alert.incident_id.is_not(None), incident), else_=detection)
    if model is Guard:
        return or_(Guard.user_id == user.id, select(AuthorityJurisdiction.user_id).where(
            AuthorityJurisdiction.user_id == Guard.user_id,
            AuthorityJurisdiction.jurisdiction_id.in_(assigned)).exists())
    if model is Track:
        points = select(Detection.id).where(Detection.track_id == Track.id).correlate(Track)
        visible = func.coalesce(authority_scope(db, user, Detection), false())
        return points.exists() & ~points.where(~visible).exists()
    return position_scope(db, user, model.lat, model.lon,
                          simulated=Detection.is_simulated if model is Detection else None)


def reroute_unassigned(db, *, demo=False):
    village_lat = select(Village.lat).where(Village.id == SightingReport.village_id).correlate(SightingReport).scalar_subquery()
    village_lon = select(Village.lon).where(Village.id == SightingReport.village_id).correlate(SightingReport).scalar_subquery()
    village_selected = SightingReport.lat.is_(None) & SightingReport.lon.is_(None)
    route = jurisdiction_at(db, case((village_selected, village_lat), else_=SightingReport.lat),
                           case((village_selected, village_lon), else_=SightingReport.lon), demo=demo)
    db.execute(update(SightingReport).where(SightingReport.jurisdiction_id.is_(None),
                                           SightingReport.is_simulated.is_(demo))
               .values(jurisdiction_id=route).execution_options(synchronize_session=False))


def authority_record(db, user, model, record_id, *, lock=False):
    scope = authority_scope(db, user, model)
    if lock:
        from backend.services.incident_lifecycle import lock_record

        return lock_record(db, model, record_id, scope)
    record = db.scalar(select(model).where(model.id == record_id, scope))
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found.")
    return record
