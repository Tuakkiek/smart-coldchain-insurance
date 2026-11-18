"""Shipment completion, final evidence assessment, and settlement handoff."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    IntegrityBatch, IntegrityBatchItem, Shipment, ShipmentEvent,
    SignedTelemetryReceipt, Telemetry,
)
from app.services.batch_service import BatchServiceError, seal_ready_batch, verify_batch
from app.services.shipments import ShipmentNotFound, ShipmentStateConflict

logger = logging.getLogger(__name__)


def _utc_now(clock) -> datetime:
    now = clock.now() if clock is not None else datetime.now(timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _assess(session: Session, shipment: Shipment) -> tuple[str, str, str]:
    """Return result, reason and refund status. Fail closed on incomplete evidence."""
    has_triggered_event = session.scalar(select(ShipmentEvent.id).where(
        ShipmentEvent.shipment_id == shipment.id,
        ShipmentEvent.type == "INSURANCE_TRIGGERED",
    ).limit(1)) is not None
    if shipment.insurance_status == "triggered" or shipment.payout_status != "not_requested" or has_triggered_event:
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

    has_gap_event = session.scalar(select(ShipmentEvent.id).where(
        ShipmentEvent.shipment_id == shipment.id,
        ShipmentEvent.type == "SENSOR_DATA_GAP",
    ).limit(1)) is not None
    if has_gap_event:
        return "INCOMPLETE", "SENSOR_DATA_GAP", "NOT_APPLICABLE"

    membership_count = session.scalar(select(func.count(IntegrityBatchItem.telemetry_id)).join(
        Telemetry, Telemetry.id == IntegrityBatchItem.telemetry_id,
    ).where(Telemetry.shipment_id == shipment.id)) or 0
    if membership_count != len(samples):
        return "INCOMPLETE", "INTEGRITY_BATCH_PENDING", "NOT_APPLICABLE"
    batches = list(session.scalars(select(IntegrityBatch).where(
        IntegrityBatch.shipment_id == shipment.id,
    )))
    if any(b.verification_status == "DATA_INTEGRITY_FAILED" for b in batches):
        return "INCOMPLETE", "INTEGRITY_VERIFICATION_FAILED", "NOT_APPLICABLE"
    if any(b.verification_status not in {"MATCHED", "VERIFIED"} for b in batches):
        return "INCOMPLETE", "INTEGRITY_VERIFICATION_PENDING", "NOT_APPLICABLE"
    if any(b.anchor_status == "BLOCKCHAIN_FAILED" for b in batches):
        return "INCOMPLETE", "INTEGRITY_ANCHOR_FAILED", "NOT_APPLICABLE"
    if any(b.anchor_status != "DATA_ANCHORED" for b in batches):
        return "INCOMPLETE", "INTEGRITY_ANCHOR_PENDING", "NOT_APPLICABLE"
    if shipment.policy_status != "CONFIRMED":
        return "INCOMPLETE", "ON_CHAIN_POLICY_NOT_CONFIRMED", "NOT_APPLICABLE"
    return "SAFE", "SAFE_DELIVERY_VERIFIED", "PENDING"


def _sync_integrity_and_policy(
    session: Session,
    shipment_id: str,
    now: datetime,
    *,
    integrity_blockchain=None,
    policy_blockchain=None,
) -> None:
    shipment = session.get(Shipment, shipment_id)
    if (
        shipment is not None
        and policy_blockchain is not None
        and shipment.policy_status == "SUBMITTED"
        and shipment.policy_transaction_hash
    ):
        try:
            policy_blockchain.sync_submitted_policy(session, shipment_id)
        except Exception:
            session.rollback()
            logger.exception("Policy sync failed during delivery reconciliation shipment_id=%s", shipment_id)

    batches = list(session.scalars(select(IntegrityBatch).where(
        IntegrityBatch.shipment_id == shipment_id,
    )))
    for batch in batches:
        if integrity_blockchain is not None and batch.anchor_status in {"NOT_READY", "BLOCKCHAIN_PENDING"}:
            try:
                integrity_blockchain.dispatch(session, batch.id)
            except Exception:
                session.rollback()
                logger.exception("Anchor dispatch failed during completion batch_id=%s", batch.id)
        refreshed = session.get(IntegrityBatch, batch.id)
        if refreshed is not None and refreshed.verification_status == "NOT_CHECKED":
            try:
                verify_batch(session, refreshed.id, now, integrity_blockchain)
            except Exception:
                session.rollback()
                logger.exception("Batch verification failed during completion batch_id=%s", refreshed.id)


def _reconcile_violated_payout(
    session: Session,
    shipment_id: str,
    *,
    evidence_coordinator=None,
    insurance_blockchain=None,
) -> None:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None or shipment.refund_status == "CONFIRMED":
        return
    if shipment.payout_status in {"paid", "failed"}:
        return
    if evidence_coordinator is not None:
        try:
            evidence_coordinator.reconcile(session, shipment_id)
        except Exception:
            session.rollback()
            logger.exception("Evidence reconciliation failed for violated shipment_id=%s", shipment_id)
    elif insurance_blockchain is not None and shipment.payout_status == "pending":
        try:
            insurance_blockchain.dispatch(session, shipment_id)
        except Exception:
            session.rollback()
            logger.exception("Payout dispatch failed for violated shipment_id=%s", shipment_id)


def complete_shipment(
    session: Session, shipment_id: str, *, clock, batch_max_records: int,
    batch_max_age_minutes: int, settlement=None,
    integrity_blockchain=None, policy_blockchain=None,
    evidence_coordinator=None, insurance_blockchain=None,
) -> Shipment:
    shipment = session.scalars(select(Shipment).where(
        Shipment.id == shipment_id,
    ).with_for_update()).one_or_none()
    if shipment is None:
        raise ShipmentNotFound
    now = _utc_now(clock)
    if shipment.status != "delivered":
        shipment.status = "delivered"
        shipment.delivered_at = now
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

    tamper_detected = False
    device_ids = list(session.scalars(select(SignedTelemetryReceipt.device_id).where(
        SignedTelemetryReceipt.shipment_id == shipment_id,
    ).distinct()))
    for device_id in device_ids:
        while True:
            try:
                batch = seal_ready_batch(
                    session, shipment_id, device_id, now,
                    max_records=batch_max_records, max_age_minutes=batch_max_age_minutes,
                    force=True, anchor_coordinator=integrity_blockchain,
                )
                if batch is not None:
                    try:
                        verify_batch(session, batch.id, now, integrity_blockchain)
                    except Exception:
                        session.rollback()
                        logger.exception("Batch verify failed after sealing batch_id=%s", batch.id)
            except BatchServiceError as exc:
                if exc.code == "NO_ELIGIBLE_TELEMETRY":
                    break
                if exc.code == "TELEMETRY_INTEGRITY_INVALID":
                    tamper_detected = True
                    break
                raise

    _sync_integrity_and_policy(
        session, shipment_id, now,
        integrity_blockchain=integrity_blockchain,
        policy_blockchain=policy_blockchain,
    )

    shipment = session.scalars(select(Shipment).where(
        Shipment.id == shipment_id,
    ).with_for_update()).one()
    if shipment.refund_status == "CONFIRMED":
        session.commit()
        return shipment

    result, reason, refund = _assess(session, shipment)
    if tamper_detected and result != "VIOLATED":
        result, reason, refund = "INCOMPLETE", "INTEGRITY_VERIFICATION_FAILED", "NOT_APPLICABLE"
    shipment.delivery_result = result
    shipment.delivery_result_reason = reason
    if shipment.refund_status not in {"WAITING_EXPIRY", "FAILED"} or result != "SAFE":
        shipment.refund_status = refund
    session.commit()

    if result == "VIOLATED":
        _reconcile_violated_payout(
            session, shipment_id,
            evidence_coordinator=evidence_coordinator,
            insurance_blockchain=insurance_blockchain,
        )
        return session.get(Shipment, shipment_id)
    if result == "SAFE" and settlement is not None:
        if shipment.refund_status == "FAILED":
            return shipment
        shipment = settlement.settle_or_sync(session, shipment_id)
    return shipment


def reconcile_completed(
    session: Session, shipment_id: str, *, clock=None, settlement=None,
    integrity_blockchain=None, policy_blockchain=None,
    evidence_coordinator=None, insurance_blockchain=None,
) -> Shipment:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        raise ShipmentNotFound
    if shipment.status != "delivered":
        return shipment
    if shipment.delivery_result == "SAFE" and shipment.refund_status == "CONFIRMED":
        return shipment
    if shipment.delivery_result == "INCOMPLETE" and shipment.delivery_result_reason == "INTEGRITY_VERIFICATION_FAILED":
        return shipment
    if shipment.delivery_result == "VIOLATED":
        _reconcile_violated_payout(
            session, shipment_id,
            evidence_coordinator=evidence_coordinator,
            insurance_blockchain=insurance_blockchain,
        )
        return session.get(Shipment, shipment_id)

    now = _utc_now(clock)
    if shipment.delivery_result in {None, "INCOMPLETE"}:
        _sync_integrity_and_policy(
            session, shipment_id, now,
            integrity_blockchain=integrity_blockchain,
            policy_blockchain=policy_blockchain,
        )
        shipment = session.scalars(select(Shipment).where(
            Shipment.id == shipment_id,
        ).with_for_update()).one()
        result, reason, refund = _assess(session, shipment)
        shipment.delivery_result = result
        shipment.delivery_result_reason = reason
        if shipment.refund_status != "CONFIRMED":
            shipment.refund_status = refund
        session.commit()

    if shipment.delivery_result == "VIOLATED":
        _reconcile_violated_payout(
            session, shipment_id,
            evidence_coordinator=evidence_coordinator,
            insurance_blockchain=insurance_blockchain,
        )
        return session.get(Shipment, shipment_id)

    if shipment.delivery_result == "SAFE" and settlement is not None:
        if shipment.refund_status == "FAILED":
            return shipment
        return settlement.settle_or_sync(session, shipment_id)
    return shipment


def retry_refund(session: Session, shipment_id: str, *, settlement=None) -> Shipment:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        raise ShipmentNotFound
    if shipment.status != "delivered":
        raise ShipmentStateConflict("SHIPMENT_NOT_DELIVERED", "Shipment must be delivered before retrying refund")
    if shipment.delivery_result != "SAFE":
        raise ShipmentStateConflict("REFUND_NOT_ELIGIBLE", "Only SAFE deliveries can retry refund")
    if settlement is None:
        raise BatchServiceError(503, "BLOCKCHAIN_NOT_CONFIGURED", "Blockchain settlement is not configured")
    return settlement.settle_or_sync(session, shipment_id, force_retry=True)
