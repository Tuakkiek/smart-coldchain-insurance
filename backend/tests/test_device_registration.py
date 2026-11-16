"""Admin registration is independent of assignment, keys and signed ingestion."""

from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Device, DeviceAssignment, DeviceKey, IntegrityBatch, SignedTelemetryReceipt, Telemetry
from test_signed_ingestion import ADMIN, SHIPMENT, signed


@pytest.fixture
def registry_api(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'registry.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        integrity_batch_max_records=1,
        cors_origins=("http://localhost:5173",),
    ))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        yield client, app
    app.state.engine.dispose()


def register(client, device_id="ESP32-001"):
    response = client.post("/api/v1/devices", headers=ADMIN, json={
        "device_id": device_id, "device_name": "  Cold Chain Sensor 01  ",
    })
    assert response.status_code == 201, response.text
    return response.json()


def shipment(client, code="SHIP-001"):
    response = client.post("/api/v1/shipments", headers=ADMIN, json=SHIPMENT | {"code": code})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def assign(client, device_id, shipment_id, active=True):
    return client.post(f"/api/v1/devices/{device_id}/assignments", headers=ADMIN,
                       json={"shipment_id": shipment_id, "active": active})


def provision(client, device_id="ESP32-001"):
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    response = client.post(f"/api/v1/devices/{device_id}/keys", headers=ADMIN,
                           json={"key_id": "key-v1", "public_key_pem": pem})
    assert response.status_code == 201, response.text
    assert response.json()["has_public_key"] is True
    assert pem not in response.text
    return key


def test_register_before_shipments_or_keys_and_reject_legacy_combined_body(registry_api):
    client, app = registry_api
    assert client.get("/api/v1/devices", headers=ADMIN).json() == {"items": [], "total": 0}
    device = register(client)
    assert device == {
        "device_id": "ESP32-001", "device_name": "Cold Chain Sensor 01", "status": "active",
        "has_public_key": False, "current_shipment_id": None,
        "last_sequence_number": 0, "last_seen_at": None, "keys": [], "assignments": [],
    }
    assert client.get("/api/v1/devices", headers=ADMIN).json() == {"items": [device], "total": 1}
    assert client.get("/api/v1/devices/ESP32-001", headers=ADMIN).json() == device
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 0
        assert session.scalar(select(func.count(DeviceAssignment.device_id))) == 0
    duplicate = client.post("/api/v1/devices", headers=ADMIN, json={
        "device_id": "ESP32-001", "device_name": "Different name",
    })
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DEVICE_EXISTS"
    legacy = client.post("/api/v1/devices", headers=ADMIN, json={
        "device_id": "LEGACY", "device_name": "Legacy", "key_id": "key-v1",
        "shipment_id": str(uuid4()), "public_key_pem": "not-accepted-in-registration",
    })
    assert legacy.status_code == 422


@pytest.mark.parametrize("body", [
    {"device_id": "has space", "device_name": "Sensor"},
    {"device_id": "bad\n", "device_name": "Sensor"},
    {"device_id": "", "device_name": "Sensor"},
    {"device_id": "A" * 101, "device_name": "Sensor"},
    {"device_id": "ESP32-001", "device_name": "   "},
    {"device_id": "ESP32-001", "device_name": "N" * 101},
    {"device_id": "ESP32-001", "device_name": 123},
    {"device_id": "ESP32-001"},
])
def test_registration_validates_identity_and_name(registry_api, body):
    client, _ = registry_api
    assert client.post("/api/v1/devices", headers=ADMIN, json=body).status_code == 422


@pytest.mark.parametrize("method,path,body", [
    ("POST", "/api/v1/devices", {"device_id": "A", "device_name": "Sensor"}),
    ("GET", "/api/v1/devices", None),
    ("GET", "/api/v1/devices/A", None),
    ("POST", "/api/v1/shipments", SHIPMENT),
    ("POST", "/api/v1/devices/A/keys", {"key_id": "v1", "public_key_pem": "invalid"}),
    ("POST", "/api/v1/devices/A/assignments", {"shipment_id": str(uuid4()), "active": True}),
    ("POST", f"/api/v1/batches/{uuid4()}/verify", None),
])
def test_admin_routes_require_auth_even_for_unknown_resources(registry_api, method, path, body):
    client, _ = registry_api
    for headers in ({}, {"X-Admin-Key": "wrong"}, {"Authorization": "Bearer invalid.token"}):
        response = client.request(method, path, json=body, headers=headers)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"
        assert response.headers.get("www-authenticate") == "Bearer"
        assert "x-request-id" in response.headers


def test_ingestion_requires_assignment_then_public_key_and_accepts_signed_sample(registry_api):
    client, app = registry_api
    register(client)
    shipment_id = shipment(client)
    key = ec.generate_private_key(ec.SECP256R1())
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    missing_assignment = client.post(route, json=signed(key, shipment_id, 1))
    assert missing_assignment.json()["error"]["code"] == "DEVICE_NOT_ASSIGNED"
    assigned = assign(client, "ESP32-001", shipment_id)
    assert assigned.status_code == 200
    assert assigned.json()["has_public_key"] is False
    assert assigned.json()["current_shipment_id"] == shipment_id
    assert client.post(route, json=signed(key, shipment_id, 1)).json()["error"]["code"] == "UNKNOWN_KEY"
    key = provision(client)
    payload = signed(key, shipment_id, 1)
    accepted = client.post(route, json=payload)
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["signature_status"] == "VALID"
    assert client.post(route, json=payload).json()["duplicate"] is True
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(Telemetry.id))) == 1
        assert session.scalar(select(func.count(SignedTelemetryReceipt.telemetry_id))) == 1
        assert session.scalar(select(func.count(IntegrityBatch.id))) == 1
    assert client.get(f"/api/v1/shipments/{shipment_id}", headers=ADMIN).json()["insurance"]["payout_status"] == "not_requested"
    assert client.patch("/api/v1/devices/ESP32-001/keys/key-v1", headers=ADMIN,
                        json={"status": "revoked"}).json()["has_public_key"] is False
    assert client.post(route, json=signed(key, shipment_id, 2)).json()["error"]["code"] == "UNKNOWN_KEY"


