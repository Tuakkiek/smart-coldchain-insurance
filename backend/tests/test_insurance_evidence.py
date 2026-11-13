"""Phase 6: signed, continuous, anchored evidence gates insurance payout."""

import base64
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import Base
from app.integrations.blockchain_adapter import PreparedReport
from app.main import create_app
from app.models import IntegrityBatch, IntegrationOutbox, ShipmentEvent, Telemetry
from app.services.blockchain_outbox import BlockchainCoordinator
from app.services.clock import VirtualClock
from app.services.insurance_evidence import InsuranceEvidenceCoordinator
from app.services.telemetry_protocol import canonical_signed_bytes


ADMIN = {"X-Admin-Key": "phase6-admin"}
PAYOUT_TX = "0x" + "cd" * 32
ANCHOR_TX = "0x" + "ab" * 32


class FakePayoutGateway:
    def __init__(self):
        self.prepare_calls = 0
        self.broadcasts = []

    def prepare_report(self, shipment_id, event_id, detected_at):
        self.prepare_calls += 1
        return PreparedReport(PAYOUT_TX, "0xpayout")

    def broadcast(self, raw_transaction):
        self.broadcasts.append(raw_transaction)

    def receipt_succeeded(self, transaction_hash):
        return True if self.broadcasts else None

    def policy_paid_for(self, shipment_id, event_id, detected_at):
        return True


class FakeIntegrityCoordinator:
    def __init__(self):
        self.confirm = False

    def dispatch(self, session, batch_id):
        batch = session.get(IntegrityBatch, batch_id)
        outbox = session.scalar(select(IntegrationOutbox).where(
            IntegrationOutbox.kind == "ANCHOR_BATCH",
            IntegrationOutbox.aggregate_id == batch_id,
        ))
        payload = dict(outbox.payload)
        payload.update({"network": "hardhat", "transaction_hash": ANCHOR_TX})
        outbox.payload = payload
        outbox.attempt_count += 1
        if self.confirm:
            batch.anchor_status = "DATA_ANCHORED"
            outbox.status = "CONFIRMED"
        else:
            batch.anchor_status = "BLOCKCHAIN_PENDING"
            outbox.status = "SUBMITTED"
        session.commit()

    def verify_on_chain(self, _batch):
        return self.confirm


def _signed(key, shipment_id, sequence):
    payload = {
        "payload_version": 1,
        "shipment_id": shipment_id,
        "device_id": "PHASE6-DEVICE",
        "key_id": "key-v1",
        "sequence_number": sequence,
        "temperature_c": 9.2,
        "humidity_pct": 80.0,
        "temperature_milli_c": 9200,
        "humidity_milli_pct": 80000,
        "recorded_at": "2026-11-13T00:00:00Z",
        "firmware_version": "1.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


def _setup(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'phase6.db').as_posix()}",
        admin_api_key=ADMIN["X-Admin-Key"],
        max_sample_gap_seconds=300,
        payout_requires_anchored_evidence=True,
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 13, tzinfo=timezone.utc))
    payout_gateway = FakePayoutGateway()
    payout = BlockchainCoordinator("hardhat", payout_gateway, receipt_timeout_seconds=1)
    integrity = FakeIntegrityCoordinator()
    app.state.blockchain = payout
    app.state.integrity_blockchain = integrity
    app.state.insurance_evidence = InsuranceEvidenceCoordinator(
        payout, integrity, max_sample_gap_seconds=300,
    )
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    client = TestClient(app)
    shipment_id = client.post("/api/v1/shipments", json={
        "code": "PHASE6-EVIDENCE",
        "cargo_type": "vaccine",
        "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
        "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "violation_duration_minutes": 15,
        "insured_amount_vnd": 1000,
    }).json()["id"]
    assert client.post("/api/v1/devices", headers=ADMIN, json={
        "device_id": "PHASE6-DEVICE",
        "key_id": "key-v1",
        "public_key_pem": pem,
        "shipment_id": shipment_id,
    }).status_code == 201
    return app, client, key, shipment_id, payout_gateway, integrity


