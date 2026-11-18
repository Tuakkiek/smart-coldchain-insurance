"""Signed ingest uses a real ephemeral key and the public API boundary."""

import base64
from httpx import Response
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Device, IngestionAudit, SignedTelemetryReceipt, Telemetry
from app.services.clock import VirtualClock
from app.services.telemetry_protocol import canonical_signed_bytes
from app.services import signed_ingestion


SHIPMENT = {
    "name": "SIGNED-TEST", "cargo_type": "vaccine",
    "origin": {"name": "A", "latitude": 10.0, "longitude": 105.0},
    "destination": {"name": "B", "latitude": 11.0, "longitude": 106.0},
    "temp_min_c": 2.0, "temp_max_c": 8.0,
    "violation_duration_minutes": 15, "insured_amount_vnd": 10000000,
}
from app.services.auth import create_access_token

ADMIN_TOKEN = create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture
def setup_api(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'signed.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
    ))
    Base.metadata.create_all(app.state.engine)
    app.state.clock = VirtualClock(datetime(2026, 11, 5, 12, tzinfo=timezone.utc))
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    with TestClient(app, headers=ADMIN) as client:
        shipment_id = client.post("/api/v1/shipments", json=SHIPMENT).json()["id"]
        yield client, app, key, pem, shipment_id
    app.state.engine.dispose()


def register(client, pem, shipment_id, device_id="ESP32-01", key_id="key-v1"):
    """Fixture setup through services: HTTP device/key creation is disabled."""
    with client.app.state.session_factory() as session:
        try:
            signed_ingestion.register_device(session, device_id, "Test sensor")
            signed_ingestion.set_assignment(session, device_id, shipment_id, True)
            signed_ingestion.add_key(session, device_id, key_id, pem)
            return Response(201, json=signed_ingestion.device_view(session, session.get(Device, device_id)))
        except signed_ingestion.IngestionError as exc:
            return Response(exc.status_code, json={"error": {"code": exc.code}})


