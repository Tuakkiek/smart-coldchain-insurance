"""The signed-ingestion migration upgrades an existing legacy database."""

from alembic import command
from alembic.config import Config
from pathlib import Path
from sqlalchemy import inspect, select

from app.cli import upgrade_schema
from app.core.database import Base, make_engine
from app.models import Shipment, ShipmentEvent, Telemetry


def test_existing_schema_upgrades_and_downgrades_without_losing_legacy_rows(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'upgrade.db').as_posix()}")
    try:
        Base.metadata.create_all(engine, tables=[Shipment.__table__, Telemetry.__table__, ShipmentEvent.__table__])
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "INSERT INTO shipments (id, code, cargo_type, origin_name, origin_latitude, "
                "origin_longitude, destination_name, destination_latitude, destination_longitude, "
                "temp_min_c, temp_max_c, violation_duration_minutes, insured_amount_vnd, status, "
                "insurance_status, payout_status, created_at) VALUES "
                "('8b4fb8a2-2996-4da2-90b9-35019517f56f', 'MIGRATION', 'vaccine', 'A', "
                "10, 105, 'B', 11, 106, 2, 8, 15, 1000, 'created', 'active', "
                "'not_requested', '2026-11-05 00:00:00')"
            )
        upgrade_schema(engine)
        upgrade_schema(engine)  # idempotent at head
        table_names = set(inspect(engine).get_table_names())
        assert {"devices", "device_keys", "device_assignments", "signed_telemetry_receipts",
                "ingestion_audit", "integrity_batches", "integrity_batch_items",
                "integration_outbox", "alembic_version"} <= table_names
        with engine.connect() as connection:
            assert connection.scalar(select(Shipment.code)) == "MIGRATION"
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == "20261109_02"
        config = Config()
        config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "base")
        assert "devices" not in inspect(engine).get_table_names()
        assert "integrity_batches" not in inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert connection.scalar(select(Shipment.code)) == "MIGRATION"
    finally:
        engine.dispose()
