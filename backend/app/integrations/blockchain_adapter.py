"""Signed oracle transactions for ColdChainInsurance on a configured EVM chain."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from web3 import Web3
from web3.exceptions import TransactionNotFound

from app.core.config import Settings


class BlockchainError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class PolicyAlreadyPaid(BlockchainError):
    def __init__(self, matches_evidence: bool, transaction_hash: str | None = None):
        self.matches_evidence = matches_evidence
        self.transaction_hash = transaction_hash
        super().__init__("POLICY_ALREADY_PAID")


@dataclass(frozen=True)
class PreparedReport:
    transaction_hash: str
    raw_transaction: str


class BlockchainGateway(Protocol):
    def prepare_report(self, shipment_id: str, event_id: str, detected_at: datetime) -> PreparedReport: ...
    def broadcast(self, raw_transaction: str) -> None: ...
    def receipt_succeeded(self, transaction_hash: str) -> bool | None: ...
    def policy_paid_for(self, shipment_id: str, event_id: str, detected_at: datetime) -> bool: ...


class Web3BlockchainAdapter:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _contract(self):
        settings = self.settings
        web3 = Web3(Web3.HTTPProvider(settings.blockchain_rpc_url, request_kwargs={"timeout": 5}))
        if web3.eth.chain_id != settings.blockchain_chain_id:
            raise BlockchainError("CHAIN_ID_MISMATCH")
        try:
            address = Web3.to_checksum_address(settings.blockchain_contract_address)
        except ValueError as exc:
            raise BlockchainError("INVALID_CONTRACT_ADDRESS") from exc
        if not web3.eth.get_code(address):
            raise BlockchainError("CONTRACT_NOT_DEPLOYED")
        try:
            with settings.blockchain_abi_path.open(encoding="utf-8") as artifact_file:
                abi = json.load(artifact_file)["abi"]
        except (OSError, ValueError, KeyError) as exc:
            raise BlockchainError("ABI_UNAVAILABLE") from exc
        return web3, web3.eth.contract(address=address, abi=abi)

    @staticmethod
    def _keys(shipment_id: str, event_id: str) -> tuple[bytes, bytes]:
        return bytes(Web3.keccak(text=shipment_id)), bytes(Web3.keccak(text=event_id))

    @staticmethod
    def _detected_seconds(detected_at: datetime) -> int:
        if detected_at.tzinfo is None:
            detected_at = detected_at.replace(tzinfo=timezone.utc)
        return int(detected_at.timestamp())

    def prepare_report(self, shipment_id: str, event_id: str, detected_at: datetime) -> PreparedReport:
        web3, contract = self._contract()
        account = web3.eth.account.from_key(self.settings.blockchain_oracle_private_key)
        if contract.functions.oracle().call().lower() != account.address.lower():
            raise BlockchainError("ORACLE_MISMATCH")
        shipment_key, evidence_hash = self._keys(shipment_id, event_id)
        policy = contract.functions.getPolicy(shipment_key).call()
        if policy[4] == 2:
            matches = bytes(policy[5]) == evidence_hash and policy[6] == self._detected_seconds(detected_at)
            transaction_hash = None
            if matches:
                logs = contract.events.InsurancePaid().get_logs(
                    from_block=0, argument_filters={"shipmentKey": shipment_key},
                )
                for paid in logs:
                    if bytes(paid["args"]["evidenceHash"]) == evidence_hash and paid["args"]["detectedAt"] == self._detected_seconds(detected_at):
                        transaction_hash = Web3.to_hex(paid["transactionHash"])
                        break
            raise PolicyAlreadyPaid(matches, transaction_hash)
        if policy[4] != 1:
            raise BlockchainError("POLICY_NOT_ACTIVE")
        transaction = contract.functions.reportViolation(
            shipment_key, evidence_hash, self._detected_seconds(detected_at)
        ).build_transaction({
            "from": account.address,
            "nonce": web3.eth.get_transaction_count(account.address, "pending"),
            "chainId": self.settings.blockchain_chain_id,
            "gas": 300000,
            "gasPrice": web3.eth.gas_price,
        })
        signed = account.sign_transaction(transaction)
        return PreparedReport(Web3.to_hex(signed.hash), Web3.to_hex(signed.raw_transaction))

    def broadcast(self, raw_transaction: str) -> None:
        web3, _contract = self._contract()
        web3.eth.send_raw_transaction(bytes.fromhex(raw_transaction.removeprefix("0x")))

    def receipt_succeeded(self, transaction_hash: str) -> bool | None:
        web3, _contract = self._contract()
        try:
            receipt = web3.eth.get_transaction_receipt(transaction_hash)
        except TransactionNotFound:
            return None
        return receipt["status"] == 1

    def policy_paid_for(self, shipment_id: str, event_id: str, detected_at: datetime) -> bool:
        _web3, contract = self._contract()
        shipment_key, evidence_hash = self._keys(shipment_id, event_id)
        policy = contract.functions.getPolicy(shipment_key).call()
        return (
            policy[4] == 2
            and bytes(policy[5]) == evidence_hash
            and policy[6] == self._detected_seconds(detected_at)
        )
