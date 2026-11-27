"""Run revisions with a dedicated owner URL or a caller-provided connection."""

import os
from pathlib import Path

from alembic import context
from sqlalchemy.engine import URL

from backend import config
from backend.database.session import Base, create_database_engine, engine
from backend.models import entities  # noqa: F401 - register all ten models


def include_object(obj, name, kind, reflected, compare_to):
    # These generated PostGIS columns and GiST indexes have no SQLite counterparts.
    if not reflected or kind not in {"column", "index"}:
        return True
    return (obj.table.name, name) not in {
        ("jurisdictions", "boundary_geom"), ("jurisdictions", "ix_jurisdictions_boundary_geom"),
        ("incidents", "incident_point"), ("incidents", "ix_incidents_incident_point"),
        ("alerts", "public_point"), ("alerts", "ix_alerts_public_point"),
    }


def include_name(name, kind, parents):
    return kind != "table" or name != "spatial_ref_sys"


def run(connection):
    context.configure(connection=connection, target_metadata=Base.metadata,
                      include_object=include_object, include_name=include_name)
    with context.begin_transaction():
        context.run_migrations()


def cloud_owner_engine():
    if config.DB_MODE != "cloud":
        raise RuntimeError("Use tools.init_database for local owner migrations.")
    cloud = config.DATABASE_URL
    owner = os.getenv("FOREST_GUARD_MIGRATION_USER", "")
    passfile = os.getenv("FOREST_GUARD_MIGRATION_PASSFILE")
    if owner == cloud.username or owner.rpartition(".")[2] != cloud.username.rpartition(".")[2]:
        raise RuntimeError("Set FOREST_GUARD_MIGRATION_USER to the owner login for the selected cloud project.")
    if not passfile or not Path(passfile).is_file():
        raise RuntimeError("Set FOREST_GUARD_MIGRATION_PASSFILE to the private owner passfile.")
    return create_database_engine(URL.create(
        cloud.drivername, username=owner, host=cloud.host, port=cloud.port, database=cloud.database,
        query={**cloud.query, "passfile": str(Path(passfile).resolve())},
    ))


def main():
    connection = context.config.attributes.get("connection")
    if connection is not None:
        run(connection)
        return
    migration_engine = cloud_owner_engine() if context.get_x_argument(as_dictionary=True).get("owner") == "1" else engine
    try:
        if context.is_offline_mode():
            context.configure(url=migration_engine.url, target_metadata=Base.metadata, literal_binds=True)
            with context.begin_transaction():
                context.run_migrations()
        else:
            with migration_engine.connect() as connection:
                run(connection)
    finally:
        if migration_engine is not engine:
            migration_engine.dispose()


main()
