"""Copy an existing Phase 2 SQLite database into an empty MySQL database.

IDs, timestamps, shipment states, telemetry and events are preserved. The
source SQLite file is read only; the target is never cleared or overwritten.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, load_settings
from app.core.database import Base, make_engine
from app.models import Shipment, ShipmentEvent, Telemetry


MODELS = (Shipment, Telemetry, ShipmentEvent)
PRECISION_COLUMNS = {
    Shipment: (
        "origin_latitude", "origin_longitude", "destination_latitude",
        "destination_longitude", "temp_min_c", "temp_max_c", "created_at",
    ),
    Telemetry: (
        "temperature_c", "humidity_pct", "recorded_at", "received_at",
        "latitude", "longitude", "progress_pct",
    ),
    ShipmentEvent: ("occurred_at",),
}


def row_count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def clone_row(row, model: type):
    return model(**{column.name: getattr(row, column.name) for column in model.__table__.columns})


def copy_into_empty_target(source_engine, target_engine) -> dict[str, int]:
    """Copy all rows in one target transaction; refuse an existing dataset."""
    Base.metadata.create_all(target_engine)
    with Session(source_engine) as source, Session(target_engine) as target:
        counts = {model.__tablename__: row_count(source, model) for model in MODELS}
        with target.begin():
            if any(row_count(target, model) for model in MODELS):
                raise ValueError("MySQL target already contains data; no rows were copied")

            # Parents before children; one target transaction covers all rows.
            for model in MODELS:
                for row in source.scalars(select(model).order_by(model.id)):
                    target.add(clone_row(row, model))
                target.flush()

            for model in MODELS:
                if row_count(target, model) != counts[model.__tablename__]:
                    raise RuntimeError(f"Count mismatch for {model.__tablename__}")
        return counts


def compare_rows(source_engine, target_engine, *, skip_precision: bool = False) -> dict[str, int]:
    """Compare every ID and column; never print record values or credentials."""
    with Session(source_engine) as source, Session(target_engine) as target:
        counts = {}
        for model in MODELS:
            old_rows = list(source.scalars(select(model).order_by(model.id)))
            new_rows = list(target.scalars(select(model).order_by(model.id)))
            counts[model.__tablename__] = len(old_rows)
            if [row.id for row in old_rows] != [row.id for row in new_rows]:
                raise ValueError(f"IDs differ in {model.__tablename__}")
            for before, after in zip(old_rows, new_rows):
                for column in model.__table__.columns:
                    if skip_precision and column.name in PRECISION_COLUMNS[model]:
                        continue
                    if getattr(before, column.name) != getattr(after, column.name):
                        raise ValueError(f"Column differs: {model.__tablename__}.{column.name}")
        return counts


def repair_precision(source_path: Path) -> dict[str, int]:
    """Upgrade an early MySQL copy from FLOAT/DATETIME and restore source values."""
    source_path = source_path.expanduser().resolve(strict=True)
    source_engine = make_engine(f"sqlite:///{source_path.as_posix()}")
    target_engine = make_engine(load_settings().database_url)
    try:
        if target_engine.dialect.name != "mysql":
            raise ValueError("Target database must be MySQL")
        counts = compare_rows(source_engine, target_engine, skip_precision=True)
        quote = target_engine.dialect.identifier_preparer.quote
        with target_engine.begin() as connection:
            for model in MODELS:
                for name in PRECISION_COLUMNS[model]:
                    column = model.__table__.columns[name]
                    sql_type = column.type.compile(dialect=target_engine.dialect)
                    nullable = "NULL" if column.nullable else "NOT NULL"
                    connection.exec_driver_sql(
                        f"ALTER TABLE {quote(model.__tablename__)} "
                        f"MODIFY COLUMN {quote(name)} {sql_type} {nullable}"
                    )

        with Session(source_engine) as source, Session(target_engine) as target:
            with target.begin():
                for model in MODELS:
                    for before in source.scalars(select(model).order_by(model.id)):
                        after = target.get(model, before.id)
                        for name in PRECISION_COLUMNS[model]:
                            setattr(after, name, getattr(before, name))
        compare_rows(source_engine, target_engine)
        return counts
    finally:
        source_engine.dispose()
        target_engine.dispose()


def verify_migration(source_path: Path) -> dict[str, int]:
    source_path = source_path.expanduser().resolve(strict=True)
    source_engine = make_engine(f"sqlite:///{source_path.as_posix()}")
    target_engine = make_engine(load_settings().database_url)
    try:
        if target_engine.dialect.name != "mysql":
            raise ValueError("Target database must be MySQL")
        return compare_rows(source_engine, target_engine)
    finally:
        source_engine.dispose()
        target_engine.dispose()


def migrate(source_path: Path, *, check_source_only: bool = False) -> dict[str, int]:
    source_path = source_path.expanduser().resolve(strict=True)
    if not source_path.is_file():
        raise ValueError(f"SQLite source is not a file: {source_path}")
    source_engine = make_engine(f"sqlite:///{source_path.as_posix()}")
    target_engine = None
    try:
        existing_tables = set(inspect(source_engine).get_table_names())
        missing = {model.__tablename__ for model in MODELS} - existing_tables
        if missing:
            raise ValueError(f"SQLite source is missing tables: {', '.join(sorted(missing))}")

        if check_source_only:
            with Session(source_engine) as source:
                return {model.__tablename__: row_count(source, model) for model in MODELS}

        target_engine = make_engine(load_settings().database_url)
        if target_engine.dialect.name != "mysql":
            raise ValueError("Target database must be MySQL")
        return copy_into_empty_target(source_engine, target_engine)
    finally:
        source_engine.dispose()
        if target_engine is not None:
            target_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=BACKEND_DIR / "coldchain.db")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check-source", action="store_true", help="show SQLite counts without MySQL")
    action.add_argument("--verify", action="store_true", help="compare all columns with MySQL")
    action.add_argument("--repair-precision", action="store_true", help="repair an early FLOAT/DATETIME copy")
    args = parser.parse_args()
    try:
        if args.verify:
            counts = verify_migration(args.source)
        elif args.repair_precision:
            counts = repair_precision(args.source)
        else:
            counts = migrate(args.source, check_source_only=args.check_source)
    except (OSError, ValueError, RuntimeError) as exc:
        parser.exit(2, f"Migration stopped: {exc}\n")
    except SQLAlchemyError as exc:
        code = exc.orig.args[0] if hasattr(exc, "orig") and exc.orig.args else "unknown"
        parser.exit(2, f"Migration stopped: database error {code}. Check MySQL connection and privileges.\n")
    label = "Source rows" if args.check_source else "Verified rows" if args.verify else "Repaired rows" if args.repair_precision else "Copied rows"
    print(f"{label}: {counts}")


if __name__ == "__main__":
    main()
