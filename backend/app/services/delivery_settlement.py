"""Durable, idempotent safe-delivery refund coordination."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.blockchain_adapter import (
    BlockchainError, PolicyAlreadyRefunded, PolicyGateway,
)
from app.models import IntegrationOutbox, Shipment

RAW_TRANSACTION_KEY = "_raw_transaction"


class DeliverySettlementCoordinator:
    def __init__(self, gateway: PolicyGateway, *, confirmations: int = 1):
        self.gateway = gateway
        self.confirmations = confirmations

    def settle_or_sync(self, session: Session, shipment_id: str) -> Shipment:
        shipment = session.get(Shipment, shipment_id)
        if shipment is None:
            raise ValueError("SHIPMENT_NOT_FOUND")
        if shipment.delivery_result != "SAFE" or shipment.status != "delivered":
            return shipment
        if shipment.refund_status == "CONFIRMED":
            return shipment

        outbox = session.scalar(select(IntegrationOutbox).where(
            IntegrationOutbox.kind == "REFUND_POLICY",
            IntegrationOutbox.aggregate_id == shipment_id,
        ))
        if shipment.refund_transaction_hash and outbox:
            return self._sync(session, shipment, outbox)

        try:
            prepared = self.gateway.prepare_refund(
                shipment_id, f"safe-delivery:{shipment_id}", shipment.delivered_at,
            )
        except PolicyAlreadyRefunded as exc:
            shipment.refund_status = "CONFIRMED"
            shipment.refund_transaction_hash = exc.transaction_hash or shipment.refund_transaction_hash
            policy = self.gateway.read_policy(shipment_id)
            shipment.refunded_amount_wei = str(policy.payout_amount_wei)
            shipment.refund_recipient_address = policy.insurer
            session.commit()
            return shipment
        except BlockchainError as exc:
            shipment.refund_status = (
                "WAITING_EXPIRY" if exc.code == "REFUND_WAITING_EXPIRY" else "PENDING"
            )
            shipment.delivery_result_reason = (
                "LEGACY_CONTRACT_WAITING_EXPIRY" if exc.code == "REFUND_WAITING_EXPIRY"
                else f"REFUND_{exc.code}"
            )
            session.commit()
            return shipment

        locked = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one()
        outbox = session.scalar(select(IntegrationOutbox).where(
            IntegrationOutbox.kind == "REFUND_POLICY",
            IntegrationOutbox.aggregate_id == shipment_id,
        ).with_for_update())
        if outbox is None:
            outbox = IntegrationOutbox(
                id=str(uuid4()), kind="REFUND_POLICY", aggregate_id=shipment_id,
                idempotency_key=f"refund:{shipment_id}", status="SUBMITTED",
                payload={
                    "transaction_hash": prepared.transaction_hash,
                    RAW_TRANSACTION_KEY: prepared.raw_transaction,
                },
                attempt_count=0, available_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
            )
            session.add(outbox)
        locked.refund_status = "PENDING"
        locked.refund_transaction_hash = outbox.payload["transaction_hash"]
        locked.refunded_amount_wei = str(prepared.amount_wei)
        locked.refund_recipient_address = prepared.recipient
        session.commit()  # signed bytes are durable before broadcast
        return self._sync(session, locked, outbox)

    def _sync(self, session: Session, shipment: Shipment, outbox: IntegrationOutbox) -> Shipment:
        payload = dict(outbox.payload)
        tx_hash = payload.get("transaction_hash")
        raw = payload.get(RAW_TRANSACTION_KEY)
        try:
            state = self.gateway.refund_receipt_state(tx_hash, self.confirmations)
            if state == "missing" and raw:
                self.gateway.broadcast_refund(raw)
                state = self.gateway.refund_receipt_state(tx_hash, self.confirmations)
            if state == "confirmed":
                policy = self.gateway.read_policy(shipment.id)
                if policy.status != 3:
                    raise BlockchainError("REFUND_ON_CHAIN_MISMATCH")
                shipment.refund_status = "CONFIRMED"
                shipment.refunded_amount_wei = str(policy.payout_amount_wei)
                shipment.refund_recipient_address = policy.insurer
                outbox.status = "CONFIRMED"
                payload.pop(RAW_TRANSACTION_KEY, None)
            elif state == "failed":
                shipment.refund_status = "FAILED"
                shipment.delivery_result_reason = "REFUND_TRANSACTION_FAILED"
                outbox.status = "FAILED"
            else:
                shipment.refund_status = "PENDING"
                outbox.status = "SUBMITTED"
        except Exception as exc:
            shipment.refund_status = "PENDING"
            outbox.last_error = exc.code if isinstance(exc, BlockchainError) else "RPC_UNAVAILABLE"
        outbox.payload = payload
        outbox.attempt_count += 1
        outbox.updated_at = datetime.now(timezone.utc)
        session.commit()
        return shipment


def configured_delivery_settlement(settings, policy_coordinator):
    if policy_coordinator is None:
        return None
    return DeliverySettlementCoordinator(
        policy_coordinator.gateway, confirmations=settings.blockchain_confirmations,
    )
