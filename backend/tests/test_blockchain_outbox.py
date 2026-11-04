"""Phase 5: durable handoff, recovery, and one payout per shipment."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import Base
from app.integrations.blockchain_adapter import BlockchainError, PreparedReport, Web3BlockchainAdapter
from app.main import create_app
from app.models import ShipmentEvent, Telemetry
from app.services.blockchain_outbox import BlockchainCoordinator
from app.services.clock import VirtualClock


SHIPMENT = {
    "code": "SHIP-CHAIN-001", "cargo_type": "vaccine",
    "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
    "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
    "temp_min_c": 2.0, "temp_max_c": 8.0,
    "violation_duration_minutes": 15, "insured_amount_vnd": 10000000,
}
TX_HASH = "0x" + "ab" * 32


def test_backend_hashes_match_hardhat_contract_vectors():
    shipment_key, evidence_hash = Web3BlockchainAdapter._keys(
        "8b4fb8a2-2996-4da2-90b9-35019517f56f",
        "c3afece0-1668-4f96-aad6-58349f8f0a64",
    )
    assert shipment_key.hex() == "770fdffbbe559e11472e63e8a6058bb3c9dc5170704a7e3db36c6d5f694688b8"
    assert evidence_hash.hex() == "a29ba7b3e1b567d7c993248882846b126d47c624d1ddbab13135b175eac440bd"
    assert Web3BlockchainAdapter._detected_seconds(
        datetime(2026, 11, 4, 7, tzinfo=timezone.utc)
    ) == 1793775600


class FakeGateway:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.prepare_calls = 0
        self.broadcasts: list[str] = []
        self.fail_prepare = False
        self.fail_broadcast = False
        self.fail_after_accept = False

    def prepare_report(self, shipment_id, event_id, detected_at):
        self.prepare_calls += 1
        if self.fail_prepare:
            raise BlockchainError("RPC_UNAVAILABLE")
        assert event_id and detected_at.tzinfo is not None
        return PreparedReport(TX_HASH, "0xdeadbeef")

    def broadcast(self, raw_transaction):
        # The triggering sample and event must be committed before any RPC call.
        with self.session_factory() as session:
            assert session.scalar(select(Telemetry.id)) is not None
            assert session.scalar(select(ShipmentEvent.id).where(ShipmentEvent.type == "INSURANCE_TRIGGERED")) is not None
        if self.fail_broadcast:
            raise BlockchainError("RPC_UNAVAILABLE")
        self.broadcasts.append(raw_transaction)
        if self.fail_after_accept:
            raise BlockchainError("RPC_UNAVAILABLE")

    def receipt_succeeded(self, transaction_hash):
        assert transaction_hash == TX_HASH
        return True if self.broadcasts else None

    def policy_paid_for(self, shipment_id, event_id, detected_at):
        return True


def run_breach(tmp_path, gateway_mode):
    app = create_app(Settings(database_url=f"sqlite:///{(tmp_path / 'chain.db').as_posix()}"))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 4, tzinfo=timezone.utc))
    gateway = FakeGateway(app.state.session_factory)
    setattr(gateway, gateway_mode, True)
    coordinator = BlockchainCoordinator("localhost", gateway, receipt_timeout_seconds=1)
    app.state.blockchain = coordinator
    with TestClient(app) as client:
        shipment = client.post("/api/v1/shipments", json=SHIPMENT).json()
        shipment_id = shipment["id"]
        response = client.post(
            f"/api/v1/demo/shipments/{shipment_id}/scenario",
            json={"scenario": "temperature_breach"},
        )
        assert response.status_code == 200, response.text
        detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
        events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
        history = client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]
    return app, gateway, coordinator, shipment_id, detail, events, history


def test_successful_report_exposes_hash_and_never_pays_twice(tmp_path):
    app, gateway, coordinator, shipment_id, detail, events, history = run_breach(tmp_path, "noop")
    try:
        assert len(history) == 4
        assert [event["type"] for event in events].count("INSURANCE_TRIGGERED") == 1
        assert detail["blockchain"] == {
            "network": "localhost", "transaction_hash": TX_HASH, "confirmation_status": "success",
        }
        assert detail["insurance"]["payout_status"] == "paid"
        assert gateway.prepare_calls == 1
        assert gateway.broadcasts == ["0xdeadbeef"]
        triggered = events[-1]["details"]
        assert triggered["blockchain_status"] == "BLOCKCHAIN_SUCCESS"
        assert triggered["attempt_count"] == 1
        assert triggered["sent_at"].endswith("Z")
        assert "_raw_transaction" not in triggered
        with app.state.session_factory() as session:
            coordinator.dispatch(session, shipment_id)
        assert gateway.prepare_calls == 1
        assert len(gateway.broadcasts) == 1
    finally:
        app.state.engine.dispose()


def test_rpc_failure_preserves_telemetry_and_retry_succeeds(tmp_path):
    app, gateway, coordinator, shipment_id, detail, events, history = run_breach(tmp_path, "fail_prepare")
    try:
        assert len(history) == 4
        assert detail["insurance"]["status"] == "triggered"
        assert detail["insurance"]["payout_status"] == "pending"
        assert detail["blockchain"]["confirmation_status"] == "pending"
        assert detail["blockchain"]["transaction_hash"] is None
        assert events[-1]["details"]["blockchain_status"] == "BLOCKCHAIN_PENDING"
        assert events[-1]["details"]["last_error"] == "RPC_UNAVAILABLE"
        gateway.fail_prepare = False
        with app.state.session_factory() as session:
            coordinator.dispatch(session, shipment_id)
        with TestClient(app) as client:
            updated = client.get(f"/api/v1/shipments/{shipment_id}").json()
            events_after = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
        assert updated["insurance"]["payout_status"] == "paid"
        assert updated["blockchain"]["transaction_hash"] == TX_HASH
        assert [event["type"] for event in events_after].count("INSURANCE_TRIGGERED") == 1
    finally:
        app.state.engine.dispose()


def test_retry_rebroadcasts_same_signed_transaction(tmp_path):
    app, gateway, coordinator, shipment_id, detail, events, _history = run_breach(tmp_path, "fail_broadcast")
    try:
        assert detail["blockchain"]["transaction_hash"] == TX_HASH
        assert detail["blockchain"]["confirmation_status"] == "pending"
        assert gateway.prepare_calls == 1
        gateway.fail_broadcast = False
        with app.state.session_factory() as session:
            coordinator.dispatch(session, shipment_id)
        assert gateway.prepare_calls == 1
        assert gateway.broadcasts == ["0xdeadbeef"]
        with TestClient(app) as client:
            assert client.get(f"/api/v1/shipments/{shipment_id}").json()["insurance"]["payout_status"] == "paid"
    finally:
        app.state.engine.dispose()


def test_rpc_timeout_after_accept_reconciles_receipt(tmp_path):
    app, gateway, coordinator, shipment_id, detail, _events, history = run_breach(tmp_path, "fail_after_accept")
    try:
        assert len(history) == 4
        assert detail["insurance"]["payout_status"] == "paid"
        assert detail["blockchain"]["transaction_hash"] == TX_HASH
        assert gateway.prepare_calls == 1
        assert gateway.broadcasts == ["0xdeadbeef"]
        with app.state.session_factory() as session:
            coordinator.dispatch(session, shipment_id)
        assert gateway.broadcasts == ["0xdeadbeef"]
    finally:
        app.state.engine.dispose()
