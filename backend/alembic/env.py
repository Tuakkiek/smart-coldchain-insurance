"""Alembic environment for additive schema changes on the existing MySQL DB."""

from alembic import context

from app.core.config import load_settings
from app.core.database import Base, make_engine
import app.models  # noqa: F401 — populate Base.metadata


config = context.config
target_metadata = Base.metadata


def run_migrations_online() -> None:
    supplied = config.attributes.get("connection")
    if supplied is not None:
        context.configure(connection=supplied, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = make_engine(load_settings().database_url)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


run_migrations_online()
