"""Upgrade real legacy rows and exercise the assignment guard on SQLite/MySQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path
from threading import Barrier
from uuid import uuid4

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.cli import upgrade_schema
from app.core.database import Base, make_engine, make_session_factory
from app.models import (
    Device, DeviceAssignment, DeviceKey, IntegrityBatch, IntegrityBatchItem, IntegrationOutbox,
    Shipment, ShipmentEvent, SignedTelemetryReceipt, Telemetry,
)
from app.schemas.api import ShipmentCreate, SignedTelemetryCreate
from app.services import shipments, signed_ingestion
from app.services.clock import VirtualClock
from test_signed_ingestion import SHIPMENT, signed


@pytest.fixture(params=["sqlite", "mysql"])
def migration_engine(request, tmp_path):
    if request.param == "sqlite":
        engine = make_engine(f"sqlite:///{(tmp_path / 'registration-migration.db').as_posix()}")
        yield engine
        engine.dispose()
        return
    url = os.getenv("COLDCHAIN_TEST_MYSQL_URL")
    if not url:
        pytest.skip("set COLDCHAIN_TEST_MYSQL_URL to an isolated MySQL test server URL")
    server = make_engine(sa.engine.make_url(url).set(database=None))
    database = "coldchain_test_" + uuid4().hex
    # Only this generated, newly created schema is modified/dropped by these tests.
    with server.begin() as connection:
        connection.exec_driver_sql(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4")
    engine = make_engine(sa.engine.make_url(url).set(database=database))
    try:
        yield engine
    finally:
        engine.dispose()
        with server.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE `{database}`")
        server.dispose()


def alembic_config(connection):
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    config.attributes["connection"] = connection
    return config


def legacy_database(engine, *, conflicting=False):
    Base.metadata.create_all(engine, tables=[Shipment.__table__, Telemetry.__table__, ShipmentEvent.__table__])
    with engine.begin() as connection:
        command.upgrade(alembic_config(connection), "20261109_02")
    factory = make_session_factory(engine)
    with factory() as session:
        first = shipments.create_shipment(session, ShipmentCreate.model_validate(SHIPMENT))
        second = shipments.create_shipment(session, ShipmentCreate.model_validate(SHIPMENT | {"name": "OLD-002"}))
    # Strip columns introduced in later migrations (20261118_07) so the legacy snapshot truly reflects 20261109_02.
    post_02_shipment_cols = (
        "origin_formatted_address", "origin_place_id",
        "destination_formatted_address", "destination_place_id",
        "insurance_amount", "insurance_amount_wei", "insurance_currency",
        "blockchain_chain_id", "buyer_wallet_address",
        "policy_contract_address", "policy_transaction_hash",
        "policy_status", "policy_last_error", "policy_expiry",
    )
    existing_ship_cols = {c["name"] for c in sa.inspect(engine).get_columns("shipments")}
    with engine.begin() as connection:
        for col in post_02_shipment_cols:
            if col in existing_ship_cols:
                connection.exec_driver_sql(f"ALTER TABLE shipments DROP COLUMN {col}")
    now = datetime(2026, 11, 15, tzinfo=timezone.utc)
    metadata = sa.MetaData()
    devices = sa.Table("devices", metadata, autoload_with=engine)
    keys = sa.Table("device_keys", metadata, autoload_with=engine)
    assignments = sa.Table("device_assignments", metadata, autoload_with=engine)
    with engine.begin() as connection:
        connection.execute(devices.insert().values(
            id="LEGACY-DEVICE", status="active", last_sequence_number=17, last_seen_at=now,
            created_at=now, rate_window_count=0,
        ))
        connection.execute(keys.insert().values(
            device_id="LEGACY-DEVICE", key_id="old-key", public_key_pem="public-only-fixture",
            status="active", created_at=now,
        ))
        connection.execute(assignments.insert(), [
            {"device_id": "LEGACY-DEVICE", "shipment_id": first.id, "active": True},
            {"device_id": "LEGACY-DEVICE", "shipment_id": second.id, "active": conflicting},
        ])
    with factory() as session:
        sample = Telemetry(
            id=str(uuid4()), shipment_id=first.id, device_id="LEGACY-DEVICE",
            temperature_c=5, humidity_pct=80, recorded_at=now, received_at=now,
            latitude=10, longitude=105, progress_pct=5,
        )
        session.add(sample)
        session.flush()
        session.add(SignedTelemetryReceipt(
            telemetry_id=sample.id, shipment_id=first.id, device_id="LEGACY-DEVICE",
            key_id="old-key", sequence_number=17, payload_version=1, firmware_version="1.0",
            temperature_milli_c=5000, humidity_milli_pct=80000,
            signature="old-signature-preserved", canonical_sha256="a" * 64,
        ))
        batch = IntegrityBatch(
            id=str(uuid4()), shipment_id=first.id, device_id="LEGACY-DEVICE", status="SEALED",
            first_sequence=17, last_sequence=17, record_count=1, merkle_root="b" * 64,
            hash_version="MERKLE-v1", verification_status="MATCHED", anchor_status="NOT_READY",
            sealed_at=now,
        )
        session.add(batch)
        session.flush()
        session.add(IntegrityBatchItem(
            batch_id=batch.id, telemetry_id=sample.id, leaf_index=0, leaf_hash="b" * 64, sequence_number=17,
        ))
        session.add(IntegrationOutbox(
            id=str(uuid4()), kind="ANCHOR_BATCH", aggregate_id=batch.id,
            idempotency_key="anchor:" + batch.id, status="PENDING", payload={"merkle_root": "b" * 64},
        ))
        session.commit()
    return first.id, second.id


def snapshot(engine):
    metadata = sa.MetaData()
    metadata.reflect(bind=engine)
    with engine.connect() as connection:
        return {
            name: (list(table.c.keys()), sorted(map(repr, connection.execute(sa.select(table)).all())))
            for name, table in metadata.tables.items() if name != "alembic_version"
        }


def assert_preserved(engine, before):
    metadata = sa.MetaData()
    metadata.reflect(bind=engine)
    with engine.connect() as connection:
        for name, (columns, rows) in before.items():
            table = metadata.tables[name]
            query = sa.select(*(table.c[
                column if column in table.c else {"name": "code", "code": "name"}.get(column, column)
            ] for column in columns))
            assert sorted(map(repr, connection.execute(query).all())) == rows, name


def test_upgrade_preserves_old_keys_sequence_telemetry_batches_and_downgrades(migration_engine):
    engine = migration_engine
    legacy_database(engine)
    before = snapshot(engine)
    upgrade_schema(engine)
    upgrade_schema(engine)
    assert_preserved(engine, before)
    with make_session_factory(engine)() as session:
        device = session.get(Device, "LEGACY-DEVICE")
        assert device.device_name == "LEGACY-DEVICE"
        assert device.last_sequence_number == 17
        assert signed_ingestion.device_view(session, device)["has_public_key"] is True
    with engine.begin() as connection:
        command.downgrade(alembic_config(connection), "20261109_02")
    assert "device_name" not in {column["name"] for column in sa.inspect(engine).get_columns("devices")}
    assert_preserved(engine, before)


def test_conflicting_legacy_assignments_stop_before_ddl_or_data_changes(migration_engine):
    engine = migration_engine
    _, second = legacy_database(engine, conflicting=True)
    before = snapshot(engine)
    with pytest.raises(RuntimeError, match="Multiple active.*LEGACY-DEVICE"):
        upgrade_schema(engine)
    assert "device_name" not in {column["name"] for column in sa.inspect(engine).get_columns("devices")}
    assert_preserved(engine, before)
    with engine.begin() as connection:
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == "20261109_02"
        connection.execute(sa.text(
            "UPDATE device_assignments SET active = false WHERE device_id = :device AND shipment_id = :shipment"
        ), {"device": "LEGACY-DEVICE", "shipment": second})
    upgrade_schema(engine)
    with make_session_factory(engine)() as session:
        assert signed_ingestion.device_view(session, session.get(Device, "LEGACY-DEVICE"))["current_shipment_id"] != second


def test_database_constraint_blocks_direct_writes_but_keeps_inactive_history(migration_engine):
    engine = migration_engine
    _, second = legacy_database(engine)
    upgrade_schema(engine)
    with make_session_factory(engine)() as session:
        assignment = session.get(DeviceAssignment, ("LEGACY-DEVICE", second))
        assignment.active = True
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.scalar(sa.select(sa.func.count()).select_from(DeviceAssignment)) == 2
        assert session.scalar(sa.select(sa.func.count()).select_from(DeviceAssignment)
                              .where(DeviceAssignment.active.is_(True))) == 1


def test_mysql_concurrent_assignment_has_one_winner_and_same_pair_is_idempotent(migration_engine):
    engine = migration_engine
    if engine.dialect.name != "mysql":
        pytest.skip("row-lock concurrency is verified on MySQL, not SQLite")
    upgrade_schema(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        signed_ingestion.register_device(session, "ESP32-01", "Race sensor")
        first = shipments.create_shipment(session, ShipmentCreate.model_validate(SHIPMENT)).id
        second = shipments.create_shipment(session, ShipmentCreate.model_validate(SHIPMENT | {"name": "RACE-002"})).id
    barrier = Barrier(2)

    def assign(shipment_id):
        with factory() as session:
            barrier.wait(timeout=10)
            try:
                signed_ingestion.set_assignment(session, "ESP32-01", shipment_id, True)
                return 200
            except signed_ingestion.IngestionError as exc:
                assert exc.code == "DEVICE_ALREADY_ASSIGNED"
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(assign, [first, second])) == [200, 409]
    with factory() as session:
        active = session.scalar(sa.select(DeviceAssignment).where(DeviceAssignment.active.is_(True)))
        winner = active.shipment_id
        assert session.scalar(sa.select(sa.func.count()).select_from(DeviceAssignment)) == 1
    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(assign, [winner, winner])) == [200, 200]


def prepared_registry(engine):
    upgrade_schema(engine)
    factory = make_session_factory(engine)
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    with factory() as session:
        signed_ingestion.register_device(session, "ESP32-01", "Snapshot sensor")
        shipment_id = shipments.create_shipment(session, ShipmentCreate.model_validate(SHIPMENT)).id
        signed_ingestion.set_assignment(session, "ESP32-01", shipment_id, True)
        signed_ingestion.add_key(session, "ESP32-01", "key-v1", pem)
    return factory, key, shipment_id


@pytest.mark.parametrize("revoked,expected", [
    ("assignment", "DEVICE_NOT_ASSIGNED"), ("key", "UNKNOWN_KEY"), ("device", "DEVICE_NOT_ACTIVE"),
])
def test_ingestion_refreshes_cached_authorization_after_revocation(migration_engine, revoked, expected):
    engine = migration_engine
    factory, key, shipment_id = prepared_registry(engine)
    payload = SignedTelemetryCreate.model_validate(signed(key, shipment_id, 1))
    with factory() as reader:
        # Establish an old MySQL consistent snapshot and retain old ORM objects.
        shipments.get_shipment(reader, shipment_id)
        cached_device = reader.get(Device, "ESP32-01")
        cached_assignment = reader.get(DeviceAssignment, ("ESP32-01", shipment_id))
        cached_key = reader.get(DeviceKey, ("ESP32-01", "key-v1"))
        with factory() as writer:
            if revoked == "assignment":
                signed_ingestion.set_assignment(writer, "ESP32-01", shipment_id, False)
            elif revoked == "key":
                signed_ingestion.set_key_status(writer, "ESP32-01", "key-v1", "revoked")
            else:
                signed_ingestion.get_device(writer, "ESP32-01", lock=True).status = "revoked"
                writer.commit()
        assert cached_device.status == "active" and cached_assignment.active and cached_key.status == "active"
        with pytest.raises(signed_ingestion.IngestionError) as error:
            signed_ingestion.ingest(reader, shipment_id, payload,
                VirtualClock(datetime(2026, 11, 15, tzinfo=timezone.utc)), 5, 300, 120)
        assert error.value.code == expected
    with factory() as session:
        assert session.scalar(sa.select(sa.func.count()).select_from(Telemetry)) == 0


def test_unassign_refreshes_previously_cached_inactive_assignment(migration_engine):
    factory, _, shipment_id = prepared_registry(migration_engine)
    with factory() as session:
        signed_ingestion.set_assignment(session, "ESP32-01", shipment_id, False)
    with factory() as reader:
        cached = reader.get(DeviceAssignment, ("ESP32-01", shipment_id))
        assert not cached.active
        with factory() as writer:
            signed_ingestion.set_assignment(writer, "ESP32-01", shipment_id, True)
        signed_ingestion.set_assignment(reader, "ESP32-01", shipment_id, False)
    with factory() as session:
        assert not session.get(DeviceAssignment, ("ESP32-01", shipment_id)).active


def test_mysql_concurrent_signed_retry_uses_current_receipt_not_old_snapshot(migration_engine):
    engine = migration_engine
    if engine.dialect.name != "mysql":
        pytest.skip("concurrent ingestion snapshot regression requires MySQL")
    factory, key, shipment_id = prepared_registry(engine)
    payload = SignedTelemetryCreate.model_validate(signed(key, shipment_id, 1))
    barrier = Barrier(2)

    def send(_):
        with factory() as session:
            shipments.get_shipment(session, shipment_id)
            cached_device = session.get(Device, "ESP32-01")
            assert cached_device.last_sequence_number == 0
            barrier.wait(timeout=10)
            return signed_ingestion.ingest(session, shipment_id, payload,
                VirtualClock(datetime(2026, 11, 15, tzinfo=timezone.utc)), 5, 300, 120)["duplicate"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, range(2))) == [False, True]
    with factory() as session:
        assert session.scalar(sa.select(sa.func.count()).select_from(Telemetry)) == 1
        assert session.scalar(sa.select(sa.func.count()).select_from(SignedTelemetryReceipt)) == 1
