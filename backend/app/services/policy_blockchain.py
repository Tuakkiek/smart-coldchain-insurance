"""Policy creation lifecycle coordination between Database and ColdChainInsurance Smart Contract."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.integrations.blockchain_adapter import (
    BlockchainError,
    PolicyGateway,
    Web3PolicyAdapter,
)
from app.models import Shipment


logger = logging.getLogger(__name__)


class PolicyCoordinator:
    """Manages PENDING -> SUBMITTED -> CONFIRMED/FAILED transitions for on-chain insurance policies."""

    def __init__(
        self,
        gateway: PolicyGateway,
        *,
        network: str,
        confirmations: int = 1,
        receipt_timeout_seconds: int = 15,
        default_expiry_days: int = 30,
    ):
        self.gateway = gateway
        self.network = network
        self.confirmations = confirmations
        self.receipt_timeout_seconds = receipt_timeout_seconds
        self.default_expiry_days = default_expiry_days

    @property
    def contract_address(self) -> str:
        return self.gateway.contract_address

    @property
    def chain_id(self) -> int:
        return self.gateway.chain_id

    @property
    def can_submit_server_side(self) -> bool:
        return self.gateway.can_submit_server_side

    def create_or_retry_policy(self, session: Session, shipment_id: str) -> Shipment:
        shipment = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one_or_none()
        if shipment is None:
            raise ValueError("SHIPMENT_NOT_FOUND")
        if shipment.policy_status == "CONFIRMED":
            session.rollback()
            return shipment
        if not shipment.buyer_wallet_address or not shipment.insurance_amount_wei:
            session.rollback()
            raise BlockchainError("POLICY_DATA_INCOMPLETE")

        buyer_wallet = shipment.buyer_wallet_address
        amount_wei = int(shipment.insurance_amount_wei)
        if shipment.policy_expiry is None:
            shipment.policy_expiry = datetime.now(timezone.utc) + timedelta(days=self.default_expiry_days)
        expiry_dt = shipment.policy_expiry
        if expiry_dt.tzinfo is None:
            expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
        expiry_ts = int(expiry_dt.timestamp())

        tx_hash = shipment.policy_transaction_hash
        if shipment.policy_status == "FAILED":
            tx_hash = None
            shipment.policy_transaction_hash = None

        if not tx_hash:
            if not self.gateway.can_submit_server_side:
                shipment.policy_status = "PENDING"
                if self.gateway.contract_address:
                    shipment.policy_contract_address = self.gateway.contract_address
                session.commit()
                return shipment
            try:
                submission = self.gateway.submit_policy(
                    shipment_id, buyer_wallet, amount_wei, expiry_ts,
                )
            except Exception as exc:
                code = exc.code if isinstance(exc, BlockchainError) else "BLOCKCHAIN_SUBMIT_FAILED"
                logger.warning("Policy submission failed for %s: %s", shipment_id, code)
                shipment.policy_status = "FAILED"
                shipment.policy_last_error = code
                if self.gateway.contract_address:
                    shipment.policy_contract_address = self.gateway.contract_address
                session.commit()
                return shipment

            shipment.policy_contract_address = submission.contract_address
            shipment.policy_transaction_hash = submission.transaction_hash or shipment.policy_transaction_hash
            shipment.policy_last_error = None
            if submission.already_active:
                shipment.policy_status = "CONFIRMED"
                session.commit()
                return shipment
            shipment.policy_status = "SUBMITTED"
            tx_hash = submission.transaction_hash
            session.commit()
        else:
            session.commit()

        return self._wait_and_update(session, shipment_id, tx_hash, buyer_wallet, amount_wei)

    def confirm_external_transaction(
        self, session: Session, shipment_id: str, transaction_hash: str,
    ) -> Shipment:
        """Record an externally-signed (e.g. MetaMask) policy tx hash and verify it on-chain."""
        shipment = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one_or_none()
        if shipment is None:
            raise ValueError("SHIPMENT_NOT_FOUND")
        if not shipment.buyer_wallet_address or not shipment.insurance_amount_wei:
            session.rollback()
            raise BlockchainError("POLICY_DATA_INCOMPLETE")

        buyer_wallet = shipment.buyer_wallet_address
        amount_wei = int(shipment.insurance_amount_wei)
        shipment.policy_transaction_hash = transaction_hash
        if self.gateway.contract_address:
            shipment.policy_contract_address = self.gateway.contract_address
        if shipment.policy_status != "CONFIRMED":
            shipment.policy_status = "SUBMITTED"
            shipment.policy_last_error = None
        session.commit()

        return self._wait_and_update(session, shipment_id, transaction_hash, buyer_wallet, amount_wei)

    def _wait_and_update(
        self,
        session: Session,
        shipment_id: str,
        tx_hash: str,
        buyer_wallet: str,
        amount_wei: int,
    ) -> Shipment:
        deadline = time.monotonic() + self.receipt_timeout_seconds
        final_state = "pending"
        last_error: str | None = None

        while True:
            try:
                state = self.gateway.check_policy_confirmation(
                    tx_hash, shipment_id, buyer_wallet, amount_wei, self.confirmations,
                )
            except Exception as exc:
                last_error = exc.code if isinstance(exc, BlockchainError) else "RPC_UNAVAILABLE"
                state = "pending"

            if state in {"confirmed", "failed"}:
                final_state = state
                break
            if time.monotonic() >= deadline:
                final_state = "pending"
                last_error = last_error or "RECEIPT_TIMEOUT"
                break
            time.sleep(0.25)

        shipment = session.scalars(
            select(Shipment).where(Shipment.id == shipment_id).with_for_update()
        ).one()
        if final_state == "confirmed":
            shipment.policy_status = "CONFIRMED"
            shipment.policy_last_error = None
        elif final_state == "failed":
            shipment.policy_status = "FAILED"
            shipment.policy_last_error = "POLICY_TX_REVERTED_OR_MISMATCH"
        else:
            shipment.policy_status = "SUBMITTED"
            shipment.policy_last_error = last_error
        session.commit()
        return shipment


def configured_policy_coordinator(settings: Settings) -> PolicyCoordinator | None:
    if not settings.blockchain_enabled or not settings.blockchain_contract_address:
        return None
    return PolicyCoordinator(
        gateway=Web3PolicyAdapter(settings),
        network=settings.blockchain_network,
        confirmations=settings.blockchain_confirmations,
        receipt_timeout_seconds=settings.blockchain_receipt_timeout_seconds,
        default_expiry_days=settings.blockchain_default_policy_expiry_days,
    )
