"""Opt-in end-to-end test against a freshly deployed and seeded Hardhat node."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Shipment, ShipmentEvent
from app.schemas.api import ShipmentCreate
from app.services.shipments import create_shipment


REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDED_SHIPMENT_ID = "8b4fb8a2-2996-4da2-90b9-35019517f56f"


@pytest.mark.skipif(os.getenv("RUN_BLOCKCHAIN_TESTS") != "1", reason="requires a fresh seeded Hardhat node")
def test_one_violation_pays_once_on_local_chain(tmp_path):
    deployment = json.loads((REPO_ROOT / "blockchain/deployments/localhost.json").read_text(encoding="utf-8"))
    oracle_key = os.environ["BLOCKCHAIN_TEST_ORACLE_KEY"]
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'chain.db').as_posix()}",
        blockchain_enabled=True,
        blockchain_network="localhost",
        blockchain_rpc_url="http://127.0.0.1:8545",
        blockchain_chain_id=deployment["chainId"],
        blockchain_contract_address=deployment["contracts"]["ColdChainInsurance"]["address"],
        blockchain_oracle_private_key=oracle_key,
        blockchain_abi_path=REPO_ROOT / "blockchain/artifacts/contracts/ColdChainInsurance.sol/ColdChainInsurance.json",
    ))
    Base.metadata.create_all(app.state.engine)
    try:
        with app.state.session_factory() as session:
            shipment = create_shipment(session, ShipmentCreate.model_validate({
                "code": "SHIP-CHAIN-LIVE", "cargo_type": "vaccine",
                "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
                "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
                "temp_min_c": 2.0, "temp_max_c": 8.0,
                "violation_duration_minutes": 15, "insured_amount_vnd": 10000000,
            }))
            shipment.id = SEEDED_SHIPMENT_ID
            session.commit()

        with TestClient(app) as client:
            scenario = client.post(
                f"/api/v1/demo/shipments/{SEEDED_SHIPMENT_ID}/scenario",
                json={"scenario": "temperature_breach"},
            )
            assert scenario.status_code == 200, scenario.text
            detail = client.get(f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}").json()
            assert detail["insurance"]["payout_status"] == "paid"
            assert detail["blockchain"]["confirmation_status"] == "success"
            assert detail["blockchain"]["transaction_hash"].startswith("0x")
            first_hash = detail["blockchain"]["transaction_hash"]
            with app.state.session_factory() as session:
                app.state.blockchain.dispatch(session, SEEDED_SHIPMENT_ID)
            assert client.get(f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}").json()["blockchain"]["transaction_hash"] == first_hash
            # Simulate losing the local hash after the chain has paid. Reconcile
            # from the policy and InsurancePaid log without a second payout.
            with app.state.session_factory() as session:
                stored = session.get(Shipment, SEEDED_SHIPMENT_ID)
                stored.transaction_hash = None
                stored.confirmation_status = "pending"
                stored.payout_status = "pending"
                event = session.scalar(select(ShipmentEvent).where(
                    ShipmentEvent.shipment_id == SEEDED_SHIPMENT_ID,
                    ShipmentEvent.type == "INSURANCE_TRIGGERED",
                ))
                event.details = {key: value for key, value in event.details.items() if key != "_raw_transaction"}
                session.commit()
                app.state.blockchain.dispatch(session, SEEDED_SHIPMENT_ID)
            reconciled = client.get(f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}").json()
            assert reconciled["blockchain"]["transaction_hash"] == first_hash
            assert reconciled["insurance"]["payout_status"] == "paid"
            events = client.get(f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}/events").json()["items"]
            assert [event["type"] for event in events].count("INSURANCE_TRIGGERED") == 1
    finally:
        app.state.engine.dispose()
