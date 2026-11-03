from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Session

from app.cli import seed_demo
from app.core.config import load_settings
from app.core.database import Base, make_engine, make_session_factory
from app.migrate_sqlite_to_mysql import compare_rows, copy_into_empty_target, migrate
from app.models import Shipment, ShipmentEvent, Telemetry


def test_runtime_settings_use_mysql_and_keep_special_password(monkeypatch):
    monkeypatch.setenv("MYSQL_HOST", "127.0.0.1")
    monkeypatch.setenv("MYSQL_PORT", "3306")
    monkeypatch.setenv("MYSQL_DATABASE", "smart_coldchain")
    monkeypatch.setenv("MYSQL_USER", "coldchain_app")
    monkeypatch.setenv("MYSQL_PASSWORD", "p@ss/w:rd")
    settings = load_settings()
    assert settings.database_url.drivername == "mysql+pymysql"
    assert settings.database_url.password == "p@ss/w:rd"
    assert settings.database_url.query["charset"] == "utf8mb4"


def test_mysql_schema_keeps_double_and_microsecond_precision():
    assert Shipment.__table__.columns["origin_latitude"].type.compile(dialect=mysql.dialect()) == "DOUBLE"
    assert Telemetry.__table__.columns["temperature_c"].type.compile(dialect=mysql.dialect()) == "DOUBLE"
    assert Shipment.__table__.columns["created_at"].type.compile(dialect=mysql.dialect()) == "DATETIME(6)"
    assert Telemetry.__table__.columns["received_at"].type.compile(dialect=mysql.dialect()) == "DATETIME(6)"


def test_migration_preserves_ids_timestamps_events_and_refuses_duplicates(tmp_path):
    source_path = tmp_path / "old.db"
    source = make_engine(f"sqlite:///{source_path.as_posix()}")
    target = make_engine(f"sqlite:///{(tmp_path / 'target.db').as_posix()}")
    try:
        Base.metadata.create_all(source)
        seed_demo(make_session_factory(source))
        assert migrate(source_path, check_source_only=True) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        assert copy_into_empty_target(source, target) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        assert compare_rows(source, target) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        with Session(source) as old, Session(target) as new:
            for model in (Shipment, Telemetry, ShipmentEvent):
                old_rows = list(old.scalars(select(model).order_by(model.id)))
                new_rows = list(new.scalars(select(model).order_by(model.id)))
                assert [row.id for row in old_rows] == [row.id for row in new_rows]
                for before, after in zip(old_rows, new_rows):
                    assert all(
                        getattr(before, column.name) == getattr(after, column.name)
                        for column in model.__table__.columns
                    )

        try:
            copy_into_empty_target(source, target)
        except ValueError as exc:
            assert "already contains data" in str(exc)
        else:
            raise AssertionError("A second migration must refuse a nonempty target")
    finally:
        source.dispose()
        target.dispose()
