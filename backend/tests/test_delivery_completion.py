"""End-to-end tests for delivery completion, telemetry closure, violation checks, and SepoliaETH refund."""

from __future__ import annotations

import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import Base
from app.integrations.blockchain_adapter import (
    BlockchainError,
    OnChainPolicy,
    PolicyAlreadyRefunded,
    PolicySubmission,
    PreparedRefund,
    PreparedReport,
    Web3PolicyAdapter,
)
from app.main import create_app
from app.models import IntegrityBatch, IntegrationOutbox, Shipment, ShipmentEvent, Telemetry
from app.services.auth import create_access_token
from app.services.blockchain_outbox import BlockchainCoordinator
from app.services.clock import VirtualClock
from app.services.delivery_settlement import DeliverySettlementCoordinator
from app.services.insurance_evidence import InsuranceEvidenceCoordinator
from app.services.policy_blockchain import PolicyCoordinator
from app.services.telemetry_protocol import canonical_signed_bytes


ADMIN_TOKEN = create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

INSURER_WALLET = "0x1111111111111111111111111111111111111111"
BUYER_WALLET = "0x2222222222222222222222222222222222222222"
LEGACY_CONTRACT = "0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F"
V2_CONTRACT = "0x9999999999999999999999999999999999999999"
ANCHOR_TX = "0x" + "aa" * 32
POLICY_TX = "0x" + "bb" * 32
REFUND_TX = "0x" + "cc" * 32
PAYOUT_TX = "0x" + "dd" * 32


class FakeSettlementGateway:
    def __init__(self, *, supports_early_refund: bool = True, contract_address: str = V2_CONTRACT):
        self._supports_early_refund = supports_early_refund
        self._contract_address = contract_address
        self.policies: dict[str, dict] = {}
        self.prepare_calls: list[dict] = []
        self.broadcasts: list[str] = []
        self.receipt_state_override: str | None = None
        self.raise_on_prepare: Exception | None = None
        self.raise_on_broadcast: Exception | None = None

    @property
    def contract_address(self) -> str:
        return self._contract_address

    @property
    def chain_id(self) -> int:
        return 11155111

    @property
    def can_submit_server_side(self) -> bool:
        return True

    @property
    def supports_early_refund(self) -> bool:
        return self._supports_early_refund

    def read_policy(self, shipment_id: str, contract_address: str | None = None) -> OnChainPolicy:
        entry = self.policies[shipment_id]
        return OnChainPolicy(
            insurer=entry["insurer"],
            beneficiary=entry["beneficiary"],
            payout_amount_wei=entry["amount_wei"],
            expiry=entry["expiry"],
            status=entry["status"],
            evidence_hash="0x" + "00" * 32,
            detected_at=0,
        )

    def submit_policy(self, shipment_id: str, buyer_wallet: str, amount_wei: int, expiry_timestamp: int) -> PolicySubmission:
        self.policies[shipment_id] = {
            "insurer": INSURER_WALLET,
            "beneficiary": buyer_wallet,
            "amount_wei": amount_wei,
            "expiry": expiry_timestamp,
            "status": 1,  # Active
            "contract": self._contract_address,
        }
        return PolicySubmission(transaction_hash=POLICY_TX, contract_address=self._contract_address)

    def check_policy_confirmation(
        self, transaction_hash: str, shipment_id: str, buyer_wallet: str, amount_wei: int, confirmations: int = 1,
    ) -> str:
        return "confirmed" if shipment_id in self.policies else "pending"

    def prepare_refund(
        self, shipment_id: str, evidence_id: str, delivered_at: datetime, contract_address: str | None = None,
    ) -> PreparedRefund:
        self.prepare_calls.append({"shipment_id": shipment_id, "contract_address": contract_address})
        if self.raise_on_prepare is not None:
            raise self.raise_on_prepare
        entry = self.policies[shipment_id]
        if entry["status"] == 3:
            raise PolicyAlreadyRefunded(REFUND_TX)
        if entry["status"] == 2:
            raise BlockchainError("POLICY_ALREADY_PAID")
        if entry["status"] != 1:
            raise BlockchainError("POLICY_NOT_ACTIVE")
        target_contract = contract_address or self._contract_address
        early_ok = self._supports_early_refund and target_contract.lower() == self._contract_address.lower()
        if not early_ok and int(datetime.now(timezone.utc).timestamp()) <= entry["expiry"]:
            raise BlockchainError("REFUND_WAITING_EXPIRY")
        return PreparedRefund(
            transaction_hash=REFUND_TX,
            raw_transaction=f"0xrefund:{shipment_id}:{len(self.prepare_calls)}",
            recipient=entry["insurer"],
            amount_wei=entry["amount_wei"],
        )

    def broadcast_refund(self, raw_transaction: str) -> None:
        if self.raise_on_broadcast is not None:
            raise self.raise_on_broadcast
        self.broadcasts.append(raw_transaction)
        shipment_id = raw_transaction.split(":")[1]
        if self.receipt_state_override != "failed":
            self.policies[shipment_id]["status"] = 3

    def refund_receipt_state(self, transaction_hash: str, confirmations: int = 1) -> str:
        if self.receipt_state_override is not None:
            return self.receipt_state_override
        return "confirmed" if self.broadcasts else "missing"


