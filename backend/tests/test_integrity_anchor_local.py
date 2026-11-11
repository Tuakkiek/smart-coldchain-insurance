"""Opt-in E2E: signed telemetry -> sealed batch -> Hardhat anchor -> readback verify."""

import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from web3 import Web3

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.services.clock import VirtualClock
from app.services.telemetry_protocol import canonical_signed_bytes


REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = REPO_ROOT / "blockchain/artifacts/contracts/ColdChainDataIntegrity.sol/ColdChainDataIntegrity.json"
ADMIN = {"X-Admin-Key": "local-integrity-admin"}


@pytest.mark.skipif(
    os.getenv("RUN_INTEGRITY_BLOCKCHAIN_TESTS") != "1",
    reason="requires a fresh Hardhat node and BLOCKCHAIN_TEST_ANCHORER_KEY",
)
def test_signed_batch_is_anchored_and_read_back_on_local_chain(tmp_path):
    web3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
    artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    deploy_hash = factory.constructor(web3.eth.accounts[1]).transact({"from": web3.eth.accounts[0]})
    deployment = web3.eth.wait_for_transaction_receipt(deploy_hash)

    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'integrity-chain.db').as_posix()}",
        admin_api_key=ADMIN["X-Admin-Key"],
        integrity_batch_max_records=1,
        blockchain_enabled=True,
        blockchain_network="hardhat",
        blockchain_rpc_url="http://127.0.0.1:8545",
        blockchain_chain_id=31337,
        data_integrity_contract_address=deployment.contractAddress,
        blockchain_anchorer_private_key=os.environ["BLOCKCHAIN_TEST_ANCHORER_KEY"],
        blockchain_confirmations=1,
        blockchain_receipt_timeout_seconds=3,
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 11, 12, tzinfo=timezone.utc))
    key = ec.generate_private_key(ec.SECP256R1())
    public_key = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    try:
        with TestClient(app) as client:
            shipment = client.post("/api/v1/shipments", json={
                "code": "CHAIN-INTEGRITY",
                "cargo_type": "vaccine",
                "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
                "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
                "temp_min_c": 2.0,
                "temp_max_c": 8.0,
                "violation_duration_minutes": 15,
                "insured_amount_vnd": 1000,
            }).json()
            shipment_id = shipment["id"]
            assert client.post("/api/v1/devices", headers=ADMIN, json={
                "device_id": "CHAIN-DEVICE",
                "key_id": "key-v1",
                "public_key_pem": public_key,
                "shipment_id": shipment_id,
            }).status_code == 201
            payload = {
                "payload_version": 1,
                "shipment_id": shipment_id,
                "device_id": "CHAIN-DEVICE",
                "key_id": "key-v1",
                "sequence_number": 1,
                "temperature_c": 5.0,
                "humidity_pct": 80.0,
                "temperature_milli_c": 5000,
                "humidity_milli_pct": 80000,
                "recorded_at": "2026-11-11T12:00:00Z",
                "firmware_version": "1.0.0",
            }
            payload["signature"] = base64.b64encode(
                key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
            ).decode("ascii")
            assert client.post(
                f"/api/v1/shipments/{shipment_id}/telemetry", json=payload,
            ).status_code == 201

            batch = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"][0]
            assert batch["anchor_status"] == "DATA_ANCHORED"
            assert batch["anchor_transaction"]["status"] == "CONFIRMED"
            transaction_hash = batch["anchor_transaction"]["transaction_hash"]
            verified = client.post(f"/api/v1/batches/{batch['batch_id']}/verify").json()
            assert verified["verification_status"] == "MATCHED"
            assert verified["on_chain_match"] is True
            repeated = client.post(
                f"/api/v1/batches/{batch['batch_id']}/anchor", headers=ADMIN,
            ).json()
            assert repeated["anchor_transaction"]["transaction_hash"] == transaction_hash
    finally:
        app.state.engine.dispose()
