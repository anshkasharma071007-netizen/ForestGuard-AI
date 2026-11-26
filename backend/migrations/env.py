"""Run revisions against DATABASE_URL (or a caller-provided connection)."""

from alembic import context

from backend.database.session import Base, engine
from backend.models import entities  # noqa: F401 - register all ten models


def run(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(url=engine.url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
elif context.config.attributes.get("connection") is not None:
    run(context.config.attributes["connection"])
else:
    with engine.connect() as connection:
        run(connection)