def signed(key, shipment_id, sequence, *, temperature=5.0, device_id="ESP32-01", key_id="key-v1"):
    payload = {
        "payload_version": 1, "shipment_id": shipment_id, "device_id": device_id,
        "key_id": key_id, "sequence_number": sequence,
        "temperature_c": temperature, "humidity_pct": 80.0,
        "temperature_milli_c": round(temperature * 1000), "humidity_milli_pct": 80000,
        "recorded_at": "2026-11-05T12:00:00Z", "firmware_version": "1.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


def signed_v2(key, sequence, *, temperature=5.0, device_id="ESP32-01", key_id="key-v1"):
    payload = {
        "payload_version": 2, "device_id": device_id,
        "key_id": key_id, "sequence_number": sequence,
        "temperature_c": temperature, "humidity_pct": 80.0,
        "temperature_milli_c": round(temperature * 1000), "humidity_milli_pct": 80000,
        "recorded_at": "2026-11-05T12:00:00Z", "firmware_version": "2.0.0",
    }
    payload["signature"] = base64.b64encode(
        key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")
    return payload


def test_v2_backend_resolves_current_assignment_without_shipment_in_device_payload(setup_api):
    client, app, key, pem, first_shipment_id = setup_api
    assert register(client, pem, first_shipment_id).status_code == 201
    route = "/api/v1/devices/ESP32-01/telemetry"

    first_payload = signed_v2(key, 1)
    assert "shipment_id" not in first_payload
    first = client.post(route, headers={"Authorization": ""}, json=first_payload)
    assert first.status_code == 201, first.text
    assert first.json()["shipment_id"] == first_shipment_id

    second_shipment_id = client.post("/api/v1/shipments", json={
        **SHIPMENT, "name": "SIGNED-TEST-SECOND",
    }).json()["id"]
    assert client.post("/api/v1/devices/ESP32-01/assignments", json={
        "shipment_id": first_shipment_id, "active": False,
    }).status_code == 200
    assert client.post("/api/v1/devices/ESP32-01/assignments", json={
        "shipment_id": second_shipment_id, "active": True,
    }).status_code == 200

    second = client.post(route, headers={"Authorization": ""}, json=signed_v2(key, 2))
    assert second.status_code == 201, second.text
    assert second.json()["shipment_id"] == second_shipment_id
    assert len(client.get(f"/api/v1/shipments/{first_shipment_id}/telemetry").json()["items"]) == 1
    assert len(client.get(f"/api/v1/shipments/{second_shipment_id}/telemetry").json()["items"]) == 1

    assert client.post("/api/v1/devices/ESP32-01/assignments", json={
        "shipment_id": second_shipment_id, "active": False,
    }).status_code == 200
    unassigned = client.post(route, headers={"Authorization": ""}, json=signed_v2(key, 3))
    assert unassigned.status_code == 403
    assert unassigned.json()["error"]["code"] == "DEVICE_NOT_ASSIGNED"

    with app.state.session_factory() as session:
        receipts = list(session.scalars(
            select(SignedTelemetryReceipt).order_by(SignedTelemetryReceipt.sequence_number)
        ))
        assert [(item.payload_version, item.shipment_id) for item in receipts] == [
            (2, first_shipment_id), (2, second_shipment_id),
        ]


def test_v2_device_endpoint_rejects_wrong_identity_and_invalid_signature(setup_api):
    client, _app, key, pem, shipment_id = setup_api
    assert register(client, pem, shipment_id).status_code == 201
    wrong_path = client.post(
        "/api/v1/devices/ESP32-02/telemetry",
        headers={"Authorization": ""},
        json=signed_v2(key, 1),
    )
    assert wrong_path.status_code == 422
    assert wrong_path.json()["error"]["code"] == "DEVICE_MISMATCH"

    tampered = signed_v2(key, 1)
    tampered["temperature_c"] = 6.0
    tampered["temperature_milli_c"] = 6000
    invalid = client.post(
        "/api/v1/devices/ESP32-01/telemetry",
        headers={"Authorization": ""},
        json=tampered,
    )
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "INVALID_SIGNATURE"

    old_route = client.post(
        f"/api/v1/shipments/{shipment_id}/telemetry",
        headers={"Authorization": ""},
        json=signed_v2(key, 1),
    )
    assert old_route.status_code == 422
    assert old_route.json()["error"]["code"] == "DEVICE_ENDPOINT_REQUIRED"


def test_registration_auth_and_signed_retry_conflict_gap(setup_api):
    client, app, key, pem, shipment_id = setup_api
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    assert client.post("/api/v1/devices", headers={"Authorization": ""}, json={}).status_code == 401
    assert register(client, pem, shipment_id).status_code == 201
    initial_health = client.get(f"/api/v1/shipments/{shipment_id}/devices").json()["items"]
    assert initial_health[0]["telemetry_status"] == "UNKNOWN"
    assert register(client, pem, shipment_id).status_code == 409
    first = signed(key, shipment_id, 1)
    response = client.post(route, json=first)
    assert response.status_code == 201, response.text
    assert response.json()["signature_status"] == "VALID"
    assert response.json()["completeness_status"] == "COMPLETE"
    assert response.json()["duplicate"] is False
    assert len(response.headers["x-request-id"]) == 32
    assert client.get(f"/api/v1/shipments/{shipment_id}/devices").json()["items"][0]["telemetry_status"] == "ONLINE"
    again = client.post(route, json=first)
    assert again.status_code == 200
    assert again.json()["id"] == response.json()["id"]
    assert again.json()["duplicate"] is True
    app.state.clock.current += timedelta(minutes=6)
    assert client.get(f"/api/v1/shipments/{shipment_id}/devices").json()["items"][0]["telemetry_status"] == "OFFLINE"
    assert client.post(route, json=first).status_code == 200
    assert client.get(f"/api/v1/shipments/{shipment_id}/devices").json()["items"][0]["telemetry_status"] == "OFFLINE"
    history = client.get(route).json()["items"]
    assert history[0]["signature_status"] == "VALID"
    assert history[0]["sequence_number"] == 1

    conflict = client.post(route, json=signed(key, shipment_id, 1, temperature=6.0))
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "SEQUENCE_CONFLICT"
    gap = client.post(route, json=signed(key, shipment_id, 3))
    assert gap.status_code == 201, gap.text
    assert gap.json()["missing_sequences"] == {"from": 2, "to": 2}
    assert gap.json()["completeness_status"] == "DATA_INCOMPLETE"
    stale = client.post(route, json=signed(key, shipment_id, 2))
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "SEQUENCE_REPLAY"
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(Telemetry.id))) == 2
        assert session.scalar(select(func.count(SignedTelemetryReceipt.telemetry_id))) == 2
        assert session.scalar(select(func.count(IngestionAudit.id))) == 2
        device = session.get(Device, "ESP32-01")
        assert device.last_sequence_number == 3
        assert device.last_seen_at is not None
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert any(event["type"] == "SENSOR_DATA_GAP" and event["details"].get("missing_from") == 2
               for event in events)