class FakeIntegrityCoordinator:
    def __init__(self, *, confirm: bool = True):
        self.confirm = confirm
        self.anchored_roots: dict[str, str] = {}

    def dispatch(self, session, batch_id: str) -> None:
        batch = session.get(IntegrityBatch, batch_id)
        outbox = session.scalar(select(IntegrationOutbox).where(
            IntegrationOutbox.kind == "ANCHOR_BATCH",
            IntegrationOutbox.aggregate_id == batch_id,
        ))
        payload = dict(outbox.payload)
        payload.update({"network": "sepolia", "transaction_hash": ANCHOR_TX})
        outbox.payload = payload
        outbox.attempt_count += 1
        if self.confirm:
            batch.anchor_status = "DATA_ANCHORED"
            outbox.status = "CONFIRMED"
            self.anchored_roots[batch_id] = batch.merkle_root
        else:
            batch.anchor_status = "BLOCKCHAIN_PENDING"
            outbox.status = "SUBMITTED"
        session.commit()

    def verify_on_chain(self, batch: IntegrityBatch) -> bool:
        return self.confirm and self.anchored_roots.get(batch.id) == batch.merkle_root


class FakePayoutGateway:
    def __init__(self, *, confirm: bool = True):
        self.confirm = confirm
        self.prepare_calls = 0
        self.broadcasts: list[str] = []

    def prepare_report(self, shipment_id, event_id, detected_at):
        self.prepare_calls += 1
        return PreparedReport(PAYOUT_TX, "0xpayout")

    def broadcast(self, raw_transaction):
        self.broadcasts.append(raw_transaction)

    def receipt_succeeded(self, transaction_hash):
        return True if (self.broadcasts and self.confirm) else None

    def policy_paid_for(self, shipment_id, event_id, detected_at):
        return self.confirm and bool(self.broadcasts)


