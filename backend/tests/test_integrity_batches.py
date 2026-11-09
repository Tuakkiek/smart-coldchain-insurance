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


ADMIN = {"X-Admin-Key": "integrity-test-admin"}
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
        admin_api_key=ADMIN["X-Admin-Key"],
        integrity_batch_max_records=3,
        integrity_batch_max_age_minutes=5,
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 9, 12, tzinfo=timezone.utc))
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    with TestClient(app) as client:
        shipment_id = client.post("/api/v1/shipments", json=SHIPMENT).json()["id"]
        registered = client.post("/api/v1/devices", headers=ADMIN, json={
            "device_id": "ESP32-INTEGRITY",
            "key_id": "key-v1",
            "public_key_pem": pem,
            "shipment_id": shipment_id,
        })
        assert registered.status_code == 201
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
    assert batch["verification_status"] == "NOT_CHECKED"
    assert batch["anchor_status"] == "NOT_READY"

    detail = client.get(f"/api/v1/batches/{batch['batch_id']}")
    assert detail.status_code == 200
    assert detail.json() == batch
    summary = client.get(f"/api/v1/shipments/{shipment_id}/integrity").json()
    assert summary == {
        "shipment_id": shipment_id,
        "batch_count": 1,
        "record_count": 3,
        "verification_status": "NOT_CHECKED",
        "anchor_status": "NOT_READY",
    }

    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(IntegrityBatchItem)) == 3
        outbox = session.scalar(select(IntegrationOutbox))
        assert outbox.kind == "ANCHOR_BATCH"
        assert outbox.status == "PENDING"
        assert outbox.idempotency_key == f"anchor:{batch['batch_id']}"
        assert outbox.payload["merkle_root"] == batch["merkle_root"]

    verified = client.post(f"/api/v1/batches/{batch['batch_id']}/verify")
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

    failed = client.post(f"/api/v1/batches/{first['batch_id']}/verify")
    assert failed.status_code == 200
    assert failed.json()["verification_status"] == "DATA_INTEGRITY_FAILED"
    assert client.get(f"/api/v1/shipments/{shipment_id}/integrity").json()[
        "verification_status"
    ] == "DATA_INTEGRITY_FAILED"
    client.post(f"/api/v1/batches/{first['batch_id']}/verify")
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
