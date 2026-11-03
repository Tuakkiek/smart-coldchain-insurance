"""Storage models; SQLAlchemy types work with SQLite and PostgreSQL."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, DateTime, Double, ForeignKey, Index, Integer, JSON, String
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
