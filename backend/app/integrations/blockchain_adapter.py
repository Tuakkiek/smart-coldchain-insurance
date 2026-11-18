"""Signed oracle transactions for ColdChainInsurance on a configured EVM chain."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from web3 import Web3
from web3.exceptions import TransactionNotFound, Web3Exception

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


@dataclass(frozen=True)
class OnChainPolicy:
    insurer: str
    beneficiary: str
    payout_amount_wei: int
    expiry: int
    status: int
    evidence_hash: str
    detected_at: int


@dataclass(frozen=True)
class PolicySubmission:
    transaction_hash: str
    contract_address: str
    already_active: bool = False


class PolicyGateway(Protocol):
    @property
    def contract_address(self) -> str: ...
    @property
    def chain_id(self) -> int: ...
    @property
    def can_submit_server_side(self) -> bool: ...
    def read_policy(self, shipment_id: str) -> OnChainPolicy: ...
    def submit_policy(
        self, shipment_id: str, buyer_wallet: str, amount_wei: int, expiry_timestamp: int,
    ) -> PolicySubmission: ...
    def check_policy_confirmation(
        self, transaction_hash: str, shipment_id: str, buyer_wallet: str, amount_wei: int,
        confirmations: int = 1,
    ) -> str: ...


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


def _load_abi(abi_path: Path, error_code: str) -> list[dict]:
    """Load ABI from either a wrapped {'abi': [...]} artifact or a raw Remix [...] array."""
    try:
        payload = json.loads(abi_path.read_text(encoding="utf-8"))
        abi = payload["abi"] if isinstance(payload, dict) else payload
        if not isinstance(abi, list):
            raise ValueError("ABI JSON must be a list or an object containing an 'abi' list")
        return abi
    except (OSError, ValueError, KeyError) as exc:
        raise BlockchainError(error_code) from exc


def _tx_fee_fields(web3: Web3) -> dict[str, int]:
    """Build EIP-1559 fee fields when supported (e.g. Sepolia), else buffered legacy gasPrice."""
    try:
        latest_block = web3.eth.get_block("latest")
        base_fee = latest_block.get("baseFeePerGas") if latest_block else None
    except Web3Exception:
        base_fee = None
    if base_fee is not None:
        try:
            priority_fee = int(web3.eth.max_priority_fee)
        except Web3Exception:
            priority_fee = 1_500_000_000
        return {
            "maxPriorityFeePerGas": priority_fee,
            "maxFeePerGas": int(base_fee) * 2 + priority_fee,
        }
    return {"gasPrice": max(1, int(web3.eth.gas_price * 1.2))}


def _find_event_logs(
    web3: Web3,
    event_factory,
    argument_filters: dict,
    start_block: int,
    chunk_size: int = 2000,
) -> list:
    """Query logs backwards in bounded chunks so Alchemy Sepolia range limits are respected."""
    try:
        latest = int(web3.eth.block_number)
    except Web3Exception:
        return []
    floor = max(0, start_block)
    if floor == 0 and latest > 50_000:
        floor = latest - 10_000
    if floor > latest:
        return []

    to_block = latest
    while to_block >= floor:
        from_block = max(floor, to_block - chunk_size + 1)
        try:
            logs = event_factory().get_logs(
                from_block=from_block,
                to_block=to_block,
                argument_filters=argument_filters,
            )
            if logs:
                return list(logs)
        except (Web3Exception, ValueError):
            return []
        to_block = from_block - 1
    return []


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
        abi = _load_abi(settings.blockchain_abi_path, "ABI_UNAVAILABLE")
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
                logs = _find_event_logs(
                    web3,
                    contract.events.InsurancePaid,
                    {"shipmentKey": shipment_key},
                    self.settings.blockchain_start_block or self.settings.blockchain_deploy_block,
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
            **_tx_fee_fields(web3),
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
        abi = _load_abi(settings.data_integrity_abi_path, "INTEGRITY_ABI_UNAVAILABLE")
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
            **_tx_fee_fields(web3),
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
        logs = _find_event_logs(
            web3,
            contract.events.BatchAnchored,
            {"batchKey": batch_key},
            self.settings.blockchain_start_block or self.settings.blockchain_deploy_block,
        )
        return Web3.to_hex(logs[-1]["transactionHash"]) if logs else None


class Web3PolicyAdapter:
    """Create, verify, and read back ColdChainInsurance policies on Sepolia / EVM chains."""

    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def contract_address(self) -> str:
        raw = self.settings.blockchain_contract_address
        if not raw:
            return ""
        try:
            return Web3.to_checksum_address(raw)
        except ValueError:
            return raw

    @property
    def chain_id(self) -> int:
        return self.settings.blockchain_chain_id

    @property
    def can_submit_server_side(self) -> bool:
        return bool(
            self.settings.blockchain_enabled
            and self.settings.blockchain_contract_address
            and self.settings.blockchain_insurer_private_key
        )

    def _contract(self):
        settings = self.settings
        web3 = Web3(Web3.HTTPProvider(settings.blockchain_rpc_url, request_kwargs={"timeout": 8}))
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
        return web3, web3.eth.contract(address=address, abi=abi), address

    @staticmethod
    def _shipment_key(shipment_id: str) -> bytes:
        return bytes(Web3.keccak(text=shipment_id))

    def read_policy(self, shipment_id: str) -> OnChainPolicy:
        _web3, contract, _address = self._contract()
        policy = contract.functions.getPolicy(self._shipment_key(shipment_id)).call()
        return OnChainPolicy(
            insurer=Web3.to_checksum_address(policy[0]),
            beneficiary=Web3.to_checksum_address(policy[1]),
            payout_amount_wei=int(policy[2]),
            expiry=int(policy[3]),
            status=int(policy[4]),
            evidence_hash=Web3.to_hex(bytes(policy[5])),
            detected_at=int(policy[6]),
        )

    def submit_policy(
        self, shipment_id: str, buyer_wallet: str, amount_wei: int, expiry_timestamp: int,
    ) -> PolicySubmission:
        if not self.settings.blockchain_insurer_private_key:
            raise BlockchainError("INSURER_SIGNER_NOT_CONFIGURED")
        if amount_wei <= 0:
            raise BlockchainError("INVALID_PAYOUT_AMOUNT")

        web3, contract, insurance_address = self._contract()
        insurer_account = web3.eth.account.from_key(self.settings.blockchain_insurer_private_key)
        checksum_buyer = Web3.to_checksum_address(buyer_wallet)
        shipment_key = self._shipment_key(shipment_id)

        existing = contract.functions.getPolicy(shipment_key).call()
        if int(existing[4]) != 0:
            matches = (
                int(existing[4]) == 1
                and Web3.to_checksum_address(existing[1]) == checksum_buyer
                and int(existing[2]) == amount_wei
            )
            if matches:
                logs = contract.events.PolicyCreated().get_logs(
                    from_block=self.settings.blockchain_deploy_block,
                    argument_filters={"shipmentKey": shipment_key},
                )
                tx_hash = Web3.to_hex(logs[-1]["transactionHash"]) if logs else ""
                return PolicySubmission(
                    transaction_hash=tx_hash,
                    contract_address=insurance_address,
                    already_active=True,
                )
            raise BlockchainError("POLICY_ALREADY_EXISTS_MISMATCH")

        gas_limit = 300000
        gas_price = web3.eth.gas_price
        balance = web3.eth.get_balance(insurer_account.address)
        if balance < amount_wei + gas_limit * gas_price:
            raise BlockchainError("INSURER_INSUFFICIENT_ETH_BALANCE")
        nonce = web3.eth.get_transaction_count(insurer_account.address, "pending")

        # Native SepoliaETH is escrowed by payable createPolicy(msg.value).
        policy_tx = contract.functions.createPolicy(
            shipment_key,
            checksum_buyer,
            amount_wei,
            expiry_timestamp,
        ).build_transaction({
            "from": insurer_account.address,
            "value": amount_wei,
            "nonce": nonce,
            "chainId": self.settings.blockchain_chain_id,
            "gas": gas_limit,
            "gasPrice": gas_price,
        })
        signed_policy = insurer_account.sign_transaction(policy_tx)
        web3.eth.send_raw_transaction(signed_policy.raw_transaction)
        return PolicySubmission(
            transaction_hash=Web3.to_hex(signed_policy.hash),
            contract_address=insurance_address,
            already_active=False,
        )

    def check_policy_confirmation(
        self,
        transaction_hash: str,
        shipment_id: str,
        buyer_wallet: str,
        amount_wei: int,
        confirmations: int = 1,
    ) -> str:
        web3, _contract, _address = self._contract()
        try:
            receipt = web3.eth.get_transaction_receipt(transaction_hash)
        except TransactionNotFound:
            return "pending"
        if receipt["status"] != 1:
            return "failed"
        observed = web3.eth.block_number - receipt["blockNumber"] + 1
        if observed < confirmations:
            return "pending"
        on_chain = self.read_policy(shipment_id)
        if (
            on_chain.status == 1
            and on_chain.beneficiary.lower() == buyer_wallet.lower()
            and on_chain.payout_amount_wei == amount_wei
        ):
            return "confirmed"
        return "failed"