def test_invalid_unknown_revoked_and_unassigned_are_audited(setup_api):
    client, app, key, pem, shipment_id = setup_api
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    unknown = client.post(route, json=signed(key, shipment_id, 1))
    assert unknown.status_code == 403
    assert register(client, pem, shipment_id).status_code == 201
    changed = signed(key, shipment_id, 1)
    changed["temperature_c"] = 6.0
    changed["temperature_milli_c"] = 6000
    invalid = client.post(route, json=changed)
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "INVALID_SIGNATURE"
    assert client.patch("/api/v1/devices/ESP32-01/keys/key-v1", headers=ADMIN,
                        json={"status": "revoked"}).status_code == 200
    revoked = client.post(route, json=signed(key, shipment_id, 1))
    assert revoked.json()["error"]["code"] == "UNKNOWN_KEY"
    assert client.patch("/api/v1/devices/ESP32-01/keys/key-v1", headers=ADMIN,
                        json={"status": "active"}).status_code == 200
    assert client.post("/api/v1/devices/ESP32-01/assignments", headers=ADMIN,
                       json={"shipment_id": shipment_id, "active": False}).status_code == 200
    assert client.post(route, json=signed(key, shipment_id, 1)).json()["error"]["code"] == "DEVICE_NOT_ASSIGNED"
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(Telemetry.id))) == 0
        assert session.scalar(select(func.count(IngestionAudit.id))) == 4


def test_sequence_gap_breaks_breach_and_never_dispatches_payout(setup_api):
    client, app, key, pem, shipment_id = setup_api
    register(client, pem, shipment_id)
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    app.state.clock.current = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)
    assert client.post(route, json=signed(key, shipment_id, 1, temperature=9.2)).status_code == 201
    app.state.clock.current += timedelta(minutes=15)
    assert client.post(route, json=signed(key, shipment_id, 3, temperature=9.2)).status_code == 201
    events = client.get(f"/api/v1/shipments/{shipment_id}/events", headers=ADMIN).json()["items"]
    assert not any(event["type"] == "INSURANCE_TRIGGERED" for event in events)
    assert client.get(f"/api/v1/shipments/{shipment_id}", headers=ADMIN).json()["insurance"]["payout_status"] == "not_requested"


def test_production_requires_signed_payload(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'prod.db').as_posix()}",
        app_env="production",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        cors_origins=("https://coldchain.example.com",),
    ))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        shipment_id = client.post("/api/v1/shipments", headers=ADMIN, json=SHIPMENT).json()["id"]
        response = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json={
            "device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 80.0,
        })
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "SIGNED_TELEMETRY_REQUIRED"
    app.state.engine.dispose()


def test_fixed_keys_cannot_be_added_and_revocation_and_body_limit_work(setup_api):
    client, _app, key, pem, shipment_id = setup_api
    assert register(client, pem, shipment_id).status_code == 201
    replacement = ec.generate_private_key(ec.SECP256R1())
    replacement_pem = replacement.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    added = client.post("/api/v1/devices/ESP32-01/keys", headers=ADMIN,
                        json={"key_id": "key-v2", "public_key_pem": replacement_pem})
    assert added.status_code == 403
    assert added.json()["error"]["code"] == "FIXED_DEVICE_REGISTRY"
    assert client.patch("/api/v1/devices/ESP32-01/keys/key-v1", headers=ADMIN,
                        json={"status": "revoked"}).status_code == 200
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    assert client.post(route, json=signed(key, shipment_id, 1)).status_code == 401
    assert client.post(route, json=signed(replacement, shipment_id, 1, key_id="key-v2")).status_code == 401
    assert client.patch("/api/v1/devices/ESP32-01/keys/key-v1", headers=ADMIN,
                        json={"status": "active"}).status_code == 200
    assert client.post(route, json=signed(key, shipment_id, 1)).status_code == 201
    oversized = client.post(route, content=b"{" + b" " * 9000 + b"}",
                            headers={"Content-Type": "application/json"})
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "BODY_TOO_LARGE"


def test_persisted_device_rate_limit_allows_retry(setup_api):
    client, app, key, pem, shipment_id = setup_api
    app.state.settings = replace(app.state.settings, signed_rate_limit_per_minute=1)
    register(client, pem, shipment_id)
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    first = signed(key, shipment_id, 1)
    assert client.post(route, json=first).status_code == 201
    assert client.post(route, json=first).status_code == 200
    limited = client.post(route, json=signed(key, shipment_id, 2))
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "RATE_LIMITED"
    app.state.clock.current += timedelta(minutes=1)
    assert client.post(route, json=signed(key, shipment_id, 2)).status_code == 201