def _send_breach(app, client, key, shipment_id):
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    start = datetime(2026, 11, 13, tzinfo=timezone.utc)
    for sequence, minute in enumerate((0, 5, 10, 14), start=1):
        app.state.clock.current = start + timedelta(minutes=minute)
        assert client.post(route, json=_signed(key, shipment_id, sequence)).status_code == 201
    assert client.get(f"/api/v1/shipments/{shipment_id}").json()["insurance"]["status"] == "active"
    app.state.clock.current = start + timedelta(minutes=15)
    assert client.post(route, json=_signed(key, shipment_id, 5)).status_code == 201


def test_anchor_pending_blocks_payout_then_confirmed_evidence_releases_once(tmp_path):
    app, client, key, shipment_id, payout_gateway, integrity = _setup(tmp_path)
    try:
        _send_breach(app, client, key, shipment_id)
        pending = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert pending["insurance"]["payout_status"] == "evidence_pending"
        assert pending["blockchain"] is None
        assert payout_gateway.prepare_calls == 0

        batches = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"]
        assert sum(batch["record_count"] for batch in batches) == 5
        assert all(batch["verification_status"] == "MATCHED" for batch in batches)
        assert all(batch["anchor_status"] == "BLOCKCHAIN_PENDING" for batch in batches)

        integrity.confirm = True
        for batch in batches:
            anchored = client.post(
                f"/api/v1/batches/{batch['batch_id']}/anchor", headers=ADMIN,
            )
            assert anchored.status_code == 200, anchored.text
        paid = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert paid["insurance"]["payout_status"] == "paid"
        assert paid["blockchain"]["transaction_hash"] == PAYOUT_TX
        assert payout_gateway.prepare_calls == 1

        event = next(
            item for item in client.get(
                f"/api/v1/shipments/{shipment_id}/events"
            ).json()["items"]
            if item["type"] == "INSURANCE_TRIGGERED"
        )
        assert event["type"] == "INSURANCE_TRIGGERED"
        assert event["details"]["evidence_status"] == "PAYOUT_CONFIRMED"
        assert event["details"]["gap_status"] == "COMPLETE"
        assert len(event["details"]["telemetry_ids"]) == 5
        assert event["details"]["batch_ids"] == [batch["batch_id"] for batch in batches]
        assert event["details"]["batches"][0]["anchor_transaction_hash"] == ANCHOR_TX

        assert client.post(
            f"/api/v1/shipments/{shipment_id}/insurance/reconcile",
        ).status_code == 401
        assert client.post(
            f"/api/v1/shipments/{shipment_id}/insurance/reconcile", headers=ADMIN,
        ).status_code == 200
        assert payout_gateway.prepare_calls == 1
    finally:
        client.close()
        app.state.engine.dispose()


def test_tampered_evidence_never_reaches_oracle(tmp_path):
    app, client, key, shipment_id, payout_gateway, integrity = _setup(tmp_path)
    try:
        _send_breach(app, client, key, shipment_id)
        batches = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"]
        with app.state.session_factory() as session:
            sample = session.scalars(select(Telemetry).order_by(Telemetry.received_at).limit(1)).one()
            sample.temperature_c = 9.3
            session.commit()
        integrity.confirm = True
        for batch in batches:
            assert client.post(
                f"/api/v1/batches/{batch['batch_id']}/anchor", headers=ADMIN,
            ).status_code == 200
        detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
        assert detail["insurance"]["payout_status"] == "not_requested"
        assert detail["blockchain"] is None
        assert payout_gateway.prepare_calls == 0
        event = next(
            item for item in client.get(
                f"/api/v1/shipments/{shipment_id}/events"
            ).json()["items"]
            if item["type"] == "INSURANCE_TRIGGERED"
        )
        assert event["details"]["evidence_status"] == "EVIDENCE_REJECTED"
        assert event["details"]["evidence_reason"] == "EVIDENCE_INTEGRITY_MISMATCH"
    finally:
        client.close()
        app.state.engine.dispose()