def test_assignment_idempotency_multiple_devices_and_transfer_preserve_history(registry_api):
    client, app = registry_api
    register(client)
    register(client, "ESP32-002")
    first, second = shipment(client), shipment(client, "SHIP-002")
    key = provision(client)
    assert assign(client, "ESP32-001", first).status_code == 200
    assert assign(client, "ESP32-001", first).status_code == 200
    assert assign(client, "ESP32-002", first).status_code == 200
    assert len(client.get(f"/api/v1/shipments/{first}/devices", headers=ADMIN).json()["items"]) == 2
    conflict = assign(client, "ESP32-001", second)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "DEVICE_ALREADY_ASSIGNED"
    old_sample = signed(key, first, 1)
    assert client.post(f"/api/v1/shipments/{first}/telemetry", json=old_sample).status_code == 201
    old_batches = client.get(f"/api/v1/shipments/{first}/batches", headers=ADMIN).json()
    assert assign(client, "ESP32-001", first, False).json()["current_shipment_id"] is None
    assert assign(client, "ESP32-001", second).json()["current_shipment_id"] == second
    assert client.post(f"/api/v1/shipments/{first}/telemetry", json=old_sample).status_code == 403
    stale = client.post(f"/api/v1/shipments/{second}/telemetry", json=signed(key, second, 1))
    assert stale.status_code == 409
    assert client.post(f"/api/v1/shipments/{second}/telemetry", json=signed(key, second, 2)).status_code == 201
    assert client.get(f"/api/v1/shipments/{first}/batches", headers=ADMIN).json() == old_batches
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-001").last_sequence_number == 2
        assert session.scalar(select(func.count(DeviceAssignment.device_id))) == 3
        # The database guard also prevents bypassing the service.
        session.get(DeviceAssignment, ("ESP32-001", first)).active = True
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_key_endpoint_rejects_private_wrong_curve_and_duplicate_keys(registry_api):
    client, app = registry_api
    register(client)
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()).decode("ascii")
    wrong_curve = ec.generate_private_key(ec.SECP384R1()).public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    for pem in (private_pem, wrong_curve, "not-a-key"):
        response = client.post("/api/v1/devices/ESP32-001/keys", headers=ADMIN,
                               json={"key_id": "key-v1", "public_key_pem": pem})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_PUBLIC_KEY"
        assert pem not in response.text
    provision(client)
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    duplicate = client.post("/api/v1/devices/ESP32-001/keys", headers=ADMIN,
                           json={"key_id": "key-v1", "public_key_pem": public_pem})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "KEY_EXISTS"
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 1


def test_missing_resources_uuid_and_revoked_device_assignment(registry_api):
    client, _ = registry_api
    assert assign(client, "MISSING", str(uuid4())).status_code == 404
    assert client.post("/api/v1/devices/MISSING/keys", headers=ADMIN,
                       json={"key_id": "key-v1", "public_key_pem": "missing"}).status_code == 404
    register(client)
    assert assign(client, "ESP32-001", str(uuid4())).json()["error"]["code"] == "SHIPMENT_NOT_FOUND"
    assert assign(client, "ESP32-001", "SHIP-001").status_code == 422
    shipment_id = shipment(client)
    assert client.post("/api/v1/shipments", headers=ADMIN,
                       json=SHIPMENT | {"code": "SHIP-001"}).json()["error"]["code"] == "DUPLICATE_SHIPMENT_CODE"
    client.patch("/api/v1/devices/ESP32-001", headers=ADMIN, json={"status": "revoked"})
    assert assign(client, "ESP32-001", shipment_id).json()["error"]["code"] == "DEVICE_NOT_ACTIVE"


def test_openapi_and_browser_admin_header_match_the_new_contract(registry_api):
    client, _ = registry_api
    schema = client.get("/openapi.json").json()
    register_schema = schema["components"]["schemas"]["DeviceRegister"]
    assert set(register_schema["required"]) == {"device_id", "device_name"}
    assert set(register_schema["properties"]) == {"device_id", "device_name"}
    assert register_schema["additionalProperties"] is False
    assert "public_key_pem" not in schema["components"]["schemas"]["DeviceOut"]["properties"]
    assert "/api/v1/devices" in schema["paths"]
    preflight = client.options("/api/v1/devices", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
    })
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"
    listing = client.get("/api/v1/devices", headers=ADMIN | {"Origin": "http://localhost:5173"})
    assert "x-request-id" in listing.headers["access-control-expose-headers"].lower()


def test_unconfigured_admin_api_fails_closed():
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(database_url="sqlite://", admin_username="admin", admin_password="valid-test-password-12345", jwt_secret_key="")
    # Bootstrap credentials may be removed once the single Admin is in MySQL.
    # Empty-database login still fails closed (test_admin_accounts.py).
    settings = Settings(database_url="sqlite://", admin_username="", admin_password="", jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!")
    assert settings.admin_username == settings.admin_password == ""
