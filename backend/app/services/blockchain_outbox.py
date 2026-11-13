"""Durable, retryable handoff from insurance events to the local chain."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.blockchain_adapter import (
    BlockchainError, BlockchainGateway, PolicyAlreadyPaid, Web3BlockchainAdapter,
)
from app.models import Shipment, ShipmentEvent
from app.services.temperature_policy import utc_iso


logger = logging.getLogger(__name__)
RAW_TRANSACTION_KEY = "_raw_transaction"


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class BlockchainCoordinator:
    def __init__(
        self, network: str, gateway: BlockchainGateway, receipt_timeout_seconds: int = 15,
    ):
        self.network = network
        self.gateway = gateway
        self.receipt_timeout_seconds = receipt_timeout_seconds

    def queue(self, shipment: Shipment, event: ShipmentEvent) -> None:
        shipment.blockchain_network = self.network
        shipment.confirmation_status = "pending"
        shipment.payout_status = "pending"
        event.details = {
            **event.details,
            "evidence_status": "PAYOUT_PENDING",
            "blockchain_status": "BLOCKCHAIN_PENDING",
            "attempt_count": 0,
        }

    @staticmethod
    def _locked_records(session: Session, shipment_id: str):
        shipment = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one_or_none()
        if shipment is None:
            return None, None
        event = session.scalars(
            select(ShipmentEvent)
            .where(ShipmentEvent.shipment_id == shipment_id, ShipmentEvent.type == "INSURANCE_TRIGGERED")
            .order_by(ShipmentEvent.occurred_at, ShipmentEvent.id).limit(1)
        ).first()
        return shipment, event

    @staticmethod
    def _update(
        session: Session, shipment: Shipment, event: ShipmentEvent, status: str,
        error_code: str | None = None,
    ) -> None:
        shipment.confirmation_status = status
        shipment.payout_status = {"pending": "pending", "success": "paid", "failed": "failed"}[status]
        details = dict(event.details)
        details["blockchain_status"] = f"BLOCKCHAIN_{status.upper()}"
        details["evidence_status"] = {
            "pending": "PAYOUT_PENDING",
            "success": "PAYOUT_CONFIRMED",
            "failed": "PAYOUT_FAILED",
        }[status]
        if error_code:
            details["last_error"] = error_code
        else:
            details.pop("last_error", None)
        event.details = details
        session.commit()

    def _record_status(
        self, session: Session, shipment_id: str, status: str, error: str | None = None,
        expected_hash: str | None = None,
    ) -> None:
        shipment, event = self._locked_records(session, shipment_id)
        if shipment is None or event is None:
            session.rollback()
            return
        if shipment.confirmation_status == "success" and status != "success":
            session.rollback()
            return
        if expected_hash is not None and shipment.transaction_hash != expected_hash:
            session.rollback()
            return
        self._update(session, shipment, event, status, error)

    def _finish_if_mined(
        self, session: Session, shipment_id: str, event_id: str,
        detected_at: datetime, transaction_hash: str,
    ) -> bool:
        receipt_status = self.gateway.receipt_succeeded(transaction_hash)
        if receipt_status is None:
            return False
        if receipt_status and self.gateway.policy_paid_for(shipment_id, event_id, detected_at):
            self._record_status(session, shipment_id, "success", expected_hash=transaction_hash)
        else:
            self._record_status(
                session, shipment_id, "failed", "TRANSACTION_REVERTED_OR_WRONG_POLICY",
                expected_hash=transaction_hash,
            )
        return True

    def dispatch(self, session: Session, shipment_id: str) -> None:
        """Persist the signed transaction before broadcasting; never raise for RPC failures."""
        shipment, event = self._locked_records(session, shipment_id)
        if shipment is None or event is None or shipment.blockchain_network is None:
            session.rollback()
            return
        if shipment.confirmation_status == "success":
            session.rollback()
            return
        if shipment.confirmation_status == "failed":
            shipment.transaction_hash = None
            details = dict(event.details)
            details.pop(RAW_TRANSACTION_KEY, None)
            event.details = details
            shipment.confirmation_status = "pending"
            shipment.payout_status = "pending"
        details = dict(event.details)
        details["attempt_count"] = int(details.get("attempt_count", 0)) + 1
        details["blockchain_status"] = "BLOCKCHAIN_PENDING"
        event.details = details
        event_id, detected_at = event.id, _utc(event.occurred_at)
        raw_transaction = details.get(RAW_TRANSACTION_KEY)
        transaction_hash = shipment.transaction_hash
        session.commit()

        if not raw_transaction or not transaction_hash:
            try:
                prepared = self.gateway.prepare_report(shipment_id, event_id, detected_at)
            except PolicyAlreadyPaid as exc:
                if exc.matches_evidence and exc.transaction_hash:
                    shipment, event = self._locked_records(session, shipment_id)
                    if shipment is not None and event is not None:
                        shipment.transaction_hash = exc.transaction_hash
                        session.commit()
                self._record_status(
                    session, shipment_id, "success" if exc.matches_evidence else "failed",
                    None if exc.matches_evidence else "POLICY_ALREADY_PAID_OTHER_EVIDENCE",
                )
                return
            except Exception as exc:
                self._record_status(session, shipment_id, "pending", self._error_code(exc))
                return
            shipment, event = self._locked_records(session, shipment_id)
            if shipment is None or event is None:
                session.rollback()
                return
            if shipment.transaction_hash and event.details.get(RAW_TRANSACTION_KEY):
                transaction_hash = shipment.transaction_hash
                raw_transaction = event.details[RAW_TRANSACTION_KEY]
            else:
                transaction_hash = prepared.transaction_hash
                raw_transaction = prepared.raw_transaction
                shipment.transaction_hash = transaction_hash
                event.details = {**event.details, RAW_TRANSACTION_KEY: raw_transaction}
            session.commit()

        try:
            if self._finish_if_mined(session, shipment_id, event_id, detected_at, transaction_hash):
                return
            try:
                self.gateway.broadcast(raw_transaction)
            except Exception:
                # A node can accept a transaction and still time out the HTTP
                # response, or reject a rebroadcast as already known.
                if self._finish_if_mined(session, shipment_id, event_id, detected_at, transaction_hash):
                    return
                raise
            shipment, event = self._locked_records(session, shipment_id)
            if shipment is not None and event is not None:
                event.details = {**event.details, "sent_at": utc_iso(datetime.now(timezone.utc))}
                session.commit()
            deadline = time.monotonic() + self.receipt_timeout_seconds
            while True:
                if self._finish_if_mined(session, shipment_id, event_id, detected_at, transaction_hash):
                    return
                if time.monotonic() >= deadline:
                    self._record_status(
                        session, shipment_id, "pending", "RECEIPT_TIMEOUT", expected_hash=transaction_hash,
                    )
                    return
                time.sleep(0.5)
        except Exception as exc:
            self._record_status(
                session, shipment_id, "pending", self._error_code(exc), expected_hash=transaction_hash,
            )

    @staticmethod
    def _error_code(exc: Exception) -> str:
        code = exc.code if isinstance(exc, BlockchainError) else "RPC_UNAVAILABLE"
        logger.warning("Blockchain handoff pending: %s", code)
        return code


def configured_coordinator(settings) -> BlockchainCoordinator | None:
    if (
        not settings.blockchain_enabled
        or not settings.blockchain_contract_address
        or not settings.blockchain_oracle_private_key
    ):
        return None
    return BlockchainCoordinator(
        network=settings.blockchain_network,
        gateway=Web3BlockchainAdapter(settings),
        receipt_timeout_seconds=settings.blockchain_receipt_timeout_seconds,
    )
