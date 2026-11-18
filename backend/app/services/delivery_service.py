"""Shipment completion, final evidence assessment, and settlement handoff."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    IntegrityBatch, IntegrityBatchItem, Shipment, ShipmentEvent,
    SignedTelemetryReceipt, Telemetry,
)
from app.services.batch_service import BatchServiceError, seal_ready_batch
from app.services.shipments import ShipmentNotFound


def _assess(session: Session, shipment: Shipment) -> tuple[str, str, str]:
    """Return result, reason and refund status. Fail closed on incomplete evidence."""
    if shipment.insurance_status == "triggered" or shipment.payout_status != "not_requested":
        return "VIOLATED", "TEMPERATURE_POLICY_TRIGGERED", "NOT_APPLICABLE"

    samples = list(session.scalars(select(Telemetry).where(
        Telemetry.shipment_id == shipment.id,
    ).order_by(Telemetry.received_at, Telemetry.id)))
    if not samples:
        return "INCOMPLETE", "NO_TELEMETRY", "NOT_APPLICABLE"
    latest = samples[-1]
    if latest.temperature_c < shipment.temp_min_c or latest.temperature_c > shipment.temp_max_c:
        return "INCOMPLETE", "ACTIVE_BREACH_UNRESOLVED", "NOT_APPLICABLE"

    receipts = list(session.scalars(select(SignedTelemetryReceipt).where(
        SignedTelemetryReceipt.shipment_id == shipment.id,
    ).order_by(SignedTelemetryReceipt.device_id, SignedTelemetryReceipt.sequence_number)))
    if len(receipts) != len(samples):
        return "INCOMPLETE", "UNSIGNED_TELEMETRY_PRESENT", "NOT_APPLICABLE"
    if any(r.missing_from is not None for r in receipts):
        return "INCOMPLETE", "SEQUENCE_GAP", "NOT_APPLICABLE"
    previous: dict[str, int] = {}
    for receipt in receipts:
        prior = previous.get(receipt.device_id)
        if prior is not None and receipt.sequence_number != prior + 1:
            return "INCOMPLETE", "SEQUENCE_GAP", "NOT_APPLICABLE"
        previous[receipt.device_id] = receipt.sequence_number

    membership_count = session.scalar(select(func.count(IntegrityBatchItem.telemetry_id)).join(
        Telemetry, Telemetry.id == IntegrityBatchItem.telemetry_id,
    ).where(Telemetry.shipment_id == shipment.id)) or 0
    if membership_count != len(samples):
        return "INCOMPLETE", "INTEGRITY_BATCH_PENDING", "NOT_APPLICABLE"
    batches = list(session.scalars(select(IntegrityBatch).where(
        IntegrityBatch.shipment_id == shipment.id,
    )))
    if any(b.verification_status not in {"MATCHED", "VERIFIED"} for b in batches):
        return "INCOMPLETE", "INTEGRITY_VERIFICATION_PENDING", "NOT_APPLICABLE"
    if any(b.anchor_status != "DATA_ANCHORED" for b in batches):
        return "INCOMPLETE", "INTEGRITY_ANCHOR_PENDING", "NOT_APPLICABLE"
    if shipment.policy_status != "CONFIRMED":
        return "INCOMPLETE", "ON_CHAIN_POLICY_NOT_CONFIRMED", "NOT_APPLICABLE"
    return "SAFE", "SAFE_DELIVERY_VERIFIED", "PENDING"


def complete_shipment(
    session: Session, shipment_id: str, *, clock, batch_max_records: int,
    batch_max_age_minutes: int, settlement=None,
) -> Shipment:
    shipment = session.scalars(select(Shipment).where(
        Shipment.id == shipment_id,
    ).with_for_update()).one_or_none()
    if shipment is None:
        raise ShipmentNotFound
    now = clock.now()
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if shipment.status != "delivered":
        shipment.status = "delivered"
        shipment.delivered_at = now.astimezone(timezone.utc)
        shipment.delivery_source = "admin_simulated"
        session.add(ShipmentEvent(
            id=str(uuid4()), shipment_id=shipment.id, type="SHIPMENT_DELIVERED",
            occurred_at=shipment.delivered_at,
            details={
                "delivery_source": "admin_simulated",
                "latitude": shipment.destination_latitude,
                "longitude": shipment.destination_longitude,
                "progress_pct": 100.0,
            },
        ))
    session.commit()  # closes telemetry before any blockchain/RPC work

    device_ids = list(session.scalars(select(SignedTelemetryReceipt.device_id).where(
        SignedTelemetryReceipt.shipment_id == shipment_id,
    ).distinct()))
    for device_id in device_ids:
        while True:
            try:
                seal_ready_batch(
                    session, shipment_id, device_id, now,
                    max_records=batch_max_records, max_age_minutes=batch_max_age_minutes,
                    force=True, anchor_coordinator=None,
                )
            except BatchServiceError as exc:
                if exc.code == "NO_ELIGIBLE_TELEMETRY":
                    break
                raise

    shipment = session.scalars(select(Shipment).where(
        Shipment.id == shipment_id,
    ).with_for_update()).one()
    result, reason, refund = _assess(session, shipment)
    shipment.delivery_result = result
    shipment.delivery_result_reason = reason
    shipment.refund_status = refund
    session.commit()
    if result == "SAFE" and settlement is not None:
        shipment = settlement.settle_or_sync(session, shipment_id)
    return shipment


def reconcile_completed(session: Session, shipment_id: str, *, settlement=None) -> Shipment:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        raise ShipmentNotFound
    if shipment.status != "delivered":
        return shipment
    result, reason, refund = _assess(session, shipment)
    shipment.delivery_result = result
    shipment.delivery_result_reason = reason
    if shipment.refund_status != "CONFIRMED":
        shipment.refund_status = refund
    session.commit()
    if result == "SAFE" and settlement is not None:
        return settlement.settle_or_sync(session, shipment_id)
    return shipment
