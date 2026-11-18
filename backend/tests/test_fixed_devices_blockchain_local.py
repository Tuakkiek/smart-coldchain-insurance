"""Opt-in full flow on an isolated Hardhat node; never uses the configured database."""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from eth_account import Account
from fastapi.testclient import TestClient
from web3 import Web3

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.services.clock import VirtualClock
from app.services.device_provisioning import load_device_keys
from app.services.device_registry import DEVICE_IDS
from test_signed_ingestion import ADMIN, SHIPMENT, signed


@pytest.mark.skipif(os.getenv("RUN_FIXED_DEVICE_BLOCKCHAIN_TESTS") != "1", reason="requires isolated Hardhat at localhost:18545")
def test_fixed_keys_and_new_shipment_uuid_anchor_and_pay_native_eth_once(tmp_path):
    web3 = Web3(Web3.HTTPProvider("http://127.0.0.1:18545"))
    assert web3.eth.chain_id == 31337 and "hardhat" in web3.client_version.lower()
    Account.enable_unaudited_hdwallet_features()
    # Hardhat's publicly documented development mnemonic, only for this local node.
    accounts = [Account.from_mnemonic(
        "test test test test test test test test test test test junk",
        account_path=f"m/44'/60'/0'/0/{index}",
    ) for index in range(3)]
    root = Path(__file__).resolve().parents[2]

    def deploy(name, role):
        artifact = json.loads((root / f"blockchain/artifacts/contracts/{name}.sol/{name}.json").read_text())
        factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
        tx = factory.constructor(role).transact({"from": accounts[0].address})
        receipt = web3.eth.wait_for_transaction_receipt(tx)
        return web3.eth.contract(address=receipt.contractAddress, abi=artifact["abi"])

    insurance = deploy("ColdChainInsurance", accounts[1].address)
    integrity = deploy("ColdChainDataIntegrity", accounts[2].address)
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'full-flow.db').as_posix()}",
        app_env="test", admin_username="admin", admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        device_provisioning_mode="local", device_keys_path=tmp_path / "esp32-keys.txt",
        blockchain_enabled=True, blockchain_network="hardhat", blockchain_chain_id=31337,
        blockchain_rpc_url="http://127.0.0.1:18545", blockchain_contract_address=insurance.address,
        blockchain_oracle_private_key=accounts[1].key.hex(), blockchain_insurer_private_key=accounts[0].key.hex(),
        data_integrity_contract_address=integrity.address, blockchain_anchorer_private_key=accounts[2].key.hex(),
        integrity_batch_max_records=1, blockchain_receipt_timeout_seconds=5,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime.now(timezone.utc))
    buyer = web3.eth.accounts[3]
    amount = 100000000000000  # 0.0001 native ETH
    payload = {key: value for key, value in SHIPMENT.items() if key != "insured_amount_vnd"} | {
        "name": "Vaccine Cần Thơ", "violation_duration_minutes": 1,
        "insurance": {"coverage_amount": "0.0001", "currency": "SepoliaETH"},
        "buyer_wallet_address": buyer,
    }
    try:
        with TestClient(app, headers=ADMIN) as client:
            assert [row["device_id"] for row in client.get("/api/v1/devices").json()["items"]] == list(DEVICE_IDS)
            first = client.post("/api/v1/shipments", json=payload).json()
            second = client.post("/api/v1/shipments", json=payload).json()
            assert first["name"] == second["name"] and first["shipment_id"] != second["shipment_id"]
            assert first["insurance"]["policy_status"] == second["insurance"]["policy_status"] == "CONFIRMED"
            shipment_id = first["shipment_id"]
            assert client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": shipment_id, "active": True}).status_code == 200
            key = load_device_keys(settings.device_keys_path)["ESP32-01"]
            before = web3.eth.get_balance(buyer)
            route = f"/api/v1/shipments/{shipment_id}/telemetry"
            for sequence in (1, 2):
                if sequence == 2:
                    app.state.clock.current += timedelta(minutes=1)
                sample = signed(key, shipment_id, sequence, temperature=9.2)
                response = client.post(route, json=sample)
                assert response.status_code == 201, response.text
            detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
            assert detail["insurance"]["payout_status"] == "paid"
            batches = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"]
            assert len(batches) == 2 and all(batch["anchor_status"] == "DATA_ANCHORED" for batch in batches)
            assert web3.eth.get_balance(buyer) - before == amount
            assert client.post(route, json=sample).json()["duplicate"] is True
            client.post(f"/api/v1/shipments/{shipment_id}/insurance/reconcile")
            assert web3.eth.get_balance(buyer) - before == amount
    finally:
        app.state.engine.dispose()
