"""Rebuild immutable MERKLE-v1 records from accepted signed telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from collections.abc import Sequence

from app.models import SignedTelemetryReceipt, Telemetry
from app.services.telemetry_protocol import batch_root, leaf_hash


class RecordIntegrityError(ValueError):
    """Stored telemetry no longer agrees with its immutable signed receipt."""


@dataclass(frozen=True)
class BatchCalculation:
    merkle_root: bytes
    leaf_hashes: tuple[bytes, ...]
    sequences: tuple[int, ...]


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _seconds(value: datetime) -> str:
    normalized = _utc(value)
    if normalized.microsecond:
        raise RecordIntegrityError("recorded_at precision changed after ingestion")
    return normalized.strftime("%Y-%m-%dT%H:%M:%SZ")


def _microseconds(value: datetime) -> str:
    return _utc(value).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def accepted_record(sample: Telemetry, receipt: SignedTelemetryReceipt) -> dict:
    """Return the exact canonical record projection and reject split-row tampering."""
    if sample.id != receipt.telemetry_id:
        raise RecordIntegrityError("telemetry/receipt identity mismatch")
    if sample.shipment_id != receipt.shipment_id or sample.device_id != receipt.device_id:
        raise RecordIntegrityError("telemetry/receipt ownership mismatch")
    if sample.recorded_at is None:
        raise RecordIntegrityError("signed telemetry lost recorded_at")
    if Decimal(str(sample.temperature_c)) * 1000 != receipt.temperature_milli_c:
        raise RecordIntegrityError("temperature does not match signed receipt")
    if Decimal(str(sample.humidity_pct)) * 1000 != receipt.humidity_milli_pct:
        raise RecordIntegrityError("humidity does not match signed receipt")
    return {
        "payload_version": receipt.payload_version,
        "shipment_id": receipt.shipment_id,
        "device_id": receipt.device_id,
        "key_id": receipt.key_id,
        "sequence_number": receipt.sequence_number,
        "temperature_milli_c": receipt.temperature_milli_c,
        "humidity_milli_pct": receipt.humidity_milli_pct,
        "recorded_at": _seconds(sample.recorded_at),
        "received_at": _microseconds(sample.received_at),
        "firmware_version": receipt.firmware_version,
        "signature": receipt.signature,
    }


def calculate_batch(rows: Sequence[tuple[Telemetry, SignedTelemetryReceipt]]) -> BatchCalculation:
    ordered = sorted(rows, key=lambda row: row[1].sequence_number)
    records = [accepted_record(sample, receipt) for sample, receipt in ordered]
    root = batch_root(records)
    return BatchCalculation(
        merkle_root=root,
        leaf_hashes=tuple(leaf_hash(record) for record in records),
        sequences=tuple(record["sequence_number"] for record in records),
    )
