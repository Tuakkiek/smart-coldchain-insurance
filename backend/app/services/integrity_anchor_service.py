"""Durable, idempotent dispatcher for ColdChainDataIntegrity anchor outbox rows."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.blockchain_adapter import (
    BatchAlreadyAnchored,
    BlockchainError,
    IntegrityAnchor,
    IntegrityGateway,
    Web3IntegrityAdapter,
)
from app.models import IntegrityBatch, IntegrationOutbox


logger = logging.getLogger(__name__)
RAW_TRANSACTION_KEY = "_raw_transaction"


def _utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class IntegrityAnchorCoordinator:
    def __init__(
        self,
        network: str,
        gateway: IntegrityGateway,
        *,
        confirmations: int = 1,
        receipt_timeout_seconds: int = 15,
    ):
        self.network = network
        self.gateway = gateway
        self.confirmations = confirmations
        self.receipt_timeout_seconds = receipt_timeout_seconds

    @staticmethod
    def _locked_records(session: Session, batch_id: str):
        batch = session.scalars(
            select(IntegrityBatch).where(IntegrityBatch.id == batch_id).with_for_update()
        ).one_or_none()
        outbox = session.scalars(
            select(IntegrationOutbox).where(
                IntegrationOutbox.kind == "ANCHOR_BATCH",
                IntegrationOutbox.aggregate_id == batch_id,
            ).with_for_update()
        ).one_or_none()
        return batch, outbox

    @staticmethod
    def _anchor(batch: IntegrityBatch) -> IntegrityAnchor:
        return IntegrityAnchor(
            batch_id=batch.id,
            shipment_id=batch.shipment_id,
            device_id=batch.device_id,
            merkle_root=batch.merkle_root,
            first_sequence=batch.first_sequence,
            last_sequence=batch.last_sequence,
            record_count=batch.record_count,
        )

    def _set_state(
        self,
        session: Session,
        batch_id: str,
        *,
        batch_status: str,
        outbox_status: str,
        error: str | None = None,
        expected_hash: str | None = None,
        transaction_hash: str | None = None,
        confirmed: bool = False,
    ) -> None:
        batch, outbox = self._locked_records(session, batch_id)
        if batch is None or outbox is None:
            session.rollback()
            return
        payload = dict(outbox.payload)
        current_hash = payload.get("transaction_hash")
        if expected_hash is not None and current_hash != expected_hash:
            session.rollback()
            return
        batch.anchor_status = batch_status
        outbox.status = outbox_status
        outbox.updated_at = datetime.now(timezone.utc)
        if transaction_hash:
            payload["transaction_hash"] = transaction_hash
        if error:
            payload["last_error"] = error
            outbox.last_error = error
        else:
            payload.pop("last_error", None)
            outbox.last_error = None
        if confirmed:
            payload["confirmed_at"] = _utc_iso(outbox.updated_at)
            payload.pop(RAW_TRANSACTION_KEY, None)
        outbox.payload = payload
        session.commit()

    def _finish_if_mined(
        self, session: Session, batch_id: str, anchor: IntegrityAnchor, transaction_hash: str,
    ) -> bool:
        state = self.gateway.receipt_state(transaction_hash, self.confirmations)
        if state in {"missing", "pending"}:
            return False
        if state == "success" and self.gateway.batch_matches(anchor):
            self._set_state(
                session,
                batch_id,
                batch_status="DATA_ANCHORED",
                outbox_status="CONFIRMED",
                expected_hash=transaction_hash,
                confirmed=True,
            )
        else:
            error = "TRANSACTION_REVERTED" if state == "failed" else "ON_CHAIN_BATCH_MISMATCH"
            self._set_state(
                session,
                batch_id,
                batch_status="BLOCKCHAIN_FAILED",
                outbox_status="FAILED",
                error=error,
                expected_hash=transaction_hash,
            )
        return True

    def dispatch(self, session: Session, batch_id: str) -> None:
        """Persist before broadcast and retain the same signed tx across uncertain RPC failures."""
        batch, outbox = self._locked_records(session, batch_id)
        if batch is None or outbox is None:
            session.rollback()
            return
        if batch.anchor_status == "DATA_ANCHORED" and outbox.status == "CONFIRMED":
            session.rollback()
            return

        payload = dict(outbox.payload)
        if outbox.status == "FAILED":
            payload.pop("transaction_hash", None)
            payload.pop(RAW_TRANSACTION_KEY, None)
            payload.pop("submitted_at", None)
        outbox.attempt_count += 1
        payload["attempt_count"] = outbox.attempt_count
        payload["network"] = self.network
        payload.pop("last_error", None)
        outbox.last_error = None
        outbox.status = "SUBMITTED" if payload.get("transaction_hash") else "PENDING"
        outbox.payload = payload
        outbox.updated_at = datetime.now(timezone.utc)
        batch.anchor_status = "BLOCKCHAIN_PENDING"
        anchor = self._anchor(batch)
        raw_transaction = payload.get(RAW_TRANSACTION_KEY)
        transaction_hash = payload.get("transaction_hash")
        session.commit()

        if not raw_transaction or not transaction_hash:
            try:
                prepared = self.gateway.prepare_anchor(anchor)
            except BatchAlreadyAnchored as exc:
                if exc.matches:
                    self._set_state(
                        session,
                        batch_id,
                        batch_status="DATA_ANCHORED",
                        outbox_status="CONFIRMED",
                        transaction_hash=exc.transaction_hash,
                        confirmed=True,
                    )
                else:
                    self._set_state(
                        session,
                        batch_id,
                        batch_status="BLOCKCHAIN_FAILED",
                        outbox_status="FAILED",
                        error="BATCH_ALREADY_ANCHORED_OTHER_DATA",
                    )
                return
            except Exception as exc:
                self._pending(session, batch_id, self._error_code(exc))
                return

            batch, outbox = self._locked_records(session, batch_id)
            if batch is None or outbox is None:
                session.rollback()
                return
            payload = dict(outbox.payload)
            if payload.get("transaction_hash") and payload.get(RAW_TRANSACTION_KEY):
                transaction_hash = payload["transaction_hash"]
                raw_transaction = payload[RAW_TRANSACTION_KEY]
            else:
                transaction_hash = prepared.transaction_hash
                raw_transaction = prepared.raw_transaction
                payload["transaction_hash"] = transaction_hash
                payload[RAW_TRANSACTION_KEY] = raw_transaction
                outbox.payload = payload
            outbox.status = "SUBMITTED"
            outbox.updated_at = datetime.now(timezone.utc)
            session.commit()

        try:
            if self._finish_if_mined(session, batch_id, anchor, transaction_hash):
                return
            state = self.gateway.receipt_state(transaction_hash, self.confirmations)
            if state == "missing":
                try:
                    self.gateway.broadcast(raw_transaction)
                except Exception:
                    if self._finish_if_mined(session, batch_id, anchor, transaction_hash):
                        return
                    raise
                batch, outbox = self._locked_records(session, batch_id)
                if batch is not None and outbox is not None:
                    payload = dict(outbox.payload)
                    payload["submitted_at"] = _utc_iso(datetime.now(timezone.utc))
                    outbox.payload = payload
                    outbox.status = "SUBMITTED"
                    outbox.updated_at = datetime.now(timezone.utc)
                    session.commit()

            deadline = time.monotonic() + self.receipt_timeout_seconds
            while True:
                if self._finish_if_mined(session, batch_id, anchor, transaction_hash):
                    return
                if time.monotonic() >= deadline:
                    self._pending(
                        session, batch_id, "RECEIPT_OR_CONFIRMATION_TIMEOUT", transaction_hash,
                    )
                    return
                time.sleep(0.5)
        except Exception as exc:
            self._pending(session, batch_id, self._error_code(exc), transaction_hash)

    def _pending(
        self, session: Session, batch_id: str, error: str, transaction_hash: str | None = None,
    ) -> None:
        self._set_state(
            session,
            batch_id,
            batch_status="BLOCKCHAIN_PENDING",
            outbox_status="SUBMITTED" if transaction_hash else "PENDING",
            error=error,
            expected_hash=transaction_hash,
        )

    def verify_on_chain(self, batch: IntegrityBatch) -> bool:
        return self.gateway.batch_matches(self._anchor(batch))

    @staticmethod
    def _error_code(exc: Exception) -> str:
        code = exc.code if isinstance(exc, BlockchainError) else "RPC_UNAVAILABLE"
        logger.warning("Integrity anchor handoff pending: %s", code)
        return code


def configured_integrity_coordinator(settings) -> IntegrityAnchorCoordinator | None:
    if (
        not settings.blockchain_enabled
        or not settings.data_integrity_contract_address
        or not settings.blockchain_anchorer_private_key
    ):
        return None
    return IntegrityAnchorCoordinator(
        network=settings.blockchain_network,
        gateway=Web3IntegrityAdapter(settings),
        confirmations=settings.blockchain_confirmations,
        receipt_timeout_seconds=settings.blockchain_receipt_timeout_seconds,
    )
