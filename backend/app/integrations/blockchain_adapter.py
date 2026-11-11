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


class BatchAlreadyAnchored(BlockchainError):
    def __init__(self, matches: bool, transaction_hash: str | None = None):
        self.matches = matches
        self.transaction_hash = transaction_hash
        super().__init__("BATCH_ALREADY_ANCHORED")


@dataclass(frozen=True)
class PreparedReport:
    transaction_hash: str
    raw_transaction: str


@dataclass(frozen=True)
class IntegrityAnchor:
    batch_id: str
    shipment_id: str
    device_id: str
    merkle_root: str
    first_sequence: int
    last_sequence: int
    record_count: int


@dataclass(frozen=True)
class PreparedAnchor:
    transaction_hash: str
    raw_transaction: str


class BlockchainGateway(Protocol):
    def prepare_report(self, shipment_id: str, event_id: str, detected_at: datetime) -> PreparedReport: ...
    def broadcast(self, raw_transaction: str) -> None: ...
    def receipt_succeeded(self, transaction_hash: str) -> bool | None: ...
    def policy_paid_for(self, shipment_id: str, event_id: str, detected_at: datetime) -> bool: ...


class IntegrityGateway(Protocol):
    def prepare_anchor(self, anchor: IntegrityAnchor) -> PreparedAnchor: ...
    def broadcast(self, raw_transaction: str) -> None: ...
    def receipt_state(self, transaction_hash: str, confirmations: int) -> str: ...
    def batch_matches(self, anchor: IntegrityAnchor) -> bool: ...
    def anchored_transaction_hash(self, batch_id: str) -> str | None: ...


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


class Web3IntegrityAdapter:
    """Signed anchor transactions and readback for ColdChainDataIntegrity."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def _contract(self):
        settings = self.settings
        web3 = Web3(Web3.HTTPProvider(settings.blockchain_rpc_url, request_kwargs={"timeout": 5}))
        if web3.eth.chain_id != settings.blockchain_chain_id:
            raise BlockchainError("CHAIN_ID_MISMATCH")
        try:
            address = Web3.to_checksum_address(settings.data_integrity_contract_address)
        except ValueError as exc:
            raise BlockchainError("INVALID_INTEGRITY_CONTRACT_ADDRESS") from exc
        if not web3.eth.get_code(address):
            raise BlockchainError("INTEGRITY_CONTRACT_NOT_DEPLOYED")
        try:
            with settings.data_integrity_abi_path.open(encoding="utf-8") as artifact_file:
                abi = json.load(artifact_file)["abi"]
        except (OSError, ValueError, KeyError) as exc:
            raise BlockchainError("INTEGRITY_ABI_UNAVAILABLE") from exc
        return web3, web3.eth.contract(address=address, abi=abi)

    @staticmethod
    def _keys(anchor: IntegrityAnchor) -> tuple[bytes, bytes, bytes]:
        return (
            bytes(Web3.keccak(text=anchor.batch_id)),
            bytes(Web3.keccak(text=anchor.shipment_id)),
            bytes(Web3.keccak(text=anchor.device_id)),
        )

    @staticmethod
    def _root(anchor: IntegrityAnchor) -> bytes:
        try:
            root = bytes.fromhex(anchor.merkle_root.removeprefix("0x"))
        except ValueError as exc:
            raise BlockchainError("INVALID_MERKLE_ROOT") from exc
        if len(root) != 32:
            raise BlockchainError("INVALID_MERKLE_ROOT")
        return root

    def prepare_anchor(self, anchor: IntegrityAnchor) -> PreparedAnchor:
        web3, contract = self._contract()
        account = web3.eth.account.from_key(self.settings.blockchain_anchorer_private_key)
        if contract.functions.anchorer().call().lower() != account.address.lower():
            raise BlockchainError("ANCHORER_MISMATCH")
        batch_key, shipment_key, device_key = self._keys(anchor)
        if contract.functions.batchExists(batch_key).call():
            raise BatchAlreadyAnchored(
                self.batch_matches(anchor), self.anchored_transaction_hash(anchor.batch_id),
            )
        transaction = contract.functions.anchorBatch(
            batch_key,
            shipment_key,
            device_key,
            self._root(anchor),
            anchor.first_sequence,
            anchor.last_sequence,
            anchor.record_count,
        ).build_transaction({
            "from": account.address,
            "nonce": web3.eth.get_transaction_count(account.address, "pending"),
            "chainId": self.settings.blockchain_chain_id,
            "gas": 400000,
            "gasPrice": web3.eth.gas_price,
        })
        signed = account.sign_transaction(transaction)
        return PreparedAnchor(Web3.to_hex(signed.hash), Web3.to_hex(signed.raw_transaction))

    def broadcast(self, raw_transaction: str) -> None:
        web3, _contract = self._contract()
        web3.eth.send_raw_transaction(bytes.fromhex(raw_transaction.removeprefix("0x")))

    def receipt_state(self, transaction_hash: str, confirmations: int) -> str:
        web3, _contract = self._contract()
        try:
            receipt = web3.eth.get_transaction_receipt(transaction_hash)
        except TransactionNotFound:
            return "missing"
        if receipt["status"] != 1:
            return "failed"
        observed = web3.eth.block_number - receipt["blockNumber"] + 1
        return "success" if observed >= confirmations else "pending"

    def batch_matches(self, anchor: IntegrityAnchor) -> bool:
        _web3, contract = self._contract()
        batch_key, shipment_key, device_key = self._keys(anchor)
        if not contract.functions.batchExists(batch_key).call():
            return False
        stored = contract.functions.getBatch(batch_key).call()
        return (
            bytes(stored[0]) == shipment_key
            and bytes(stored[1]) == device_key
            and bytes(stored[2]) == self._root(anchor)
            and stored[3] == anchor.first_sequence
            and stored[4] == anchor.last_sequence
            and stored[5] == anchor.record_count
        )

    def anchored_transaction_hash(self, batch_id: str) -> str | None:
        web3, contract = self._contract()
        batch_key = bytes(Web3.keccak(text=batch_id))
        logs = contract.events.BatchAnchored().get_logs(
            from_block=0, argument_filters={"batchKey": batch_key},
        )
        return Web3.to_hex(logs[-1]["transactionHash"]) if logs else None
