"""Import or compare a Forest Guard SQLite snapshot using the PostgreSQL owner URL."""

from __future__ import annotations

import argparse
import sqlite3
from itertools import islice, zip_longest
from pathlib import Path

import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from backend.database.session import Base, engine
from backend.models import entities  # noqa: F401 - populate metadata


def checked_schema(connection):
    tables = set(sa.inspect(connection).get_table_names())
    expected = set(Base.metadata.tables)
    if tables - {"alembic_version"} != expected:
        raise ValueError("Unexpected tables. Use the ten-table baseline.")
    if "alembic_version" in tables:
        if connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalars().all() != ["0001"]:
            raise ValueError("Expected Alembic revision 0001")
    elif connection.dialect.name == "postgresql":
        raise ValueError("Run alembic upgrade head before import")
    if compare_metadata(MigrationContext.configure(connection), Base.metadata):
        raise ValueError("Database schema differs from the Forest Guard models")


def records(connection, table):
    # Both SQL NULL and a JSON null decode to None. Keep the distinction on insert.
    json_cols = [c for c in table.c if isinstance(c.type, sa.JSON)]
    query = sa.select(table, *(c.is_(None) for c in json_cols)).order_by(table.c.id)
    for row in connection.execute(query):
        values = dict(zip(table.c.keys(), row))
        for col, is_sql_null in zip(json_cols, row[len(table.c):]):
            if is_sql_null:
                values[col.name] = sa.null()
        yield values


def verify_table(source, dest, table):
    query = sa.select(sa.func.count()).select_from(table)
    before, after = (c.scalar(query) for c in (source, dest))
    if before != after:
        raise ValueError(f"{table.name}: counts differ ({before} vs {after})")
    for left, right in zip_longest(records(source, table), records(dest, table)):
        if left != right:
            raise ValueError(f"{table.name}: row content differs")
    for fk in table.foreign_keys:
        missing = sa.select(fk.parent).where(
            fk.parent.is_not(None), ~sa.exists().where(fk.column == fk.parent)
        ).limit(1)
        if dest.scalar(missing) is not None:
            raise ValueError(f"{table.name}: orphaned foreign key")
    print(f"{table.name:20} {before:8} {after:8}")


def import_snapshot(path, verify_only=False):
    if engine.dialect.name != "postgresql":
        raise ValueError("DATABASE_URL must select the migrated PostgreSQL database")
    uri = path.resolve(strict=True).as_uri() + "?mode=ro"
    sqlite = sa.create_engine("sqlite://", creator=lambda: sqlite3.connect(uri, uri=True))
    tables = Base.metadata.sorted_tables
    try:
        with sqlite.connect() as source, engine.begin() as dest:
            source.exec_driver_sql("BEGIN")
            if source.exec_driver_sql("PRAGMA integrity_check").scalars().all() != ["ok"]:
                raise ValueError("SQLite integrity check failed")
            if source.exec_driver_sql("PRAGMA foreign_key_check").first():
                raise ValueError("SQLite foreign key check failed")
            if dest.exec_driver_sql("SELECT current_database()").scalar_one() != "forest_guard_ai":
                raise ValueError("Destination must be forest_guard_ai")
            checked_schema(source)
            checked_schema(dest)
            # Serialize competing imports and prevent writes between comparison and commit.
            names = ", ".join(table.name for table in tables)
            mode = "SHARE" if verify_only else "ACCESS EXCLUSIVE"
            dest.exec_driver_sql(f"LOCK TABLE {names} IN {mode} MODE")
            if not verify_only:
                for table in tables:
                    if dest.scalar(sa.select(table.c.id).limit(1)) is not None:
                        raise ValueError(f"Refusing import: {table.name} already contains records")
                for table in tables:
                    rows = records(source, table)
                    while batch := list(islice(rows, 500)):
                        dest.execute(table.insert(), batch)

            print("table                  SQLite PostgreSQL")
            for table in tables:
                verify_table(source, dest, table)
                if not verify_only:
                    seq = dest.scalar(sa.select(sa.func.pg_get_serial_sequence(table.name, "id")))
                    largest = dest.scalar(sa.select(sa.func.max(table.c.id)))
                    next_id = max(1, (largest or 0) + 1)
                    # RESTART, unlike setval(), rolls back with the data on failure.
                    dest.exec_driver_sql(f"ALTER SEQUENCE {seq} RESTART WITH {next_id}")
    finally:
        sqlite.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    import_snapshot(args.snapshot, args.verify_only)
