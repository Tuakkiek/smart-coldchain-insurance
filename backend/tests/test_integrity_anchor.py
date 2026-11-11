"""Phase 5 durable anchor lifecycle, retry, and API exposure."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.database import Base
from app.integrations.blockchain_adapter import IntegrityAnchor, PreparedAnchor
from app.main import create_app
from app.models import Device, IntegrityBatch, IntegrationOutbox, Shipment
from app.services.integrity_anchor_service import IntegrityAnchorCoordinator


ADMIN = {"X-Admin-Key": "anchor-test-admin"}


class FakeIntegrityGateway:
    def __init__(self):
        self.state = "missing"
        self.matches = True
        self.raise_after_broadcast = False
        self.prepare_count = 0
        self.broadcast_count = 0
        self.last_anchor: IntegrityAnchor | None = None

    def prepare_anchor(self, anchor: IntegrityAnchor) -> PreparedAnchor:
        self.prepare_count += 1
        self.last_anchor = anchor
        return PreparedAnchor("0x" + "ab" * 32, "0x1234")

    def broadcast(self, raw_transaction: str) -> None:
        assert raw_transaction == "0x1234"
        self.broadcast_count += 1
        if self.raise_after_broadcast:
            raise TimeoutError("node accepted but HTTP response timed out")
        self.state = "success"

    def receipt_state(self, transaction_hash: str, confirmations: int) -> str:
        assert transaction_hash == "0x" + "ab" * 32
        assert confirmations == 1
        return self.state

    def batch_matches(self, anchor: IntegrityAnchor) -> bool:
        self.last_anchor = anchor
        return self.matches

    def anchored_transaction_hash(self, batch_id: str) -> str | None:
        return "0x" + "ab" * 32


def setup_app(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'anchor.db').as_posix()}",
        admin_api_key=ADMIN["X-Admin-Key"],
    ))
    Base.metadata.create_all(app.state.engine)
    batch_id = str(uuid4())
    shipment_id = str(uuid4())
    now = datetime(2026, 11, 11, 9, tzinfo=timezone.utc)
    with app.state.session_factory() as session:
        session.add(Shipment(
            id=shipment_id,
            code="ANCHOR-TEST",
            cargo_type="vaccine",
            origin_name="A",
            origin_latitude=10.0,
            origin_longitude=105.0,
            destination_name="B",
            destination_latitude=11.0,
            destination_longitude=106.0,
            temp_min_c=2.0,
            temp_max_c=8.0,
            violation_duration_minutes=15,
            insured_amount_vnd=1000,
            status="in_transit",
            insurance_status="active",
            payout_status="not_requested",
            created_at=now,
        ))
        session.add(Device(id="ANCHOR-DEVICE", status="active", created_at=now))
        session.commit()
        session.add(IntegrityBatch(
            id=batch_id,
            shipment_id=shipment_id,
            device_id="ANCHOR-DEVICE",
            status="SEALED",
            first_sequence=1,
            last_sequence=3,
            record_count=3,
            merkle_root="11" * 32,
            hash_version="MERKLE-v1",
            verification_status="MATCHED",
            anchor_status="NOT_READY",
            sealed_at=now,
        ))
        session.add(IntegrationOutbox(
            id=str(uuid4()),
            kind="ANCHOR_BATCH",
            aggregate_id=batch_id,
            idempotency_key=f"anchor:{batch_id}",
            status="PENDING",
            payload={"batch_id": batch_id},
            attempt_count=0,
            available_at=now,
            created_at=now,
            updated_at=now,
        ))
        session.commit()
    return app, batch_id


def test_anchor_api_confirms_once_and_exposes_transaction(tmp_path):
    app, batch_id = setup_app(tmp_path)
    gateway = FakeIntegrityGateway()
    coordinator = IntegrityAnchorCoordinator("hardhat", gateway, receipt_timeout_seconds=1)
    app.state.integrity_blockchain = coordinator
    try:
        with TestClient(app) as client:
            assert client.post(f"/api/v1/batches/{batch_id}/anchor").status_code == 401
            anchored = client.post(f"/api/v1/batches/{batch_id}/anchor", headers=ADMIN)
            assert anchored.status_code == 200
            body = anchored.json()
            assert body["anchor_status"] == "DATA_ANCHORED"
            assert body["anchor_transaction"] == {
                "network": "hardhat",
                "transaction_hash": "0x" + "ab" * 32,
                "status": "CONFIRMED",
                "attempt_count": 1,
                "last_error": None,
                "submitted_at": body["anchor_transaction"]["submitted_at"],
                "confirmed_at": body["anchor_transaction"]["confirmed_at"],
            }
            assert body["anchor_transaction"]["submitted_at"].endswith("Z")
            assert body["anchor_transaction"]["confirmed_at"].endswith("Z")
            assert client.post(f"/api/v1/batches/{batch_id}/anchor", headers=ADMIN).status_code == 200
        assert gateway.prepare_count == 1
        assert gateway.broadcast_count == 1
        with app.state.session_factory() as session:
            outbox = session.query(IntegrationOutbox).filter_by(aggregate_id=batch_id).one()
            assert "_raw_transaction" not in outbox.payload
    finally:
        app.state.engine.dispose()


def test_timeout_keeps_signed_transaction_and_reconciles_without_rebroadcast(tmp_path):
    app, batch_id = setup_app(tmp_path)
    gateway = FakeIntegrityGateway()
    gateway.raise_after_broadcast = True
    coordinator = IntegrityAnchorCoordinator("hardhat", gateway, receipt_timeout_seconds=1)
    try:
        with app.state.session_factory() as session:
            coordinator.dispatch(session, batch_id)
            batch = session.get(IntegrityBatch, batch_id)
            outbox = session.query(IntegrationOutbox).filter_by(aggregate_id=batch_id).one()
            assert batch.anchor_status == "BLOCKCHAIN_PENDING"
            assert outbox.status == "SUBMITTED"
            assert outbox.payload["_raw_transaction"] == "0x1234"
            assert outbox.last_error == "RPC_UNAVAILABLE"

            gateway.raise_after_broadcast = False
            gateway.state = "success"
            coordinator.dispatch(session, batch_id)
            assert session.get(IntegrityBatch, batch_id).anchor_status == "DATA_ANCHORED"
            assert outbox.status == "CONFIRMED"
            assert outbox.attempt_count == 2
        assert gateway.prepare_count == 1
        assert gateway.broadcast_count == 1
    finally:
        app.state.engine.dispose()


def test_success_receipt_with_wrong_readback_fails_closed(tmp_path):
    app, batch_id = setup_app(tmp_path)
    gateway = FakeIntegrityGateway()
    gateway.matches = False
    coordinator = IntegrityAnchorCoordinator("hardhat", gateway, receipt_timeout_seconds=1)
    try:
        with app.state.session_factory() as session:
            coordinator.dispatch(session, batch_id)
            assert session.get(IntegrityBatch, batch_id).anchor_status == "BLOCKCHAIN_FAILED"
            outbox = session.query(IntegrationOutbox).filter_by(aggregate_id=batch_id).one()
            assert outbox.status == "FAILED"
            assert outbox.last_error == "ON_CHAIN_BATCH_MISMATCH"
    finally:
        app.state.engine.dispose()
