"""Comprehensive tests for Google Maps resolution, SepoliaETH->Wei, Buyer Wallet, DB migration, and Policy lifecycle."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from web3 import Web3

from app.cli import upgrade_schema
from app.core.config import Settings
from app.core.database import Base, make_engine, make_session_factory
from app.integrations.blockchain_adapter import (
    BlockchainError,
    OnChainPolicy,
    PolicySubmission,
    Web3PolicyAdapter,
)
from app.main import create_app
from app.models import Shipment
from app.services.auth import create_access_token
from app.services.eth_units import parse_eth_to_wei, validate_and_checksum_wallet
from app.services.google_maps_service import GoogleMapsService, LocationResolveError
from app.services.policy_blockchain import PolicyCoordinator


ADMIN_TOKEN = create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

BUYER_LOWER = "0x1234567890abcdef1234567890abcdef12345678"
BUYER_CHECKSUM = Web3.to_checksum_address(BUYER_LOWER)
ADMIN_WALLET = Web3.to_checksum_address("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
CONTRACT_ADDR = Web3.to_checksum_address("0xeD8266444aF3506C5FceB556cA00Bf4305De1cA8")


def _sepolia_shipment_payload(**overrides):
    base = {
        "name": "SHIP-SEP-001",
        "cargo_type": "Vaccine",
        "origin": {
            "address": "Kho Trung Ương 1, Hà Nội",
            "formatted_address": "Kho Trung Ương 1, Hoàn Kiếm, Hà Nội, Việt Nam",
            "latitude": 21.0285,
            "longitude": 105.8542,
            "place_id": "place_id_origin_hn",
        },
        "destination": {
            "address": "Trung Tâm Tiêm Chủng CDC Đà Nẵng",
            "formatted_address": "Trung Tâm Tiêm Chủng CDC, Hải Châu, Đà Nẵng, Việt Nam",
            "latitude": 16.0544,
            "longitude": 108.2022,
            "place_id": "place_id_dest_dn",
        },
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "violation_duration_minutes": 15,
        "insurance": {
            "coverage_amount": "0.05",
            "currency": "SepoliaETH",
        },
        "buyer_wallet_address": BUYER_LOWER,
    }
    base.update(overrides)
    return base


class FakePolicyGateway:
    def __init__(self, *, fail_submit: bool = False, confirmation_state: str = "confirmed"):
        self.fail_submit = fail_submit
        self.confirmation_state = confirmation_state
        self.submitted_calls: list[dict] = []
        self.confirmed_checks: list[dict] = []
        self.policies: dict[str, OnChainPolicy] = {}

    @property
    def contract_address(self) -> str:
        return CONTRACT_ADDR

    @property
    def chain_id(self) -> int:
        return 11155111

    @property
    def can_submit_server_side(self) -> bool:
        return True

    def read_policy(self, shipment_id: str) -> OnChainPolicy:
        return self.policies[shipment_id]

    def submit_policy(
        self, shipment_id: str, buyer_wallet: str, amount_wei: int, expiry_timestamp: int,
    ) -> PolicySubmission:
        self.submitted_calls.append({
            "shipment_id": shipment_id,
            "buyer_wallet": buyer_wallet,
            "amount_wei": amount_wei,
            "expiry_timestamp": expiry_timestamp,
        })
        if self.fail_submit:
            raise BlockchainError("INSURER_INSUFFICIENT_ETH_BALANCE")
        tx_hash = "0x" + ("ab" * 32)
        self.policies[shipment_id] = OnChainPolicy(
            insurer=ADMIN_WALLET,
            beneficiary=buyer_wallet,
            payout_amount_wei=amount_wei,
            expiry=expiry_timestamp,
            status=1,
            evidence_hash="0x" + ("00" * 32),
            detected_at=0,
        )
        return PolicySubmission(transaction_hash=tx_hash, contract_address=CONTRACT_ADDR)

    def check_policy_confirmation(
        self,
        transaction_hash: str,
        shipment_id: str,
        buyer_wallet: str,
        amount_wei: int,
        confirmations: int = 1,
    ) -> str:
        self.confirmed_checks.append({
            "tx_hash": transaction_hash,
            "shipment_id": shipment_id,
            "buyer_wallet": buyer_wallet,
            "amount_wei": amount_wei,
            "confirmations": confirmations,
        })
        return self.confirmation_state


@pytest.fixture
def api(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'upgrade.db').as_posix()}"
    app = create_app(Settings(
        database_url=database_url,
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        blockchain_contract_address=CONTRACT_ADDR,
        blockchain_oracle_private_key="0x" + ("11" * 32),
        blockchain_enabled=False,
        blockchain_chain_id=11155111,
        blockchain_network="sepolia",
    ))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers=ADMIN) as client:
        yield client, app
    app.state.engine.dispose()


# ─── 1. ETH -> Wei & Wallet Unit Tests ────────────────────────────────────────

@pytest.mark.parametrize("eth_input,expected_eth,expected_wei", [
    ("0.05", "0.05", "50000000000000000"),
    ("0.000000000000000001", "0.000000000000000001", "1"),
    ("1", "1", "1000000000000000000"),
    ("1.5000", "1.5", "1500000000000000000"),
    ("123.456789012345678901", "123.456789012345678901", "123456789012345678901"),
])
def test_parse_eth_to_wei_valid(eth_input, expected_eth, expected_wei):
    norm, wei = parse_eth_to_wei(eth_input)
    assert norm == expected_eth
    assert wei == expected_wei


@pytest.mark.parametrize("bad_input", [
    "",
    "   ",
    "0",
    "0.0",
    "0.000000000000000000",
    "-0.05",
    "-1",
    "0.0000000000000000001",  # 19 decimals
    "1e-5",
    "abc",
    "0.05 ETH",
    "1,05",
    "99999999999999999999999999999999999999999999999999999999999999999999",  # > uint256
    0.05,  # raw float rejected
])
def test_parse_eth_to_wei_rejects_invalid(bad_input):
    with pytest.raises(ValueError):
        parse_eth_to_wei(bad_input)


def test_wallet_validation_and_eip55_checksum():
    assert validate_and_checksum_wallet(BUYER_LOWER) == BUYER_CHECKSUM
    assert validate_and_checksum_wallet(BUYER_CHECKSUM) == BUYER_CHECKSUM

    # Corrupt one letter's case in mixed-case checksum
    wrong_checksum = BUYER_CHECKSUM[:-1] + (
        BUYER_CHECKSUM[-1].lower() if BUYER_CHECKSUM[-1].isupper() else BUYER_CHECKSUM[-1].upper()
    )
    if wrong_checksum != BUYER_CHECKSUM and any(c.isupper() for c in wrong_checksum[2:]) and any(c.islower() for c in wrong_checksum[2:]):
        with pytest.raises(ValueError, match="EIP-55"):
            validate_and_checksum_wallet(wrong_checksum)

    for invalid in ["", "0x123", "1234567890abcdef1234567890abcdef12345678", "0x" + "g" * 40, "0x" + "1" * 41]:
        with pytest.raises(ValueError):
            validate_and_checksum_wallet(invalid)


# ─── 2. Google Maps Service & Anti-SSRF Tests ─────────────────────────────────

def _mock_public_dns(_host, _port):
    return [(2, 1, 6, "", ("142.250.190.78", 0))]


def test_google_maps_extract_at_and_pin_and_query_coords():
    svc = GoogleMapsService(api_key="", allow_nominatim_fallback=False)

    # @lat,lng URL
    r1 = svc.resolve("https://www.google.com/maps/place/Kho+Trung+Uong+1/@21.0285,105.8542,17z")
    assert r1.latitude == 21.0285
    assert r1.longitude == 105.8542
    assert r1.formatted_address == "Kho Trung Uong 1"
    assert r1.source == "google_maps_url"

    # !3d!4d pin preferred over @viewport
    r2 = svc.resolve("https://www.google.com/maps/place/CDC+Da+Nang/@16.0600,108.2100,15z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d16.0544!4d108.2022")
    assert r2.latitude == 16.0544
    assert r2.longitude == 108.2022
    assert r2.formatted_address == "CDC Da Nang"

    # ?q=lat,lng
    r3 = svc.resolve("https://maps.google.com/?q=10.7769,106.7009")
    assert r3.latitude == 10.7769
    assert r3.longitude == 106.7009

    # ?api=1&query=lat,lng
    r4 = svc.resolve("https://www.google.com/maps/search/?api=1&query=10.0333,105.7833")
    assert r4.latitude == 10.0333
    assert r4.longitude == 105.7833


def test_google_maps_short_link_redirect_and_geocoding():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "maps.app.goo.gl":
            return httpx.Response(
                302,
                headers={"location": "https://www.google.com/maps/place/Kho+Ha+Noi/@21.0285,105.8542,17z"},
            )
        if request.url.host == "maps.googleapis.com":
            address = request.url.params.get("address", "")
            if "KhongTonTai" in address:
                return httpx.Response(200, json={"status": "ZERO_RESULTS", "results": []})
            return httpx.Response(
                200,
                json={
                    "status": "OK",
                    "results": [
                        {
                            "formatted_address": "Kho Trung Ương 1, Hoàn Kiếm, Hà Nội, Việt Nam",
                            "geometry": {"location": {"lat": 21.0285, "lng": 105.8542}},
                            "place_id": "ChIJ_fake_place_id",
                        }
                    ],
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    svc = GoogleMapsService(
        api_key="test-google-api-key",
        http_client_factory=lambda: httpx.Client(transport=transport, follow_redirects=False),
        dns_resolver=_mock_public_dns,
    )

    # Short link redirect
    short_res = svc.resolve("https://maps.app.goo.gl/abc123XYZ")
    assert short_res.latitude == 21.0285
    assert short_res.longitude == 105.8542
    assert short_res.formatted_address == "Kho Ha Noi"

    # Search URL with text query -> Geocoding API
    search_res = svc.resolve("https://www.google.com/maps/search/?api=1&query=Kho+Trung+Uong+1+Ha+Noi")
    assert search_res.latitude == 21.0285
    assert search_res.longitude == 105.8542
    assert search_res.place_id == "ChIJ_fake_place_id"
    assert search_res.source == "google_maps_geocoding"

    # Plain text address -> Geocoding API
    text_res = svc.resolve("Kho Trung Ương 1, Hà Nội")
    assert text_res.formatted_address == "Kho Trung Ương 1, Hoàn Kiếm, Hà Nội, Việt Nam"
    assert text_res.place_id == "ChIJ_fake_place_id"

    # Non-existent address -> 404, NO fake coordinates
    with pytest.raises(LocationResolveError) as exc:
        svc.resolve("DiaChiKhongTonTaiXYZ999")
    assert exc.value.status_code == 404
    assert exc.value.code == "LOCATION_NOT_FOUND"


@pytest.mark.parametrize("malicious_url", [
    "http://127.0.0.1:8000/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost/maps/@21.0,105.8",
    "https://evil.example.com/maps/@21.0,105.8",
    "file:///etc/passwd",
    "https://maps.app.goo.gl.evil.com/abc",
])
def test_google_maps_ssrf_blocks_disallowed_urls(malicious_url):
    svc = GoogleMapsService(api_key="key")
    with pytest.raises(LocationResolveError) as exc:
        svc.resolve(malicious_url)
    assert exc.value.status_code == 400
    assert exc.value.code == "UNSUPPORTED_URL"


def test_google_maps_ssrf_blocks_private_ip_dns_and_bad_redirect():
    private_dns = lambda _h, _p: [(2, 1, 6, "", ("10.0.0.5", 0))]
    svc_private = GoogleMapsService(api_key="", dns_resolver=private_dns)
    with pytest.raises(LocationResolveError) as exc:
        svc_private.resolve("https://maps.app.goo.gl/test")
    assert exc.value.status_code == 400

    # Redirect from Google short link to external/internal host must be blocked
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})
    )
    svc_redir = GoogleMapsService(
        api_key="",
        http_client_factory=lambda: httpx.Client(transport=transport, follow_redirects=False),
        dns_resolver=_mock_public_dns,
    )
    with pytest.raises(LocationResolveError) as exc2:
        svc_redir.resolve("https://maps.app.goo.gl/evilredir")
    assert exc2.value.status_code == 400
    assert exc2.value.code == "UNSUPPORTED_REDIRECT"


def test_google_maps_rejects_out_of_range_coordinates():
    svc = GoogleMapsService(api_key="")
    with pytest.raises(LocationResolveError) as exc:
        svc.resolve("https://www.google.com/maps/place/Bad/@95.0,105.0,17z")
    assert exc.value.status_code == 422
    assert exc.value.code == "INVALID_COORDINATES"


def test_locations_resolve_api_endpoint_auth_and_response(api):
    client, _app = api
    # Unauthenticated rejected
    unauth = client.post("/api/v1/locations/resolve", json={"input": "https://maps.google.com/?q=21.0285,105.8542"}, headers={"Authorization": ""})
    assert unauth.status_code == 401

    resp = client.post(
        "/api/v1/locations/resolve",
        json={"input": "https://www.google.com/maps/place/Kho+A/@21.0285,105.8542,17z"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["latitude"] == 21.0285
    assert body["data"]["longitude"] == 105.8542


# ─── 3. Shipment Create + DB + Blockchain Policy Integration Tests ────────────

def test_create_sepolia_shipment_stores_wei_wallet_and_independent_places(api):
    client, app = api
    resp = client.post("/api/v1/shipments", json=_sepolia_shipment_payload())
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Origin & Destination stored independently without overwriting
    assert data["origin"]["name"] == "Kho Trung Ương 1, Hà Nội"
    assert data["origin"]["formatted_address"] == "Kho Trung Ương 1, Hoàn Kiếm, Hà Nội, Việt Nam"
    assert data["origin"]["place_id"] == "place_id_origin_hn"
    assert data["origin"]["latitude"] == 21.0285
    assert data["origin"]["longitude"] == 105.8542

    assert data["destination"]["name"] == "Trung Tâm Tiêm Chủng CDC Đà Nẵng"
    assert data["destination"]["formatted_address"] == "Trung Tâm Tiêm Chủng CDC, Hải Châu, Đà Nẵng, Việt Nam"
    assert data["destination"]["place_id"] == "place_id_dest_dn"
    assert data["destination"]["latitude"] == 16.0544
    assert data["destination"]["longitude"] == 108.2022

    # SepoliaETH exact Wei & Buyer Wallet checksummed
    assert data["buyer_wallet_address"] == BUYER_CHECKSUM
    assert data["insurance"]["coverage_amount"] == "0.05"
    assert data["insurance"]["coverage_amount_wei"] == "50000000000000000"
    assert data["insurance"]["currency"] == "SepoliaETH"
    assert data["insurance"]["chain_id"] == 11155111
    assert data["insurance"]["buyer_wallet_address"] == BUYER_CHECKSUM
    assert data["insurance"]["policy_status"] == "PENDING"
    assert data["insurance"]["policy_contract_address"] == CONTRACT_ADDR

    # Verify DB persistence directly
    with app.state.session_factory() as session:
        row = session.get(Shipment, data["id"])
        assert row is not None
        assert row.insurance_amount == "0.05"
        assert row.insurance_amount_wei == "50000000000000000"
        assert row.insurance_currency == "SepoliaETH"
        assert row.blockchain_chain_id == 11155111
        assert row.buyer_wallet_address == BUYER_CHECKSUM
        assert row.origin_place_id == "place_id_origin_hn"
        assert row.destination_place_id == "place_id_dest_dn"


def test_create_sepolia_shipment_rejects_invalid_inputs(api):
    client, _app = api

    # Missing buyer wallet
    bad_no_wallet = _sepolia_shipment_payload(name="BAD-1", buyer_wallet_address=None)
    assert client.post("/api/v1/shipments", json=bad_no_wallet).status_code == 422

    # Invalid wallet
    bad_wallet = _sepolia_shipment_payload(name="BAD-2", buyer_wallet_address="0x12345")
    assert client.post("/api/v1/shipments", json=bad_wallet).status_code == 422

    # Zero ETH
    bad_zero = _sepolia_shipment_payload(name="BAD-3", insurance={"coverage_amount": "0", "currency": "SepoliaETH"})
    assert client.post("/api/v1/shipments", json=bad_zero).status_code == 422

    # Negative ETH
    bad_neg = _sepolia_shipment_payload(name="BAD-4", insurance={"coverage_amount": "-0.05", "currency": "SepoliaETH"})
    assert client.post("/api/v1/shipments", json=bad_neg).status_code == 422

    # 19 decimal places
    bad_prec = _sepolia_shipment_payload(
        name="BAD-5",
        insurance={"coverage_amount": "0.0000000000000000001", "currency": "SepoliaETH"},
    )
    assert client.post("/api/v1/shipments", json=bad_prec).status_code == 422

    # Out-of-range coordinates
    bad_lat = _sepolia_shipment_payload(name="BAD-6")
    bad_lat["origin"]["latitude"] = 91.5
    assert client.post("/api/v1/shipments", json=bad_lat).status_code == 422


def test_policy_lifecycle_confirmed_failed_and_retry_without_duplicate(api):
    client, app = api
    gateway = FakePolicyGateway(fail_submit=False, confirmation_state="confirmed")
    app.state.policy_blockchain = PolicyCoordinator(
        gateway, network="sepolia", confirmations=2, receipt_timeout_seconds=1,
    )

    resp = client.post("/api/v1/shipments", json=_sepolia_shipment_payload(name="SHIP-CHAIN-OK"))
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["insurance"]["policy_status"] == "CONFIRMED"
    assert created["insurance"]["policy_transaction_hash"] == "0x" + ("ab" * 32)
    assert created["insurance"]["policy_contract_address"] == CONTRACT_ADDR
    assert len(gateway.submitted_calls) == 1
    call = gateway.submitted_calls[0]
    assert call["buyer_wallet"] == BUYER_CHECKSUM
    assert call["amount_wei"] == 50000000000000000

    # Verify on-chain readback has Admin as insurer and Buyer as beneficiary (distinct!)
    on_chain = gateway.read_policy(created["id"])
    assert on_chain.insurer == ADMIN_WALLET
    assert on_chain.beneficiary == BUYER_CHECKSUM
    assert on_chain.insurer != on_chain.beneficiary
    assert on_chain.payout_amount_wei == 50000000000000000

    # Now simulate Smart Contract failure on creation -> marks FAILED, no duplicate on retry
    gateway.fail_submit = True
    failed_resp = client.post("/api/v1/shipments", json=_sepolia_shipment_payload(name="SHIP-CHAIN-RETRY"))
    assert failed_resp.status_code == 201
    failed_data = failed_resp.json()
    assert failed_data["insurance"]["policy_status"] == "FAILED"
    assert failed_data["insurance"]["policy_last_error"] == "INSURER_INSUFFICIENT_ETH_BALANCE"

    # Retry succeeds and updates same shipment row (no duplicate)
    gateway.fail_submit = False
    retry_resp = client.post(f"/api/v1/shipments/{failed_data['id']}/policy/retry")
    assert retry_resp.status_code == 200
    retried = retry_resp.json()
    assert retried["id"] == failed_data["id"]
    assert retried["insurance"]["policy_status"] == "CONFIRMED"
    assert retried["insurance"]["policy_last_error"] is None

    # Confirm total shipments count is exactly 2 (no duplicates)
    assert client.get("/api/v1/shipments").json()["total"] == 2


def test_external_metamask_policy_confirm_endpoint(api):
    client, app = api
    # Create shipment while server policy creation is not enabled
    resp = client.post("/api/v1/shipments", json=_sepolia_shipment_payload(name="SHIP-MM-01"))
    assert resp.status_code == 201
    shipment_id = resp.json()["id"]
    assert resp.json()["insurance"]["policy_status"] == "PENDING"

    # Now wire gateway to verify externally submitted MetaMask tx
    gateway = FakePolicyGateway(confirmation_state="confirmed")
    app.state.policy_blockchain = PolicyCoordinator(
        gateway, network="sepolia", confirmations=2, receipt_timeout_seconds=1,
    )
    tx_hash = "0x" + ("cd" * 32)
    confirm_resp = client.post(
        f"/api/v1/shipments/{shipment_id}/policy/confirm",
        json={"transaction_hash": tx_hash},
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    confirmed = confirm_resp.json()
    assert confirmed["insurance"]["policy_status"] == "CONFIRMED"
    assert confirmed["insurance"]["policy_transaction_hash"] == tx_hash
    assert len(gateway.confirmed_checks) == 1
    assert gateway.confirmed_checks[0]["buyer_wallet"] == BUYER_CHECKSUM
    assert gateway.confirmed_checks[0]["amount_wei"] == 50000000000000000


# ─── 4. Historical Legacy VND Data Migration Test ─────────────────────────────

def test_migration_07_preserves_legacy_vnd_records_without_converting_to_eth(tmp_path):
    db_url = f"sqlite:///{(tmp_path / 'legacy_vnd.db').as_posix()}"
    engine = make_engine(db_url)
    try:
        # Simulate a legacy shipments table prior to migration 20261118_07
        with engine.begin() as conn:
            conn.exec_driver_sql("""
                CREATE TABLE shipments (
                    id VARCHAR(36) PRIMARY KEY,
                    code VARCHAR(64) NOT NULL UNIQUE,
                    cargo_type VARCHAR(100) NOT NULL,
                    origin_name VARCHAR(100) NOT NULL,
                    origin_latitude DOUBLE NOT NULL,
                    origin_longitude DOUBLE NOT NULL,
                    destination_name VARCHAR(100) NOT NULL,
                    destination_latitude DOUBLE NOT NULL,
                    destination_longitude DOUBLE NOT NULL,
                    temp_min_c DOUBLE NOT NULL,
                    temp_max_c DOUBLE NOT NULL,
                    violation_duration_minutes INTEGER NOT NULL,
                    insured_amount_vnd BIGINT NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    insurance_status VARCHAR(32) NOT NULL,
                    payout_status VARCHAR(32) NOT NULL,
                    blockchain_network VARCHAR(100),
                    transaction_hash VARCHAR(66),
                    confirmation_status VARCHAR(32),
                    created_at DATETIME NOT NULL
                )
            """)
            conn.exec_driver_sql("""
                INSERT INTO shipments (
                    id, code, cargo_type, origin_name, origin_latitude, origin_longitude,
                    destination_name, destination_latitude, destination_longitude,
                    temp_min_c, temp_max_c, violation_duration_minutes, insured_amount_vnd,
                    status, insurance_status, payout_status, created_at
                ) VALUES (
                    '8b4fb8a2-2996-4da2-90b9-35019517f56f', 'LEGACY-VND-001', 'Vaccine',
                    'Kho A', 10.03, 105.77, 'Kho B', 10.05, 105.81,
                    2.0, 8.0, 15, 50000000, 'created', 'active', 'not_requested',
                    '2026-11-01 00:00:00'
                )
            """)

        # Run full schema upgrade (all alembic migrations through 20261118_07)
        upgrade_schema(engine)

        with make_session_factory(engine)() as session:
            legacy = session.get(Shipment, "8b4fb8a2-2996-4da2-90b9-35019517f56f")
            assert legacy is not None
            assert legacy.insured_amount_vnd == 50000000
            assert legacy.insurance_currency == "VND"
            assert legacy.insurance_amount is None
            assert legacy.insurance_amount_wei is None
            assert legacy.buyer_wallet_address is None

        # Verify downgrade cleanly drops only the new columns while preserving legacy data
        backend_dir = Path(__file__).resolve().parents[1]
        cfg = Config(str(backend_dir / "alembic.ini"))
        cfg.set_main_option("script_location", str(backend_dir / "alembic"))
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            command.downgrade(cfg, "20261117_06")
        cols = {c["name"] for c in sa.inspect(engine).get_columns("shipments")}
        assert "insurance_amount_wei" not in cols
        assert "buyer_wallet_address" not in cols
        assert "insured_amount_vnd" in cols
    finally:
        engine.dispose()


def test_same_name_shipments_create_independent_policies_by_uuid(api):
    client, app = api
    gateway = FakePolicyGateway()
    app.state.policy_blockchain = PolicyCoordinator(gateway, network="sepolia", receipt_timeout_seconds=1)
    payload = _sepolia_shipment_payload(name="Vaccine Cần Thơ")
    first = client.post("/api/v1/shipments", json=payload).json()
    second = client.post("/api/v1/shipments", json=payload).json()
    assert first["name"] == second["name"]
    assert first["shipment_id"] != second["shipment_id"]
    assert {call["shipment_id"] for call in gateway.submitted_calls} == {first["shipment_id"], second["shipment_id"]}
    assert first["insurance"]["policy_status"] == second["insurance"]["policy_status"] == "CONFIRMED"


@pytest.mark.parametrize("enough_balance", [True, False])
def test_policy_adapter_escrows_native_eth_without_erc20_approval(api, enough_balance, monkeypatch):
    _, app = api
    from dataclasses import replace
    from types import SimpleNamespace
    settings = replace(app.state.settings, blockchain_insurer_private_key="test-only-signer")
    adapter = Web3PolicyAdapter(settings)
    web3, contract = MagicMock(), MagicMock()
    monkeypatch.setattr(adapter, "_contract", lambda: (web3, contract, CONTRACT_ADDR))
    contract.functions.getPolicy.return_value.call.return_value = (ADMIN_WALLET, BUYER_CHECKSUM, 0, 0, 0, bytes(32), 0)
    amount = 50000000000000000
    web3.eth.gas_price = 10
    web3.eth.get_balance.return_value = amount + 3000000 if enough_balance else amount - 1
    web3.eth.get_transaction_count.return_value = 7
    account = web3.eth.account.from_key.return_value
    contract.functions.createPolicy.return_value.build_transaction.side_effect = lambda params: params
    account.sign_transaction.return_value = SimpleNamespace(raw_transaction=b"signed-test", hash=bytes.fromhex("ab" * 32))
    if not enough_balance:
        with pytest.raises(BlockchainError) as error:
            adapter.submit_policy("8b4fb8a2-2996-4da2-90b9-35019517f56f", BUYER_CHECKSUM, amount, 2000000000)
        assert error.value.code == "INSURER_INSUFFICIENT_ETH_BALANCE"
        account.sign_transaction.assert_not_called()
    else:
        submission = adapter.submit_policy("8b4fb8a2-2996-4da2-90b9-35019517f56f", BUYER_CHECKSUM, amount, 2000000000)
        transaction = account.sign_transaction.call_args.args[0]
        assert transaction["value"] == amount
        assert transaction["nonce"] == 7
        assert submission.transaction_hash == "0x" + "ab" * 32
        web3.eth.send_raw_transaction.assert_called_once_with(b"signed-test")
    contract.functions.payoutToken.assert_not_called()
