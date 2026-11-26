from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.session import Base, create_database_engine
from backend.models import User
from backend.services import seed


@pytest.fixture
def empty_seed_database(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    monkeypatch.setattr(seed.config, "UPLOAD_DIR", str(uploads))
    database = create_database_engine(f"sqlite:///{(tmp_path / 'seed.db').as_posix()}")
    try:
        with database.begin() as connection:
            alembic = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            alembic.attributes["connection"] = connection
            command.upgrade(alembic, "head")
        yield database, uploads
    finally:
        database.dispose()


def test_seed_skips_database_with_users_but_no_detections(empty_seed_database):
    database, uploads = empty_seed_database
    with Session(database) as session:
        session.add(User(name="Existing guard", email="guard@example.test", role="guard", password_hash="fixture"))
        session.commit()
        assert seed.seed_database(session)["seeded"] is False
        assert session.scalars(select(User.email)).all() == ["guard@example.test"]
    assert not uploads.exists()


def test_failed_seed_rolls_back_and_can_be_retried(empty_seed_database, monkeypatch):
    database, _ = empty_seed_database

    def fail(*args, **kwargs):
        raise RuntimeError("simulated late failure")

    with monkeypatch.context() as patch, Session(database) as session:
        patch.setattr(seed, "sync_alerts", fail)
        with pytest.raises(RuntimeError, match="simulated late failure"):
            seed.seed_database(session)
        for table in Base.metadata.sorted_tables:
            assert session.execute(table.select().limit(1)).first() is None

    with Session(database) as session:
        assert seed.seed_database(session)["seeded"] is True
        assert seed.seed_database(session)["seeded"] is False