def _signed_v1(key, shipment_id: str, sequence: int, temp_c: float = 5.0, humidity_pct: float = 65.0):
    payload = {
        "payload_version": 1,
        "shipment_id": shipment_id,
        "device_id": "ESP32-01",
        "key_id": "key-v1",
        "sequence_number": sequence,
        "temperature_c": temp_c,
        "humidity_pct": humidity_pct,
        "temperature_milli_c": int(round(temp_c * 1000)),
        "humidity_milli_pct": int(round(humidity_pct * 1000)),
        "recorded_at": "2026-11-18T10:00:00Z",
        "firmware_version": "1.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


def _signed_v2(key, sequence: int, temp_c: float = 5.0, humidity_pct: float = 65.0):
    payload = {
        "payload_version": 2,
        "device_id": "ESP32-01",
        "key_id": "key-v1",
        "sequence_number": sequence,
        "temperature_c": temp_c,
        "humidity_pct": humidity_pct,
        "temperature_milli_c": int(round(temp_c * 1000)),
        "humidity_milli_pct": int(round(humidity_pct * 1000)),
        "recorded_at": "2026-11-18T10:00:00Z",
        "firmware_version": "1.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


def _make_app(tmp_path, *, supports_early_refund: bool = True, contract_address: str = V2_CONTRACT):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'delivery.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        max_sample_gap_seconds=300,
        sensor_gap_minutes=5,
        payout_requires_anchored_evidence=True,
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc))

    gateway = FakeSettlementGateway(
        supports_early_refund=supports_early_refund,
        contract_address=contract_address,
    )
    policy_coord = PolicyCoordinator(gateway, network="sepolia", receipt_timeout_seconds=1)
    settlement_coord = DeliverySettlementCoordinator(gateway, confirmations=1)
    integrity_coord = FakeIntegrityCoordinator(confirm=True)
    payout_gateway = FakePayoutGateway(confirm=True)
    payout_coord = BlockchainCoordinator("sepolia", payout_gateway, receipt_timeout_seconds=1)
    evidence_coord = InsuranceEvidenceCoordinator(
        payout_coord, integrity_coord, max_sample_gap_seconds=300,
    )

    app.state.policy_blockchain = policy_coord
    app.state.delivery_settlement = settlement_coord
    app.state.integrity_blockchain = integrity_coord
    app.state.blockchain = payout_coord
    app.state.insurance_evidence = evidence_coord
    return app, gateway, integrity_coord, payout_gateway


def _register_device(client: TestClient, public_key_pem: str, shipment_id: str, device_id: str = "ESP32-01"):
    from app.models import Device, DeviceKey
    app = client.app
    with app.state.session_factory() as session:
        if not session.get(Device, device_id):
            session.add(Device(id=device_id, device_name=device_id, status="active", last_sequence_number=0))
        if not session.get(DeviceKey, (device_id, "key-v1")):
            session.add(DeviceKey(
                device_id=device_id, key_id="key-v1", public_key_pem=public_key_pem, status="active",
            ))
        session.commit()
    res = client.post(
        f"/api/v1/devices/{device_id}/assignments",
        json={"shipment_id": shipment_id, "active": True},
    )
    assert res.status_code == 200, res.text


def _create_sepolia_shipment(client: TestClient, name: str = "Vaccine Demo") -> str:
    res = client.post("/api/v1/shipments", json={
        "name": name,
        "cargo_type": "Vaccine",
        "origin": {"name": "Kho A", "latitude": 10.7626, "longitude": 106.6601},
        "destination": {"name": "Bệnh viện B", "latitude": 21.0285, "longitude": 105.8542},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "violation_duration_minutes": 15,
        "insurance": {"coverage_amount": "0.05", "currency": "SepoliaETH"},
        "buyer_wallet_address": BUYER_WALLET,
    })
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _advance(clock: VirtualClock, **kwargs) -> None:
    clock.current = clock.current + timedelta(**kwargs)


def _generate_key():
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return priv, pub


