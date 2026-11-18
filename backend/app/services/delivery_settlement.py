"""Durable, idempotent safe-delivery refund coordination."""
from __future__ import annotations

import inspect
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.blockchain_adapter import (
    BlockchainError, PolicyAlreadyRefunded, PolicyGateway,
)
from app.models import IntegrationOutbox, Shipment

logger = logging.getLogger(__name__)
RAW_TRANSACTION_KEY = "_raw_transaction"
TERMINAL_REFUND_ERRORS = frozenset({
    "POLICY_NOT_ACTIVE",
    "ORACLE_MISMATCH",
    "INSURER_MISMATCH",
    "ORACLE_SIGNER_NOT_CONFIGURED",
    "INSURER_SIGNER_NOT_CONFIGURED",
    "INVALID_CONTRACT_ADDRESS",
    "CONTRACT_NOT_DEPLOYED",
    "CHAIN_ID_MISMATCH",
})


class DeliverySettlementCoordinator:
    def __init__(self, gateway: PolicyGateway, *, confirmations: int = 1):
        self.gateway = gateway
        self.confirmations = confirmations

    def _read_policy(self, shipment: Shipment):
        fn = self.gateway.read_policy
        if "contract_address" in inspect.signature(fn).parameters and shipment.policy_contract_address:
            return fn(shipment.id, contract_address=shipment.policy_contract_address)
        return fn(shipment.id)

    def _prepare_refund(self, shipment: Shipment):
        fn = self.gateway.prepare_refund
        delivered_at = shipment.delivered_at or datetime.now(timezone.utc)
        if "contract_address" in inspect.signature(fn).parameters and shipment.policy_contract_address:
            return fn(
                shipment.id,
                f"safe-delivery:{shipment.id}",
                delivered_at,
                contract_address=shipment.policy_contract_address,
            )
        return fn(shipment.id, f"safe-delivery:{shipment.id}", delivered_at)

    def _mark_already_paid(self, shipment: Shipment, outbox: IntegrationOutbox | None = None) -> None:
        shipment.refund_status = "NOT_APPLICABLE"
        shipment.delivery_result = "VIOLATED"
        shipment.delivery_result_reason = "POLICY_ALREADY_PAID_ON_CHAIN"
        if outbox is not None:
            payload = dict(outbox.payload)
            payload.pop(RAW_TRANSACTION_KEY, None)
            outbox.payload = payload
            outbox.status = "FAILED"
            outbox.last_error = "POLICY_ALREADY_PAID"

    def _mark_already_refunded(
        self, shipment: Shipment, tx_hash: str | None = None, outbox: IntegrationOutbox | None = None,
    ) -> None:
        shipment.refund_status = "CONFIRMED"
        shipment.delivery_result_reason = "SAFE_DELIVERY_VERIFIED"
        if tx_hash:
            shipment.refund_transaction_hash = tx_hash
        policy = self._read_policy(shipment)
        shipment.refunded_amount_wei = str(policy.payout_amount_wei)
        shipment.refund_recipient_address = policy.insurer
        if outbox is not None:
            payload = dict(outbox.payload)
            payload.pop(RAW_TRANSACTION_KEY, None)
            if shipment.refund_transaction_hash:
                payload["transaction_hash"] = shipment.refund_transaction_hash
            outbox.payload = payload
            outbox.status = "CONFIRMED"
            outbox.last_error = None

    def settle_or_sync(
        self, session: Session, shipment_id: str, *, force_retry: bool = False,
    ) -> Shipment:
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
        if outbox is not None and outbox.status == "FAILED":
            if not force_retry:
                return shipment
            try:
                policy = self._read_policy(shipment)
                if policy.status == 3:
                    self._mark_already_refunded(shipment, shipment.refund_transaction_hash, outbox)
                    session.commit()
                    return shipment
                if policy.status == 2:
                    self._mark_already_paid(shipment, outbox)
                    session.commit()
                    return shipment
            except Exception as exc:
                code = exc.code if isinstance(exc, BlockchainError) else "RPC_UNAVAILABLE"
                shipment.refund_status = "PENDING"
                shipment.delivery_result_reason = f"REFUND_{code}"
                outbox.last_error = code
                session.commit()
                return shipment
            session.delete(outbox)
            shipment.refund_transaction_hash = None
            shipment.refund_status = "PENDING"
            session.commit()
            outbox = None

        if shipment.refund_transaction_hash and outbox is not None:
            return self._sync(session, shipment, outbox)

        try:
            prepared = self._prepare_refund(shipment)
        except PolicyAlreadyRefunded as exc:
            try:
                self._mark_already_refunded(shipment, exc.transaction_hash or shipment.refund_transaction_hash)
            except Exception:
                shipment.refund_status = "CONFIRMED"
                shipment.refund_transaction_hash = exc.transaction_hash or shipment.refund_transaction_hash
            session.commit()
            return shipment
        except BlockchainError as exc:
            if exc.code == "REFUND_WAITING_EXPIRY":
                shipment.refund_status = "WAITING_EXPIRY"
                shipment.delivery_result_reason = "LEGACY_CONTRACT_WAITING_EXPIRY"
            elif exc.code == "POLICY_ALREADY_PAID":
                self._mark_already_paid(shipment)
            elif exc.code in TERMINAL_REFUND_ERRORS:
                shipment.refund_status = "FAILED"
                shipment.delivery_result_reason = f"REFUND_{exc.code}"
            else:
                shipment.refund_status = "PENDING"
                shipment.delivery_result_reason = f"REFUND_{exc.code}"
            session.commit()
            return shipment
        except Exception as exc:
            logger.warning("Refund prepare deferred for %s: %s", shipment_id, exc)
            shipment.refund_status = "PENDING"
            shipment.delivery_result_reason = "REFUND_RPC_UNAVAILABLE"
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
            now = datetime.now(timezone.utc)
            outbox = IntegrationOutbox(
                id=str(uuid4()), kind="REFUND_POLICY", aggregate_id=shipment_id,
                idempotency_key=f"refund:{shipment_id}", status="SUBMITTED",
                payload={
                    "transaction_hash": prepared.transaction_hash,
                    RAW_TRANSACTION_KEY: prepared.raw_transaction,
                },
                attempt_count=0, available_at=now, created_at=now, updated_at=now,
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
            if state == "missing":
                policy = self._read_policy(shipment)
                if policy.status == 3:
                    self._mark_already_refunded(shipment, tx_hash, outbox)
                    outbox.attempt_count += 1
                    outbox.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    return shipment
                if policy.status == 2:
                    self._mark_already_paid(shipment, outbox)
                    outbox.attempt_count += 1
                    outbox.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    return shipment
                if raw:
                    try:
                        self.gateway.broadcast_refund(raw)
                    except Exception:
                        # Node may have accepted the tx on an earlier timed-out call.
                        state = self.gateway.refund_receipt_state(tx_hash, self.confirmations)
                        if state == "missing":
                            policy_after = self._read_policy(shipment)
                            if policy_after.status == 3:
                                self._mark_already_refunded(shipment, tx_hash, outbox)
                                outbox.attempt_count += 1
                                outbox.updated_at = datetime.now(timezone.utc)
                                session.commit()
                                return shipment
                            raise
                    else:
                        state = self.gateway.refund_receipt_state(tx_hash, self.confirmations)
            if state == "confirmed":
                policy = self._read_policy(shipment)
                if policy.status != 3:
                    raise BlockchainError("REFUND_ON_CHAIN_MISMATCH")
                shipment.refund_status = "CONFIRMED"
                shipment.delivery_result_reason = "SAFE_DELIVERY_VERIFIED"
                shipment.refunded_amount_wei = str(policy.payout_amount_wei)
                shipment.refund_recipient_address = policy.insurer
                outbox.status = "CONFIRMED"
                outbox.last_error = None
                payload.pop(RAW_TRANSACTION_KEY, None)
                outbox.payload = payload
            elif state == "failed":
                shipment.refund_status = "FAILED"
                shipment.delivery_result_reason = "REFUND_TRANSACTION_FAILED"
                outbox.status = "FAILED"
                outbox.last_error = "REFUND_TRANSACTION_FAILED"
                payload.pop(RAW_TRANSACTION_KEY, None)
                outbox.payload = payload
            else:
                shipment.refund_status = "PENDING"
                outbox.status = "SUBMITTED"
                outbox.payload = payload
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
