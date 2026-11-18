"""Alembic environment for additive schema changes on the existing MySQL DB."""

from alembic import context

from app.core.config import load_settings
from app.core.database import Base, make_engine
import app.models  # noqa: F401 — populate Base.metadata


config = context.config
target_metadata = Base.metadata


def migrate_connection(connection) -> None:
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        # SQLite must recreate a table to remove its old unique constraint.
        # Disable enforcement before migrations open a DBAPI write transaction.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        if connection.exec_driver_sql("PRAGMA foreign_keys").scalar():
            raise RuntimeError("Run SQLite migrations before writing in this transaction")
    try:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
        if sqlite and connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
            raise RuntimeError("Migration left invalid SQLite foreign keys")
    finally:
        if sqlite:
            # If still inside the caller's transaction, the engine checkin hook
            # restores enforcement after commit/rollback and before reuse.
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def run_migrations_online() -> None:
    supplied = config.attributes.get("connection")
    if supplied is not None:
        migrate_connection(supplied)
        return
    engine = make_engine(load_settings().database_url)
    try:
        with engine.connect() as connection:
            migrate_connection(connection)
    finally:
        engine.dispose()


run_migrations_online()
