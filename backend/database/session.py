from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend import config

def create_database_engine(url):
    sqlite = make_url(url).get_backend_name() == "sqlite"
    connect_args = {"check_same_thread": False} if sqlite else {}
    database = create_engine(url, connect_args=connect_args, pool_pre_ping=True, hide_parameters=True)

    if sqlite:
        @event.listens_for(database, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    return database


engine = create_database_engine(config.DATABASE_URL)


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
