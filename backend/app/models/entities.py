"""Storage models for MySQL production and isolated SQLite tests."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, DateTime, Double, ForeignKey, ForeignKeyConstraint, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


UTC_DATETIME = DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql")


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    cargo_type: Mapped[str] = mapped_column(String(100), nullable=False)
    origin_name: Mapped[str] = mapped_column(String(100), nullable=False)
    origin_latitude: Mapped[float] = mapped_column(Double, nullable=False)
    origin_longitude: Mapped[float] = mapped_column(Double, nullable=False)
    destination_name: Mapped[str] = mapped_column(String(100), nullable=False)
    destination_latitude: Mapped[float] = mapped_column(Double, nullable=False)
    destination_longitude: Mapped[float] = mapped_column(Double, nullable=False)
    temp_min_c: Mapped[float] = mapped_column(Double, nullable=False)
    temp_max_c: Mapped[float] = mapped_column(Double, nullable=False)
    violation_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    insured_amount_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="created")
    insurance_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    payout_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_requested")
    blockchain_network: Mapped[str | None] = mapped_column(String(100))
    transaction_hash: Mapped[str | None] = mapped_column(String(66))
    confirmation_status: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)


class Telemetry(Base):
    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_shipment_received", "shipment_id", "received_at", "id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(String(100), nullable=False)
    temperature_c: Mapped[float] = mapped_column(Double, nullable=False)
    humidity_pct: Mapped[float] = mapped_column(Double, nullable=False)
    recorded_at: Mapped[datetime | None] = mapped_column(UTC_DATETIME)
    received_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
    latitude: Mapped[float] = mapped_column(Double, nullable=False)
    longitude: Mapped[float] = mapped_column(Double, nullable=False)
    progress_pct: Mapped[float] = mapped_column(Double, nullable=False)
    location_source: Mapped[str] = mapped_column(String(32), nullable=False, default="backend_simulated")


class ShipmentEvent(Base):
    __tablename__ = "shipment_events"
    __table_args__ = (Index("ix_events_shipment_occurred", "shipment_id", "occurred_at", "id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    last_sequence_number: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTC_DATETIME)
    rate_window_started_at: Mapped[datetime | None] = mapped_column(UTC_DATETIME)
    rate_window_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)


class DeviceKey(Base):
    __tablename__ = "device_keys"
    __table_args__ = (ForeignKeyConstraint(["device_id"], ["devices.id"]),)

    device_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    key_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    public_key_pem: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)


class DeviceAssignment(Base):
    __tablename__ = "device_assignments"

    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), primary_key=True)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)


class SignedTelemetryReceipt(Base):
    __tablename__ = "signed_telemetry_receipts"
    __table_args__ = (
        UniqueConstraint("device_id", "sequence_number", name="uq_signed_device_sequence"),
        Index("ix_signed_receipts_shipment", "shipment_id", "sequence_number"),
    )

    telemetry_id: Mapped[str] = mapped_column(ForeignKey("telemetry.id"), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    key_id: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payload_version: Mapped[int] = mapped_column(Integer, nullable=False)
    firmware_version: Mapped[str] = mapped_column(String(64), nullable=False)
    temperature_milli_c: Mapped[int] = mapped_column(Integer, nullable=False)
    humidity_milli_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    signature: Mapped[str] = mapped_column(String(128), nullable=False)
    canonical_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    missing_from: Mapped[int | None] = mapped_column(BigInteger)
    missing_to: Mapped[int | None] = mapped_column(BigInteger)


class IngestionAudit(Base):
    __tablename__ = "ingestion_audit"
    __table_args__ = (Index("ix_ingestion_audit_received", "received_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shipment_id: Mapped[str | None] = mapped_column(String(36))
    device_id: Mapped[str | None] = mapped_column(String(100))
    sequence_number: Mapped[int | None] = mapped_column(BigInteger)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    received_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)


class IntegrityBatch(Base):
    __tablename__ = "integrity_batches"
    __table_args__ = (
        Index("ix_integrity_batches_shipment", "shipment_id", "sealed_at", "id"),
        Index("ix_integrity_batches_anchor", "anchor_status", "sealed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="SEALED")
    first_sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False)
    merkle_root: Mapped[str] = mapped_column(String(64), nullable=False)
    hash_version: Mapped[str] = mapped_column(String(16), nullable=False, default="MERKLE-v1")
    verification_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_CHECKED")
    anchor_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_READY")
    sealed_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
    verified_at: Mapped[datetime | None] = mapped_column(UTC_DATETIME)


class IntegrityBatchItem(Base):
    __tablename__ = "integrity_batch_items"
    __table_args__ = (
        UniqueConstraint("batch_id", "leaf_index", name="uq_integrity_batch_leaf_index"),
        UniqueConstraint("telemetry_id", name="uq_integrity_batch_telemetry"),
    )

    batch_id: Mapped[str] = mapped_column(ForeignKey("integrity_batches.id"), primary_key=True)
    telemetry_id: Mapped[str] = mapped_column(ForeignKey("telemetry.id"), primary_key=True)
    leaf_index: Mapped[int] = mapped_column(Integer, nullable=False)
    leaf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    sequence_number: Mapped[int] = mapped_column(BigInteger, nullable=False)


class IntegrationOutbox(Base):
    __tablename__ = "integration_outbox"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_integration_outbox_idempotency"),
        Index("ix_integration_outbox_ready", "status", "available_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(36), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTC_DATETIME, nullable=False, default=utc_now)
