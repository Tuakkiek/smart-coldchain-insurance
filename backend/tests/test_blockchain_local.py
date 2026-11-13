"""Opt-in Phase 6 E2E against a freshly deployed and seeded Hardhat node."""

from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select
from web3 import Web3

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Shipment, ShipmentEvent
from app.schemas.api import ShipmentCreate
from app.services.clock import VirtualClock
from app.services.shipments import create_shipment
from app.services.telemetry_protocol import canonical_signed_bytes


REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDED_SHIPMENT_ID = "8b4fb8a2-2996-4da2-90b9-35019517f56f"
INTEGRITY_ARTIFACT = REPO_ROOT / "blockchain/artifacts/contracts/ColdChainDataIntegrity.sol/ColdChainDataIntegrity.json"
ADMIN = {"X-Admin-Key": "phase6-local-admin"}


def signed_payload(key, sequence):
    payload = {
        "payload_version": 1,
        "shipment_id": SEEDED_SHIPMENT_ID,
        "device_id": "PHASE6-HARDHAT",
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


@pytest.mark.skipif(os.getenv("RUN_BLOCKCHAIN_TESTS") != "1", reason="requires a fresh seeded Hardhat node")
def test_signed_anchored_violation_pays_once_on_local_chain(tmp_path):
    deployment = json.loads((REPO_ROOT / "blockchain/deployments/localhost.json").read_text(encoding="utf-8"))
    oracle_key = os.environ["BLOCKCHAIN_TEST_ORACLE_KEY"]
    web3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
    artifact = json.loads(INTEGRITY_ARTIFACT.read_text(encoding="utf-8"))
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    deploy_hash = factory.constructor(web3.eth.accounts[1]).transact({"from": web3.eth.accounts[0]})
    integrity_address = web3.eth.wait_for_transaction_receipt(deploy_hash).contractAddress
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'chain.db').as_posix()}",
        admin_api_key=ADMIN["X-Admin-Key"],
        integrity_batch_max_age_minutes=5,
        max_sample_gap_seconds=300,
        blockchain_enabled=True,
        blockchain_network="localhost",
        blockchain_rpc_url="http://127.0.0.1:8545",
        blockchain_chain_id=deployment["chainId"],
        blockchain_contract_address=deployment["contracts"]["ColdChainInsurance"]["address"],
        blockchain_oracle_private_key=oracle_key,
        data_integrity_contract_address=integrity_address,
        blockchain_anchorer_private_key=oracle_key,
        blockchain_confirmations=1,
        blockchain_receipt_timeout_seconds=3,
    ))
    Base.metadata.create_all(app.state.engine)
    start = datetime(2026, 11, 13, tzinfo=timezone.utc)
    app.state.clock = VirtualClock(start)
    device_key = ec.generate_private_key(ec.SECP256R1())
    public_key = device_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
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
            assert client.post("/api/v1/devices", headers=ADMIN, json={
                "device_id": "PHASE6-HARDHAT",
                "key_id": "key-v1",
                "public_key_pem": public_key,
                "shipment_id": SEEDED_SHIPMENT_ID,
            }).status_code == 201
            route = f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}/telemetry"
            for sequence, minute in enumerate((0, 5, 10, 15), start=1):
                app.state.clock.current = start + timedelta(minutes=minute)
                response = client.post(route, json=signed_payload(device_key, sequence))
                assert response.status_code == 201, response.text
            detail = client.get(f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}").json()
            assert detail["insurance"]["payout_status"] == "paid"
            assert detail["blockchain"]["confirmation_status"] == "success"
            assert detail["blockchain"]["transaction_hash"].startswith("0x")
            batches = client.get(
                f"/api/v1/shipments/{SEEDED_SHIPMENT_ID}/batches"
            ).json()["items"]
            assert sum(batch["record_count"] for batch in batches) == 4
            assert all(batch["anchor_status"] == "DATA_ANCHORED" for batch in batches)
            assert all(batch["verification_status"] == "MATCHED" for batch in batches)
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
            evidence = next(event for event in events if event["type"] == "INSURANCE_TRIGGERED")
            assert evidence["details"]["evidence_status"] == "PAYOUT_CONFIRMED"
            assert evidence["details"]["gap_status"] == "COMPLETE"
    finally:
        app.state.engine.dispose()