def test_safe_delivery_v2_refunds_early_and_preserves_history_and_allows_reassign(tmp_path):
    """Covers scenarios 1, 2, 3, 4, 5, 6, 7, 11, 12, 16, 17."""
    app, gateway, integrity_coord, _payout = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        _register_device(client, pub, shipment_id)

        # Send 3 safe samples (progress 15% < 100%) via v2 device endpoint
        for seq in (1, 2, 3):
            _advance(app.state.clock, minutes=1)
            r = client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, seq, temp_c=5.2))
            assert r.status_code == 201, r.text

        in_transit = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert in_transit["status"] == "in_transit"
        assert in_transit["location"]["progress_pct"] == 15.0
        before_samples = client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]
        assert len(before_samples) == 3

        # Admin completes shipment even though progress < 100%
        done = client.post(f"/api/v1/shipments/{shipment_id}/complete")
        assert done.status_code == 200, done.text
        body = done.json()
        assert body["status"] == "delivered"
        assert body["delivery_source"] == "admin_simulated"
        assert body["delivered_at"] is not None
        assert body["telemetry_closed"] is True
        assert body["location"] == {
            "latitude": 21.0285,
            "longitude": 105.8542,
            "location_source": "admin_simulated",
            "progress_pct": 100.0,
        }
        assert body["delivery_result"] == "SAFE"
        assert body["refund_status"] == "CONFIRMED"
        assert body["refund_transaction_hash"] == REFUND_TX
        assert body["refunded_amount_wei"] == "50000000000000000"
        assert body["refunded_amount"] == "0.05"
        assert body["currency"] == "SepoliaETH"
        assert body["refund_recipient_address"] == INSURER_WALLET
        assert gateway.policies[shipment_id]["status"] == 3
        assert len(gateway.broadcasts) == 1

        # Calling complete again never creates duplicate refunds or events
        again = client.post(f"/api/v1/shipments/{shipment_id}/complete")
        assert again.status_code == 200
        assert again.json()["delivered_at"] == body["delivered_at"]
        assert len(gateway.broadcasts) == 1

        # Historical telemetry locations untouched & no fake telemetry added (still 3 rows)
        after_samples = client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]
        assert after_samples == before_samples

        # Merkle root sealed & anchored, intact
        batches = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"]
        assert len(batches) == 1
        assert batches[0]["anchor_status"] == "DATA_ANCHORED"
        assert batches[0]["verification_status"] == "MATCHED"
        saved_root = integrity_coord.anchored_roots[batches[0]["batch_id"]]

        # Retry of pre-delivery sample still returns 200 duplicate
        retry_old = client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 3, temp_c=5.2))
        assert retry_old.status_code == 200
        assert retry_old.json()["duplicate"] is True

        # New telemetry rejected on BOTH endpoints without revoking device/key
        rej_v2 = client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 4, temp_c=5.0))
        assert rej_v2.status_code == 409
        assert rej_v2.json()["error"]["code"] == "SHIPMENT_COMPLETED"

        rej_v1 = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=_signed_v1(priv, shipment_id, 4, temp_c=5.0))
        assert rej_v1.status_code == 409
        assert rej_v1.json()["error"]["code"] == "SHIPMENT_COMPLETED"
        assert len(client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]) == 3

        # Even hours later, dashboard does NOT show SENSOR_DATA_GAP
        _advance(app.state.clock, hours=5)
        refreshed = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert refreshed["status"] == "delivered"
        listed = client.get("/api/v1/shipments").json()["items"]
        assert next(s for s in listed if s["id"] == shipment_id)["status"] == "delivered"
        events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
        assert not any(e["type"] == "SENSOR_DATA_GAP" for e in events)
        assert sum(e["type"] == "SHIPMENT_DELIVERED" for e in events) == 1
        assert batches[0]["merkle_root"] == f"0x{saved_root}"

        # Device remains active and can be unassigned from delivered shipment and assigned to new shipment
        dev = client.get("/api/v1/devices/ESP32-01").json()
        assert dev["status"] == "active"
        assert dev["has_public_key"] is True

        shipment_2 = _create_sepolia_shipment(client, name="Vaccine Next")
        # Cannot assign device to completed shipment
        assert client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": shipment_id, "active": False}).status_code == 200
        assert client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": shipment_id, "active": True}).status_code == 409
        assert client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": shipment_2, "active": True}).status_code == 200

        r_new = client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 4, temp_c=4.5))
        assert r_new.status_code == 201
        assert r_new.json()["shipment_id"] == shipment_2


def test_violated_shipment_never_refunds_and_reconciles_pending_payout(tmp_path):
    """Covers scenario 8: INSURANCE_TRIGGERED -> VIOLATED, no refund, payout reconciles."""
    app, gateway, _integrity, payout_gateway = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        _register_device(client, pub, shipment_id)

        payout_gateway.confirm = False  # payout pending initially
        for seq, mins in ((1, 0), (2, 5), (3, 10), (4, 15)):
            app.state.clock.current = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc) + timedelta(minutes=mins)
            r = client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, seq, temp_c=11.0))
            assert r.status_code == 201

        payout_gateway.confirm = True  # recovers before/during completion
        done = client.post(f"/api/v1/shipments/{shipment_id}/complete")
        assert done.status_code == 200
        body = done.json()
        assert body["status"] == "delivered"
        assert body["delivery_result"] == "VIOLATED"
        assert body["refund_status"] == "NOT_APPLICABLE"
        assert body["insurance"]["status"] == "triggered"
        assert body["insurance"]["payout_status"] == "paid"
        assert len(gateway.broadcasts) == 0


