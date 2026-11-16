"""Phase 4 persistence, immutable membership, and tamper verification."""

import base64
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import (
    IntegrityBatch,
    IntegrityBatchItem,
    IntegrationOutbox,
    ShipmentEvent,
    Telemetry,
)
from app.services.clock import VirtualClock
from app.services.telemetry_protocol import canonical_signed_bytes


from app.services.auth import create_access_token

ADMIN_TOKEN = create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
SHIPMENT = {
    "code": "INTEGRITY-TEST",
    "cargo_type": "vaccine",
    "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
    "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
    "temp_min_c": 2.0,
    "temp_max_c": 8.0,
    "violation_duration_minutes": 15,
    "insured_amount_vnd": 10000000,
}


def signed(key, shipment_id: str, sequence: int, temperature: float = 5.0) -> dict:
    payload = {
        "payload_version": 1,
        "shipment_id": shipment_id,
        "device_id": "ESP32-INTEGRITY",
        "key_id": "key-v1",
        "sequence_number": sequence,
        "temperature_c": temperature,
        "humidity_pct": 80.0,
        "temperature_milli_c": round(temperature * 1000),
        "humidity_milli_pct": 80000,
        "recorded_at": f"2026-11-09T12:00:{sequence:02d}Z",
        "firmware_version": "1.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


@pytest.fixture
def integrity_api(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'integrity.db').as_posix()}",
        integrity_batch_max_records=3,
        integrity_batch_max_age_minutes=5,
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 9, 12, tzinfo=timezone.utc))
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    with TestClient(app, headers=ADMIN) as client:
        shipment_id = client.post("/api/v1/shipments", json=SHIPMENT).json()["id"]
        registered = client.post("/api/v1/devices", json={
            "device_id": "ESP32-INTEGRITY",
            "device_name": "Integrity sensor",
        })
        assert registered.status_code == 201
        assert client.post("/api/v1/devices/ESP32-INTEGRITY/assignments",
                           json={"shipment_id": shipment_id, "active": True}).status_code == 200
        assert client.post("/api/v1/devices/ESP32-INTEGRITY/keys",
                           json={"key_id": "key-v1", "public_key_pem": pem}).status_code == 201
        yield client, app, key, shipment_id
    app.state.engine.dispose()


def test_auto_seal_persists_membership_root_and_outbox(integrity_api):
    client, app, key, shipment_id = integrity_api
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    for sequence in (1, 2, 3):
        assert client.post(route, json=signed(key, shipment_id, sequence)).status_code == 201

    listing = client.get(f"/api/v1/shipments/{shipment_id}/batches")
    assert listing.status_code == 200
    batch = listing.json()["items"][0]
    assert listing.json()["total"] == 1
    assert batch["status"] == "SEALED"
    assert batch["record_count"] == 3
    assert (batch["first_sequence"], batch["last_sequence"]) == (1, 3)
    assert batch["merkle_root"].startswith("0x") and len(batch["merkle_root"]) == 66
    assert batch["verification_status"] == "MATCHED"
    assert batch["anchor_status"] == "NOT_READY"

    detail = client.get(f"/api/v1/batches/{batch['batch_id']}")
    assert detail.status_code == 200
    assert detail.json() == batch
    summary = client.get(f"/api/v1/shipments/{shipment_id}/integrity").json()
    assert summary == {
        "shipment_id": shipment_id,
        "batch_count": 1,
        "record_count": 3,
        "verification_status": "MATCHED",
        "anchor_status": "NOT_READY",
    }

    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(IntegrityBatchItem)) == 3
        outbox = session.scalar(select(IntegrationOutbox))
        assert outbox.kind == "ANCHOR_BATCH"
        assert outbox.status == "PENDING"
        assert outbox.idempotency_key == f"anchor:{batch['batch_id']}"
        assert outbox.payload["merkle_root"] == batch["merkle_root"]

    verified = client.post(f"/api/v1/batches/{batch['batch_id']}/verify", headers=ADMIN)
    assert verified.status_code == 200
    assert verified.json()["verification_status"] == "MATCHED"
    assert verified.json()["calculated_root"] == batch["merkle_root"]


def test_membership_is_immutable_and_tamper_creates_one_alert(integrity_api):
    client, app, key, shipment_id = integrity_api
    telemetry_route = f"/api/v1/shipments/{shipment_id}/telemetry"
    for sequence in (1, 2, 3):
        client.post(telemetry_route, json=signed(key, shipment_id, sequence))
    first = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"][0]

    # A later sample cannot change the sealed first batch; it forms a new forced batch.
    assert client.post(telemetry_route, json=signed(key, shipment_id, 4)).status_code == 201
    sealed = client.post(
        f"/api/v1/shipments/{shipment_id}/batches/seal",
        headers=ADMIN,
        json={"device_id": "ESP32-INTEGRITY", "force": True},
    )
    assert sealed.status_code == 201
    assert sealed.json()["record_count"] == 1
    batches = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"]
    assert len(batches) == 2
    assert batches[0]["batch_id"] == first["batch_id"]
    assert batches[0]["merkle_root"] == first["merkle_root"]

    with app.state.session_factory() as session:
        item = session.scalar(select(IntegrityBatchItem).where(
            IntegrityBatchItem.batch_id == first["batch_id"], IntegrityBatchItem.leaf_index == 0,
        ))
        sample = session.get(Telemetry, item.telemetry_id)
        sample.temperature_c = 6.0
        session.commit()

    failed = client.post(f"/api/v1/batches/{first['batch_id']}/verify", headers=ADMIN)
    assert failed.status_code == 200
    assert failed.json()["verification_status"] == "DATA_INTEGRITY_FAILED"
    assert client.get(f"/api/v1/shipments/{shipment_id}/integrity").json()[
        "verification_status"
    ] == "DATA_INTEGRITY_FAILED"
    client.post(f"/api/v1/batches/{first['batch_id']}/verify", headers=ADMIN)
    with app.state.session_factory() as session:
        alerts = session.scalar(select(func.count()).select_from(ShipmentEvent).where(
            ShipmentEvent.type == "INTEGRITY_MISMATCH",
        ))
        assert alerts == 1

    empty = client.post(
        f"/api/v1/shipments/{shipment_id}/batches/seal",
        headers=ADMIN,
        json={"device_id": "ESP32-INTEGRITY", "force": True},
    )
    assert empty.status_code == 409
    assert empty.json()["error"]["code"] == "NO_ELIGIBLE_TELEMETRY"


