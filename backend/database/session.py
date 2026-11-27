from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend import config


def create_database_engine(url):
    url = make_url(url)
    options = {}
    if url.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False}
    elif url.get_backend_name() == "postgresql":
        if "connect_timeout" not in url.query:
            url = url.update_query_dict({"connect_timeout": "5"})
        options.update(pool_size=3, max_overflow=2, pool_timeout=5, pool_recycle=300, pool_use_lifo=True)
    database = create_engine(url, pool_pre_ping=True, hide_parameters=True, **options)

    if url.get_backend_name() == "sqlite":
        @event.listens_for(database, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
            from backend.services.geography import covers
            from geospatial.mapping import haversine_km

            dbapi_connection.create_function("fg_covers", 3, covers, deterministic=True)
            dbapi_connection.create_function("fg_distance_m", 4, lambda lat, lon, a, b:
                                             haversine_km(lat, lon, a, b) * 1000
                                             if lat is not None and lon is not None else None, deterministic=True)
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    return database


engine = create_database_engine(config.DATABASE_URL)


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def validate_runtime_database(db: Session) -> None:
    engine = db.get_bind()
    if config.DB_MODE == "local" and engine.dialect.name == "sqlite":
        return
    if engine.dialect.name != "postgresql":
        raise RuntimeError("The selected database profile requires PostgreSQL.")
    expected_role = "forest_guard_app" if config.DB_MODE == "cloud" else config.LOCAL_DATABASE_ROLE
    _, parameters = engine.dialect.create_connect_args(engine.url)
    expected_login = config.DATABASE_URL.username if config.DB_MODE == "cloud" else expected_role
    if parameters.get("user") != expected_login:
        raise RuntimeError("Run the API with the restricted database login for the selected profile.")

    try:
        identity = db.execute(text("""
            SELECT session_user, current_user, current_database(), current_schema(),
                   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
                   AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member = r.oid)
                   AND NOT EXISTS (SELECT FROM pg_database WHERE datname = current_database() AND datdba = r.oid)
                   AND NOT EXISTS (
                       SELECT FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'public' AND c.relowner = r.oid
                   )
                   AND NOT has_schema_privilege('public', 'CREATE') AS restricted
            FROM pg_roles AS r WHERE rolname = session_user
        """)).one()
        if identity[:2] != (expected_role, expected_role) or not identity.restricted:
            raise RuntimeError("The database connection must use a restricted runtime role without ownership or role memberships.")

        if config.DB_MODE == "cloud":
            from alembic.config import Config
            from alembic.script import ScriptDirectory

            if identity[2:4] != ("postgres", "public"):
                raise RuntimeError("Cloud mode requires the postgres database and the public application schema.")
            writable = db.scalar(text("""
                SELECT has_table_privilege('public.alembic_version', 'INSERT,UPDATE,DELETE,TRUNCATE')
            """))
            if writable:
                raise RuntimeError("The cloud runtime role must have read-only access to public.alembic_version.")
            revisions = set(db.scalars(text("SELECT version_num FROM public.alembic_version")))
            heads = ScriptDirectory.from_config(Config(f"{config.ROOT}/alembic.ini")).get_heads()
            if revisions != set(heads):
                raise RuntimeError("The cloud Alembic revision must match this checkout. Run owner migrations separately.")
    except SQLAlchemyError:
        raise RuntimeError(
            f"Cannot verify the {config.DB_MODE} runtime database. Check connectivity, TLS, credentials and grants."
        ) from None


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