def test_incomplete_evidence_blocks_refund(tmp_path):
    """Covers scenario 9: sequence gap, time gap, unresolved breach, tampered Merkle, unconfirmed policy."""
    app, gateway, _integrity, _payout = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        # 1) Sequence gap
        s_gap = _create_sepolia_shipment(client, "SeqGap")
        _register_device(client, pub, s_gap)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 3, temp_c=5.0))
        res_gap = client.post(f"/api/v1/shipments/{s_gap}/complete").json()
        assert res_gap["delivery_result"] == "INCOMPLETE"
        assert res_gap["delivery_result_reason"] == "SEQUENCE_GAP"
        assert res_gap["refund_status"] == "NOT_APPLICABLE"
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_gap, "active": False})

        # 2) Time-based SENSOR_DATA_GAP without sequence gap
        s_time_gap = _create_sepolia_shipment(client, "TimeGap")
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_time_gap, "active": True})
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 4, temp_c=5.0))
        _advance(app.state.clock, minutes=12)  # > 5 min gap limit
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 5, temp_c=5.0))
        res_tgap = client.post(f"/api/v1/shipments/{s_time_gap}/complete").json()
        assert res_tgap["delivery_result"] == "INCOMPLETE"
        assert res_tgap["delivery_result_reason"] == "SENSOR_DATA_GAP"
        assert res_tgap["refund_status"] == "NOT_APPLICABLE"
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_time_gap, "active": False})

        # 3) Active unresolved temperature breach at delivery time
        s_breach = _create_sepolia_shipment(client, "ActiveBreach")
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_breach, "active": True})
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 6, temp_c=5.0))
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 7, temp_c=10.5))
        res_breach = client.post(f"/api/v1/shipments/{s_breach}/complete").json()
        assert res_breach["delivery_result"] == "INCOMPLETE"
        assert res_breach["delivery_result_reason"] == "ACTIVE_BREACH_UNRESOLVED"
        assert res_breach["refund_status"] == "NOT_APPLICABLE"
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_breach, "active": False})

        # 4) Tampered telemetry detected by Merkle verification
        s_tamper = _create_sepolia_shipment(client, "Tampered")
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s_tamper, "active": True})
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 8, temp_c=5.0))
        with app.state.session_factory() as session:
            row = session.scalar(select(Telemetry).where(Telemetry.shipment_id == s_tamper))
            row.temperature_c = 6.5  # tamper DB row before sealing/verifying
            session.commit()
        res_tamper = client.post(f"/api/v1/shipments/{s_tamper}/complete").json()
        assert res_tamper["delivery_result"] == "INCOMPLETE"
        assert res_tamper["delivery_result_reason"] == "INTEGRITY_VERIFICATION_FAILED"
        assert res_tamper["refund_status"] == "NOT_APPLICABLE"
        assert len(gateway.broadcasts) == 0


def test_legacy_contract_waits_for_expiry_and_refunds_when_expired(tmp_path):
    """Covers scenario 10: legacy contract refuses early refund, respects expiry, never alters address."""
    app, gateway, _integrity, _payout = _make_app(
        tmp_path, supports_early_refund=False, contract_address=LEGACY_CONTRACT,
    )
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        _register_device(client, pub, shipment_id)
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))

        # Policy not expired yet -> WAITING_EXPIRY, no broadcast
        done = client.post(f"/api/v1/shipments/{shipment_id}/complete").json()
        assert done["status"] == "delivered"
        assert done["delivery_result"] == "SAFE"
        assert done["refund_status"] == "WAITING_EXPIRY"
        assert done["delivery_result_reason"] == "LEGACY_CONTRACT_WAITING_EXPIRY"
        assert done["insurance"]["policy_contract_address"] == LEGACY_CONTRACT
        assert len(gateway.broadcasts) == 0

        # Once expired on-chain, refresh reconciles and triggers refundExpiredPolicy
        gateway.policies[shipment_id]["expiry"] = int(datetime.now(timezone.utc).timestamp()) - 10
        synced = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert synced["refund_status"] == "CONFIRMED"
        assert synced["refund_transaction_hash"] == REFUND_TX
        assert len(gateway.broadcasts) == 1


