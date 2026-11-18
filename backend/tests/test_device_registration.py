"""Only fixed devices can be assigned; HTTP creation, deletion and new keys are disabled."""

from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import Device, DeviceAssignment
from app.services.device_provisioning import load_device_keys
from test_device_provisioning import local_api
from test_signed_ingestion import SHIPMENT, signed


@pytest.mark.parametrize("method,path,body", [
    ("POST", "/api/v1/devices", {"device_id": "ESP32-11", "device_name": "Extra"}),
    ("POST", "/api/v1/devices", {"device_id": "ESP32-01", "device_name": "Existing"}),
    ("POST", "/api/v1/devices/ESP32-01/keys", {"key_id": "new", "public_key_pem": "anything"}),
    ("DELETE", "/api/v1/devices/ESP32-01", None),
])
def test_fixed_registry_rejects_writes_and_requires_auth(local_api, method, path, body):
    client, app, _ = local_api
    response = client.request(method, path, json=body)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FIXED_DEVICE_REGISTRY"
    assert client.request(method, path, json=body, headers={"Authorization": ""}).status_code == 401
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(Device.id))) == 10


def assign(client, device_id, shipment_id, active=True):
    return client.post(f"/api/v1/devices/{device_id}/assignments", json={"shipment_id": shipment_id, "active": active})


def test_assign_unassign_transfer_preserves_sequence_and_history(local_api):
    client, app, path = local_api
    first = client.post("/api/v1/shipments", json=SHIPMENT).json()["shipment_id"]
    second = client.post("/api/v1/shipments", json=SHIPMENT).json()["shipment_id"]
    key = load_device_keys(path)["ESP32-01"]
    assert client.post(f"/api/v1/shipments/{first}/telemetry", json=signed(key, first, 1)).status_code == 403
    assert assign(client, "ESP32-01", first).status_code == 200
    assert assign(client, "ESP32-01", first).status_code == 200
    assert assign(client, "ESP32-02", first).status_code == 200
    assert assign(client, "ESP32-01", second).json()["error"]["code"] == "DEVICE_ALREADY_ASSIGNED"
    assert client.post(f"/api/v1/shipments/{first}/telemetry", json=signed(key, first, 1)).status_code == 201
    assert assign(client, "ESP32-01", first, False).json()["current_shipment_id"] is None
    assert assign(client, "ESP32-01", first, False).status_code == 200
    assert assign(client, "ESP32-01", second).status_code == 200
    assert client.post(f"/api/v1/shipments/{first}/telemetry", json=signed(key, first, 2)).status_code == 403
    assert client.post(f"/api/v1/shipments/{second}/telemetry", json=signed(key, second, 1)).status_code == 409
    assert client.post(f"/api/v1/shipments/{second}/telemetry", json=signed(key, second, 2)).status_code == 201
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-01").last_sequence_number == 2
        assert session.scalar(select(func.count(DeviceAssignment.device_id))) == 3
        session.get(DeviceAssignment, ("ESP32-01", first)).active = True
        with pytest.raises(IntegrityError):
            session.commit()


def test_unknown_device_uuid_and_revoked_assignment(local_api):
    client, _, _ = local_api
    assert client.get("/api/v1/devices/ESP32-11").status_code == 404
    assert assign(client, "ESP32-11", str(uuid4())).status_code == 404
    assert assign(client, "ESP32-01", str(uuid4())).status_code == 404
    assert assign(client, "ESP32-01", "Vaccine shipment").status_code == 422
    shipment_id = client.post("/api/v1/shipments", json=SHIPMENT).json()["shipment_id"]
    assert client.patch("/api/v1/devices/ESP32-01", json={"status": "revoked"}).status_code == 200
    assert assign(client, "ESP32-01", shipment_id).json()["error"]["code"] == "DEVICE_NOT_ACTIVE"


def test_legacy_devices_are_retained_but_not_available_for_new_use(local_api):
    client, app, _ = local_api
    with app.state.session_factory() as session:
        session.add(Device(id="OLD-DEVICE", device_name="Historical device", status="active", last_sequence_number=20))
        session.commit()
    assert client.get("/api/v1/devices").json()["total"] == 10
    assert client.get("/api/v1/devices/OLD-DEVICE").status_code == 404
    with app.state.session_factory() as session:
        assert session.get(Device, "OLD-DEVICE").last_sequence_number == 20
