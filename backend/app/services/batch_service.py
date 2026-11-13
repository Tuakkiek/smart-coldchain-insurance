"""Transactional sealing and verification of signed telemetry Merkle batches."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    IntegrityBatch,
    IntegrityBatchItem,
    IntegrationOutbox,
    Shipment,
    ShipmentEvent,
    SignedTelemetryReceipt,
    Telemetry,
)
from app.services.integrity_service import RecordIntegrityError, calculate_batch


class BatchServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message
        super().__init__(message)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _eligible_rows(
    session: Session, shipment_id: str, device_id: str, limit: int,
) -> list[tuple[Telemetry, SignedTelemetryReceipt]]:
    statement = (
        select(Telemetry, SignedTelemetryReceipt)
        .join(SignedTelemetryReceipt, SignedTelemetryReceipt.telemetry_id == Telemetry.id)
        .outerjoin(IntegrityBatchItem, IntegrityBatchItem.telemetry_id == Telemetry.id)
        .where(
            SignedTelemetryReceipt.shipment_id == shipment_id,
            SignedTelemetryReceipt.device_id == device_id,
            IntegrityBatchItem.telemetry_id.is_(None),
        )
        .order_by(SignedTelemetryReceipt.sequence_number, Telemetry.id)
        .limit(limit)
        .with_for_update()
    )
    return list(session.execute(statement))


def seal_ready_batch(
    session: Session,
    shipment_id: str,
    device_id: str,
    now: datetime,
    *,
    max_records: int = 100,
    max_age_minutes: int = 5,
    force: bool = False,
    anchor_coordinator=None,
) -> IntegrityBatch | None:
    """Seal one pair-specific batch when size/age is reached, or explicitly forced."""
    if not 1 <= max_records <= 100:
        raise BatchServiceError(422, "INVALID_BATCH_SIZE", "max_records must be in [1, 100]")
    if session.get(Shipment, shipment_id) is None:
        raise BatchServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment not found")
    rows = _eligible_rows(session, shipment_id, device_id, max_records)
    if not rows:
        if force:
            raise BatchServiceError(409, "NO_ELIGIBLE_TELEMETRY", "No unbatched signed telemetry is available")
        return None
    age_ready = _utc(now) - _utc(rows[0][0].received_at) >= timedelta(minutes=max_age_minutes)
    size_ready = len(rows) >= max_records
    if not force and not size_ready and not age_ready:
        return None

    try:
        calculation = calculate_batch(rows)
    except RecordIntegrityError as exc:
        session.rollback()
        raise BatchServiceError(409, "TELEMETRY_INTEGRITY_INVALID", str(exc)) from exc

    batch_id = str(uuid4())
    sealed_at = _utc(now)
    batch = IntegrityBatch(
        id=batch_id,
        shipment_id=shipment_id,
        device_id=device_id,
        status="SEALED",
        first_sequence=calculation.sequences[0],
        last_sequence=calculation.sequences[-1],
        record_count=len(rows),
        merkle_root=calculation.merkle_root.hex(),
        hash_version="MERKLE-v1",
        verification_status="NOT_CHECKED",
        anchor_status="NOT_READY",
        sealed_at=sealed_at,
    )
    session.add(batch)
    for index, ((sample, _receipt), digest, sequence) in enumerate(
        zip(rows, calculation.leaf_hashes, calculation.sequences, strict=True)
    ):
        session.add(IntegrityBatchItem(
            batch_id=batch_id,
            telemetry_id=sample.id,
            leaf_index=index,
            leaf_hash=digest.hex(),
            sequence_number=sequence,
        ))
    session.add(IntegrationOutbox(
        id=str(uuid4()),
        kind="ANCHOR_BATCH",
        aggregate_id=batch_id,
        idempotency_key=f"anchor:{batch_id}",
        status="PENDING",
        payload={
            "batch_id": batch_id,
            "shipment_id": shipment_id,
            "device_id": device_id,
            "merkle_root": f"0x{batch.merkle_root}",
            "first_sequence": batch.first_sequence,
            "last_sequence": batch.last_sequence,
            "record_count": batch.record_count,
            "hash_version": batch.hash_version,
        },
        attempt_count=0,
        available_at=sealed_at,
        created_at=sealed_at,
        updated_at=sealed_at,
    ))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise BatchServiceError(409, "BATCH_SEAL_CONFLICT", "Telemetry was sealed concurrently") from exc
    if anchor_coordinator is not None:
        anchor_coordinator.dispatch(session, batch.id)
    return batch


def get_batch(session: Session, batch_id: str) -> IntegrityBatch:
    batch = session.get(IntegrityBatch, batch_id)
    if batch is None:
        raise BatchServiceError(404, "BATCH_NOT_FOUND", "Integrity batch not found")
    return batch


def list_batches(session: Session, shipment_id: str) -> list[IntegrityBatch]:
    if session.get(Shipment, shipment_id) is None:
        raise BatchServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment not found")
    return list(session.scalars(
        select(IntegrityBatch)
        .where(IntegrityBatch.shipment_id == shipment_id)
        .order_by(
            IntegrityBatch.sealed_at,
            IntegrityBatch.device_id,
            IntegrityBatch.first_sequence,
            IntegrityBatch.id,
        )
    ))


def get_anchor_outbox(session: Session, batch_id: str) -> IntegrationOutbox | None:
    return session.scalar(select(IntegrationOutbox).where(
        IntegrationOutbox.kind == "ANCHOR_BATCH",
        IntegrationOutbox.aggregate_id == batch_id,
    ))


def _timestamp(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def batch_dict(batch: IntegrityBatch, outbox: IntegrationOutbox | None = None) -> dict:
    value = {
        "batch_id": batch.id,
        "shipment_id": batch.shipment_id,
        "device_id": batch.device_id,
        "status": batch.status,
        "first_sequence": batch.first_sequence,
        "last_sequence": batch.last_sequence,
        "record_count": batch.record_count,
        "merkle_root": f"0x{batch.merkle_root}",
        "hash_version": batch.hash_version,
        "verification_status": batch.verification_status,
        "anchor_status": batch.anchor_status,
        "sealed_at": _utc(batch.sealed_at),
        "verified_at": _utc(batch.verified_at) if batch.verified_at else None,
    }
    if outbox is not None:
        payload = outbox.payload
        value["anchor_transaction"] = {
            "network": payload.get("network"),
            "transaction_hash": payload.get("transaction_hash"),
            "status": outbox.status,
            "attempt_count": outbox.attempt_count,
            "last_error": outbox.last_error,
            "submitted_at": _timestamp(payload.get("submitted_at")),
            "confirmed_at": _timestamp(payload.get("confirmed_at")),
        }
    return value


def batch_view(session: Session, batch: IntegrityBatch) -> dict:
    return batch_dict(batch, get_anchor_outbox(session, batch.id))


def integrity_summary(session: Session, shipment_id: str) -> dict:
    batches = list_batches(session, shipment_id)
    verification = (
        "DATA_INTEGRITY_FAILED" if any(item.verification_status == "DATA_INTEGRITY_FAILED" for item in batches)
        else "MATCHED" if batches and all(item.verification_status == "MATCHED" for item in batches)
        else "NOT_CHECKED"
    )
    anchor = (
        "BLOCKCHAIN_FAILED" if any(item.anchor_status == "BLOCKCHAIN_FAILED" for item in batches)
        else "DATA_ANCHORED" if batches and all(item.anchor_status == "DATA_ANCHORED" for item in batches)
        else "BLOCKCHAIN_PENDING" if any(item.anchor_status == "BLOCKCHAIN_PENDING" for item in batches)
        else "NOT_READY"
    )
    return {
        "shipment_id": shipment_id,
        "batch_count": len(batches),
        "record_count": sum(item.record_count for item in batches),
        "verification_status": verification,
        "anchor_status": anchor,
    }


def verify_batch(session: Session, batch_id: str, now: datetime, anchor_coordinator=None) -> dict:
    batch = get_batch(session, batch_id)
    persisted = list(session.execute(
        select(IntegrityBatchItem, Telemetry, SignedTelemetryReceipt)
        .join(Telemetry, Telemetry.id == IntegrityBatchItem.telemetry_id)
        .join(SignedTelemetryReceipt, SignedTelemetryReceipt.telemetry_id == Telemetry.id)
        .where(IntegrityBatchItem.batch_id == batch_id)
        .order_by(IntegrityBatchItem.leaf_index)
    ))
    calculated_root: str | None = None
    matched = len(persisted) == batch.record_count
    try:
        calculation = calculate_batch([(sample, receipt) for _item, sample, receipt in persisted])
        calculated_root = f"0x{calculation.merkle_root.hex()}"
        matched = matched and calculation.merkle_root.hex() == batch.merkle_root
        matched = matched and calculation.sequences == tuple(item.sequence_number for item, _sample, _receipt in persisted)
        matched = matched and calculation.leaf_hashes == tuple(
            bytes.fromhex(item.leaf_hash) for item, _sample, _receipt in persisted
        )
        matched = matched and bool(calculation.sequences)
        matched = matched and calculation.sequences[0] == batch.first_sequence
        matched = matched and calculation.sequences[-1] == batch.last_sequence
    except (RecordIntegrityError, ValueError):
        matched = False

    on_chain_match: bool | None = None
    if matched and batch.anchor_status == "DATA_ANCHORED" and anchor_coordinator is not None:
        try:
            on_chain_match = anchor_coordinator.verify_on_chain(batch)
        except Exception as exc:
            session.rollback()
            raise BatchServiceError(
                503, "BLOCKCHAIN_UNAVAILABLE", "Could not read the anchored batch from blockchain",
            ) from exc
        matched = matched and on_chain_match

    previous = batch.verification_status
    batch.verification_status = "MATCHED" if matched else "DATA_INTEGRITY_FAILED"
    batch.verified_at = _utc(now)
    if not matched and previous != "DATA_INTEGRITY_FAILED":
        session.add(ShipmentEvent(
            id=str(uuid4()),
            shipment_id=batch.shipment_id,
            type="INTEGRITY_MISMATCH",
            occurred_at=batch.verified_at,
            details={
                "batch_id": batch.id,
                "stored_root": f"0x{batch.merkle_root}",
                "calculated_root": calculated_root,
            },
        ))
    session.commit()
    return {
        **batch_view(session, batch),
        "calculated_root": calculated_root,
        "on_chain_match": on_chain_match,
    }