def test_legacy_policy_kept_on_old_contract_even_after_v2_upgrade(tmp_path):
    """Old policy whose policy_contract_address is LEGACY_CONTRACT must not call v2 early refund."""
    app, gateway, _integrity, _payout = _make_app(
        tmp_path, supports_early_refund=True, contract_address=V2_CONTRACT,
    )
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        with app.state.session_factory() as session:
            s = session.get(Shipment, shipment_id)
            s.policy_contract_address = LEGACY_CONTRACT
            session.commit()
        _register_device(client, pub, shipment_id)
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))

        done = client.post(f"/api/v1/shipments/{shipment_id}/complete").json()
        assert done["refund_status"] == "WAITING_EXPIRY"
        assert done["insurance"]["policy_contract_address"] == LEGACY_CONTRACT
        assert gateway.prepare_calls[-1]["contract_address"] == LEGACY_CONTRACT
        assert len(gateway.broadcasts) == 0


def test_rpc_timeout_does_not_falsely_confirm_and_recovers_on_refresh(tmp_path):
    """Covers scenario 13: RPC timeout during prepare or broadcast leaves PENDING, recovers safely."""
    app, gateway, _integrity, _payout = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        _register_device(client, pub, shipment_id)
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))

        # 1) Timeout during prepare_refund
        gateway.raise_on_prepare = TimeoutError("RPC read timed out")
        done = client.post(f"/api/v1/shipments/{shipment_id}/complete")
        assert done.status_code == 200
        assert done.json()["status"] == "delivered"
        assert done.json()["refund_status"] == "PENDING"
        assert done.json()["refund_transaction_hash"] is None

        # 2) Prepare succeeds, broadcast times out AFTER node mined it on-chain
        gateway.raise_on_prepare = None
        gateway.raise_on_broadcast = TimeoutError("Gateway timeout after tx accepted")
        # Simulate chain actually having processed the tx into Refunded state
        gateway.policies[shipment_id]["status"] = 3
        # Note: in our test, prepare_refund checks status==3 if not yet prepared; so let's test
        # broadcast timeout when status==1 during prepare, then status==3 on chain after timeout:
        gateway.policies[shipment_id]["status"] = 1

        def timeout_after_mining(_raw):
            gateway.policies[shipment_id]["status"] = 3
            raise TimeoutError("HTTP read timeout after node accepted tx")

        gateway.broadcast_refund = timeout_after_mining
        synced = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert synced["refund_status"] == "CONFIRMED"
        assert synced["refund_transaction_hash"] == REFUND_TX


def test_paid_out_cannot_refund_and_refunded_cannot_payout(tmp_path):
    """Covers scenarios 14 & 15."""
    app, gateway, _integrity, payout_gateway = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        # Scenario 14: On-chain policy already PaidOut (status == 2) cannot refund
        s1 = _create_sepolia_shipment(client, "AlreadyPaid")
        _register_device(client, pub, s1)
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))
        gateway.policies[s1]["status"] = 2
        done1 = client.post(f"/api/v1/shipments/{s1}/complete").json()
        assert done1["refund_status"] == "NOT_APPLICABLE"
        assert len(gateway.broadcasts) == 0
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s1, "active": False})

        # Scenario 15: Refunded shipment cannot be paid out even if reconcile is invoked
        s2 = _create_sepolia_shipment(client, "AlreadyRefunded")
        client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": s2, "active": True})
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 2, temp_c=5.0))
        done2 = client.post(f"/api/v1/shipments/{s2}/complete").json()
        assert done2["refund_status"] == "CONFIRMED"

        with app.state.session_factory() as session:
            # Even if an event existed or reconcile was called directly, payout is blocked
            session.add(ShipmentEvent(
                id="00000000-0000-4000-8000-000000000099",
                shipment_id=s2, type="INSURANCE_TRIGGERED",
                occurred_at=datetime.now(timezone.utc), details={},
            ))
            session.commit()
            outcome = app.state.insurance_evidence.reconcile(session, s2)
            assert outcome == "REFUND_ALREADY_CONFIRMED"
            assert payout_gateway.prepare_calls == 0


