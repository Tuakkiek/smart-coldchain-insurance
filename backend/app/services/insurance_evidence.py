"""Fail-closed evidence gate between a temperature violation and insurance payout."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
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
from app.services.blockchain_outbox import BlockchainCoordinator
from app.services.integrity_anchor_service import IntegrityAnchorCoordinator
from app.services.temperature_policy import out_of_range, utc, utc_iso


POLICY_VERSION = "ANCHORED-EVIDENCE-v1"


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


class InsuranceEvidenceCoordinator:
    """Collect signed samples, require verified anchors, then release one payout."""

    def __init__(
        self,
        payout: BlockchainCoordinator | None,
        integrity: IntegrityAnchorCoordinator | None,
        *,
        max_sample_gap_seconds: int,
    ):
        self.payout = payout
        self.integrity = integrity
        self.max_sample_gap_seconds = max_sample_gap_seconds

    @staticmethod
    def _locked(session: Session, shipment_id: str):
        shipment = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one_or_none()
        event = session.scalars(
            select(ShipmentEvent)
            .where(
                ShipmentEvent.shipment_id == shipment_id,
                ShipmentEvent.type == "INSURANCE_TRIGGERED",
            )
            .order_by(ShipmentEvent.occurred_at, ShipmentEvent.id)
            .limit(1)
            .with_for_update()
        ).first()
        return shipment, event

    @staticmethod
    def _set_evidence_state(
        session: Session,
        shipment: Shipment,
        event: ShipmentEvent,
        status: str,
        *,
        reason: str | None = None,
        evidence: dict | None = None,
    ) -> None:
        details = dict(event.details)
        details["policy_version"] = POLICY_VERSION
        details["evidence_status"] = status
        if reason:
            details["evidence_reason"] = reason
        else:
            details.pop("evidence_reason", None)
        if evidence:
            details.update(evidence)
        event.details = details
        if shipment.payout_status not in {"paid", "pending", "failed"}:
            shipment.payout_status = "evidence_pending"
        session.commit()

    def _collect(self, session: Session, shipment: Shipment, event: ShipmentEvent):
        details = event.details
        try:
            started_at = _parse_utc(details["first_received_at"])
            ended_at = utc(event.occurred_at)
            device_id = details["device_id"]
        except (KeyError, TypeError, ValueError):
            return "rejected", "EVIDENCE_METADATA_INVALID", {}

        rows = list(session.execute(
            select(Telemetry, SignedTelemetryReceipt)
            .outerjoin(
                SignedTelemetryReceipt,
                SignedTelemetryReceipt.telemetry_id == Telemetry.id,
            )
            .where(
                Telemetry.shipment_id == shipment.id,
                Telemetry.device_id == device_id,
                Telemetry.received_at >= started_at,
                Telemetry.received_at <= ended_at,
            )
            .order_by(Telemetry.received_at, Telemetry.id)
        ))
        if not rows:
            return "rejected", "EVIDENCE_EMPTY", {}

        samples = [sample for sample, _receipt in rows]
        receipts = [receipt for _sample, receipt in rows]
        base = {
            "first_received_at": utc_iso(samples[0].received_at),
            "last_received_at": utc_iso(samples[-1].received_at),
            "telemetry_ids": [sample.id for sample in samples],
            "gap_status": "COMPLETE",
        }
        if any(receipt is None for receipt in receipts):
            return "rejected", "SIGNED_EVIDENCE_REQUIRED", base
        if any(not out_of_range(shipment, sample.temperature_c) for sample in samples):
            return "rejected", "EVIDENCE_CONTAINS_IN_RANGE_SAMPLE", base
        if utc(samples[-1].received_at) - utc(samples[0].received_at) < timedelta(
            minutes=shipment.violation_duration_minutes
        ):
            return "rejected", "VIOLATION_DURATION_NOT_MET", base

        for index in range(1, len(rows)):
            previous_sample, previous_receipt = rows[index - 1]
            sample, receipt = rows[index]
            elapsed = (utc(sample.received_at) - utc(previous_sample.received_at)).total_seconds()
            if elapsed > self.max_sample_gap_seconds or receipt.sequence_number != previous_receipt.sequence_number + 1:
                base["gap_status"] = "DATA_INCOMPLETE"
                return "rejected", "EVIDENCE_SEQUENCE_OR_TIME_GAP", base

        memberships = list(session.execute(
            select(IntegrityBatchItem, IntegrityBatch)
            .join(IntegrityBatch, IntegrityBatch.id == IntegrityBatchItem.batch_id)
            .where(IntegrityBatchItem.telemetry_id.in_(base["telemetry_ids"]))
        ))
        if len(memberships) != len(rows):
            return "pending", "EVIDENCE_BATCH_NOT_SEALED", base

        batches_by_id = {batch.id: batch for _item, batch in memberships}
        if any(batch.verification_status == "NOT_CHECKED" for batch in batches_by_id.values()):
            from app.services.batch_service import BatchServiceError, verify_batch

            try:
                for batch in batches_by_id.values():
                    if batch.verification_status == "NOT_CHECKED":
                        verify_batch(session, batch.id, event.occurred_at, self.integrity)
            except BatchServiceError:
                return "pending", "EVIDENCE_VERIFICATION_UNAVAILABLE", base
            batches_by_id = {
                batch_id: session.get(IntegrityBatch, batch_id) for batch_id in batches_by_id
            }
        outboxes = {
            item.aggregate_id: item
            for item in session.scalars(select(IntegrationOutbox).where(
                IntegrationOutbox.kind == "ANCHOR_BATCH",
                IntegrationOutbox.aggregate_id.in_(batches_by_id),
            ))
        }
        batch_evidence = []
        for batch in sorted(batches_by_id.values(), key=lambda value: (utc(value.sealed_at), value.id)):
            outbox = outboxes.get(batch.id)
            batch_evidence.append({
                "batch_id": batch.id,
                "merkle_root": f"0x{batch.merkle_root}",
                "verification_status": batch.verification_status,
                "anchor_status": batch.anchor_status,
                "anchor_transaction_hash": outbox.payload.get("transaction_hash") if outbox else None,
            })
        base["batch_ids"] = [item["batch_id"] for item in batch_evidence]
        base["batches"] = batch_evidence

        if any(batch.verification_status == "DATA_INTEGRITY_FAILED" for batch in batches_by_id.values()):
            return "rejected", "EVIDENCE_INTEGRITY_MISMATCH", base
        if any(batch.anchor_status == "BLOCKCHAIN_FAILED" for batch in batches_by_id.values()):
            return "rejected", "EVIDENCE_ANCHOR_FAILED", base
        if any(
            batch.verification_status != "MATCHED" or batch.anchor_status != "DATA_ANCHORED"
            for batch in batches_by_id.values()
        ):
            return "pending", "EVIDENCE_ANCHOR_PENDING", base
        if self.integrity is None:
            return "pending", "INTEGRITY_ADAPTER_NOT_CONFIGURED", base
        try:
            if not all(self.integrity.verify_on_chain(batch) for batch in batches_by_id.values()):
                return "rejected", "ON_CHAIN_EVIDENCE_MISMATCH", base
        except Exception:
            return "pending", "INTEGRITY_RPC_UNAVAILABLE", base
        return "ready", None, base

    def reconcile(self, session: Session, shipment_id: str) -> str:
        shipment, event = self._locked(session, shipment_id)
        if shipment is None or event is None:
            session.rollback()
            return "NOT_TRIGGERED"
        if shipment.payout_status == "paid":
            details = dict(event.details)
            if details.get("evidence_status") != "PAYOUT_CONFIRMED":
                details["evidence_status"] = "PAYOUT_CONFIRMED"
                event.details = details
                session.commit()
            else:
                session.rollback()
            return "PAYOUT_CONFIRMED"

        outcome, reason, evidence = self._collect(session, shipment, event)
        if outcome == "rejected":
            self._set_evidence_state(
                session, shipment, event, "EVIDENCE_REJECTED", reason=reason, evidence=evidence,
            )
            shipment, event = self._locked(session, shipment_id)
            if shipment is not None and shipment.blockchain_network is None:
                shipment.payout_status = "not_requested"
                session.commit()
            return "EVIDENCE_REJECTED"
        if outcome == "pending":
            self._set_evidence_state(
                session, shipment, event, "EVIDENCE_PENDING", reason=reason, evidence=evidence,
            )
            return "EVIDENCE_PENDING"

        self._set_evidence_state(session, shipment, event, "EVIDENCE_VERIFIED", evidence=evidence)
        if self.payout is None:
            shipment, event = self._locked(session, shipment_id)
            if shipment is not None and event is not None:
                self._set_evidence_state(
                    session,
                    shipment,
                    event,
                    "EVIDENCE_VERIFIED",
                    reason="INSURANCE_BLOCKCHAIN_NOT_CONFIGURED",
                    evidence=evidence,
                )
            return "EVIDENCE_VERIFIED"

        shipment, event = self._locked(session, shipment_id)
        if shipment is None or event is None:
            session.rollback()
            return "NOT_TRIGGERED"
        if shipment.blockchain_network is None:
            self.payout.queue(shipment, event)
            session.commit()
        else:
            session.rollback()
        self.payout.dispatch(session, shipment_id)
        current = session.get(Shipment, shipment_id)
        return "PAYOUT_CONFIRMED" if current and current.payout_status == "paid" else "PAYOUT_PENDING"


def configured_evidence_coordinator(
    settings,
    payout: BlockchainCoordinator | None,
    integrity: IntegrityAnchorCoordinator | None,
) -> InsuranceEvidenceCoordinator | None:
    if not settings.payout_requires_anchored_evidence:
        return None
    return InsuranceEvidenceCoordinator(
        payout,
        integrity,
        max_sample_gap_seconds=settings.max_sample_gap_seconds,
    )