def test_global_batches_and_summary_endpoints(integrity_api):
    client, _app, key, shipment_id = integrity_api
    # Before batches exist
    assert client.get("/api/v1/batches").json() == {"items": [], "total": 0}
    empty_summary = client.get("/api/v1/integrity/summary").json()
    assert empty_summary == {
        "shipment_id": None,
        "batch_count": 0,
        "record_count": 0,
        "verification_status": "NOT_CHECKED",
        "anchor_status": "NOT_READY",
    }

    # Ingest signed samples to trigger auto-seal
    telemetry_route = f"/api/v1/shipments/{shipment_id}/telemetry"
    for sequence in (1, 2, 3):
        res = client.post(telemetry_route, json=signed(key, shipment_id, sequence))
        assert res.status_code == 201
        assert res.json()["signature_status"] == "VALID"
        assert res.json()["completeness_status"] == "COMPLETE"

    # Global batches should return the sealed batch
    all_batches = client.get("/api/v1/batches").json()
    assert all_batches["total"] == 1
    batch = all_batches["items"][0]
    assert batch["status"] == "SEALED"
    assert batch["record_count"] == 3
    assert batch["first_sequence"] == 1
    assert batch["last_sequence"] == 3
    assert batch["verification_status"] == "MATCHED"

    global_summary = client.get("/api/v1/integrity/summary").json()
    assert global_summary == {
        "shipment_id": None,
        "batch_count": 1,
        "record_count": 3,
        "verification_status": "MATCHED",
        "anchor_status": "NOT_READY",
    }


def test_admin_auth_and_verify_contract(integrity_api):
    client, _app, key, shipment_id = integrity_api
    # 1. createShipment requires Bearer JWT auth
    no_auth_shipment = client.post("/api/v1/shipments", headers={"Authorization": ""}, json={
        "code": "SHIP-NO-AUTH",
        "cargo_type": "vaccine",
        "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
        "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "insured_amount_vnd": 5000000,
    })
    assert no_auth_shipment.status_code == 401
    assert no_auth_shipment.json()["error"]["code"] == "UNAUTHORIZED"

    # Old X-Admin-Key header does not grant access
    old_key_shipment = client.post(
        "/api/v1/shipments",
        headers={"Authorization": "", "X-Admin-Key": "integrity-test-admin"},
        json={
            "code": "SHIP-OLD-KEY",
            "cargo_type": "vaccine",
            "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
            "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
            "temp_min_c": 2.0,
            "temp_max_c": 8.0,
            "insured_amount_vnd": 5000000,
        },
    )
    assert old_key_shipment.status_code == 401
    assert old_key_shipment.headers.get("www-authenticate") == "Bearer"

    # 2. Ingest signed telemetry & auto-seal batch
    for seq in (1, 2, 3):
        client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=signed(key, shipment_id, seq))
    batch = client.get(f"/api/v1/shipments/{shipment_id}/batches").json()["items"][0]
    batch_id = batch["batch_id"]

    # 3. verifyBatch requires Bearer JWT auth
    no_auth_verify = client.post(f"/api/v1/batches/{batch_id}/verify", headers={"Authorization": ""})
    assert no_auth_verify.status_code == 401
    assert no_auth_verify.json()["error"]["code"] == "UNAUTHORIZED"

    # 4. verifyBatch with valid admin key returns accurate DTO fields
    authed_verify = client.post(f"/api/v1/batches/{batch_id}/verify", headers=ADMIN)
    assert authed_verify.status_code == 200
    data = authed_verify.json()
    assert data["batch_id"] == batch_id
    assert data["verification_status"] == "MATCHED"
    assert data["calculated_root"] == batch["merkle_root"]
    assert data["merkle_root"] == batch["merkle_root"]
    assert data["on_chain_match"] is None  # Not anchored yet, so on_chain_match must be None (not false or true)
    assert data["first_sequence"] == 1
    assert data["last_sequence"] == 3
    assert data["record_count"] == 3


def test_unsigned_telemetry_does_not_display_valid_signature(integrity_api):
    client, _app, _key, shipment_id = integrity_api
    # Post legacy/unsigned telemetry
    res = client.post(
        f"/api/v1/shipments/{shipment_id}/telemetry",
        json={"device_id": "ESP32-INTEGRITY", "temperature_c": 4.5, "humidity_pct": 60.0},
    )
    assert res.status_code == 201
    # Unsigned telemetry should NOT have signature_status = "VALID"
    telemetry_data = res.json()
    assert telemetry_data.get("signature_status") is None
    assert telemetry_data.get("completeness_status") is None

    # Inspect shipment detail
    shipment_detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
    latest = shipment_detail["latest_telemetry"]
    assert latest is not None
    assert latest.get("signature_status") is None
    assert latest.get("completeness_status") is None