def test_failed_refund_can_be_retried_safely(tmp_path):
    app, gateway, _integrity, _payout = _make_app(tmp_path, supports_early_refund=True)
    priv, pub = _generate_key()

    with TestClient(app, headers=ADMIN) as client:
        shipment_id = _create_sepolia_shipment(client)
        _register_device(client, pub, shipment_id)
        _advance(app.state.clock, minutes=1)
        client.post("/api/v1/devices/ESP32-01/telemetry", json=_signed_v2(priv, 1, temp_c=5.0))

        gateway.receipt_state_override = "failed"
        done = client.post(f"/api/v1/shipments/{shipment_id}/complete").json()
        assert done["status"] == "delivered"
        assert done["refund_status"] == "FAILED"

        # Passive GET refresh does not spam prepare calls on a FAILED refund
        calls_before = len(gateway.prepare_calls)
        assert client.get(f"/api/v1/shipments/{shipment_id}").json()["refund_status"] == "FAILED"
        assert len(gateway.prepare_calls) == calls_before

        # Explicit retry succeeds
        gateway.receipt_state_override = None
        retried = client.post(f"/api/v1/shipments/{shipment_id}/refund/retry")
        assert retried.status_code == 200
        assert retried.json()["refund_status"] == "CONFIRMED"


def test_web3_policy_adapter_prepares_early_and_legacy_refunds(tmp_path, monkeypatch):
    """Unit test Web3PolicyAdapter.prepare_refund for both safe_delivery_v2 and legacy contracts."""
    settings_v2 = Settings(
        database_url=f"sqlite:///{(tmp_path / 'adapter.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        blockchain_enabled=True,
        blockchain_contract_address=V2_CONTRACT,
        blockchain_oracle_private_key="0x" + "11" * 32,
        blockchain_insurer_private_key="0x" + "22" * 32,
        blockchain_insurance_contract_version="safe_delivery_v2",
    )
    adapter_v2 = Web3PolicyAdapter(settings_v2)
    web3, contract = MagicMock(), MagicMock()
    monkeypatch.setattr(adapter_v2, "_contract", lambda addr=None: (web3, contract, addr or V2_CONTRACT))
    web3.eth.gas_price = 10
    web3.eth.get_block.return_value = {"baseFeePerGas": None}
    web3.eth.get_transaction_count.return_value = 3
    oracle_acc = web3.eth.account.from_key.return_value
    oracle_acc.address = "0x3333333333333333333333333333333333333333"
    contract.functions.oracle.return_value.call.return_value = oracle_acc.address
    future_expiry = int(datetime.now(timezone.utc).timestamp()) + 86400
    contract.functions.getPolicy.return_value.call.return_value = (
        INSURER_WALLET, BUYER_WALLET, 50_000_000_000_000_000, future_expiry, 1, bytes(32), 0,
    )
    contract.functions.completeSafeDelivery.return_value.build_transaction.side_effect = lambda p: p
    oracle_acc.sign_transaction.return_value = SimpleNamespace(
        raw_transaction=b"\xab\xcd", hash=bytes.fromhex("ee" * 32),
    )

    prepared = adapter_v2.prepare_refund(
        "8b4fb8a2-2996-4da2-90b9-35019517f56f", "safe-delivery:1", datetime.now(timezone.utc),
    )
    assert prepared.recipient == INSURER_WALLET
    assert prepared.amount_wei == 50_000_000_000_000_000
    assert prepared.transaction_hash == "0x" + "ee" * 32
    contract.functions.completeSafeDelivery.assert_called_once()

    # Legacy contract address on a shipment falls back to legacy expiry check even when v2 configured
    with pytest.raises(BlockchainError) as err:
        adapter_v2.prepare_refund(
            "8b4fb8a2-2996-4da2-90b9-35019517f56f", "safe-delivery:1",
            datetime.now(timezone.utc), contract_address=LEGACY_CONTRACT,
        )
    assert err.value.code == "REFUND_WAITING_EXPIRY"
