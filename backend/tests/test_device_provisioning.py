"""Fixed device keys persist locally and never enter HTTP responses or MySQL."""

import json
from dataclasses import replace
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Device, DeviceKey
from app.services.device_provisioning import (
    FirmwareConfigWriter, ProvisioningError, initialize_fixed_devices, load_device_keys,
)
from app.services.device_registry import DEFAULT_KEY_ID, DEVICE_IDS
from test_signed_ingestion import ADMIN, SHIPMENT, signed


@pytest.fixture
def local_api(tmp_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'devices.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        device_provisioning_mode="local",
        device_keys_path=tmp_path / ".local/esp32-private-keys.txt",
    ))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers=ADMIN) as client:
        yield client, app, app.state.settings.device_keys_path
    app.state.engine.dispose()


def public_pem(key):
    return key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")


def test_startup_creates_exactly_ten_matching_keys_without_exposing_private_material(local_api):
    client, app, path = local_api
    keys = load_device_keys(path)
    response = client.get("/api/v1/devices")
    assert response.status_code == 200
    assert response.json()["total"] == 10
    assert [item["device_id"] for item in response.json()["items"]] == list(DEVICE_IDS)
    assert len({public_pem(key) for key in keys.values()}) == 10
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(Device.id))) == 10
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 10
        for device_id in DEVICE_IDS:
            stored = session.get(DeviceKey, (device_id, DEFAULT_KEY_ID))
            assert stored.public_key_pem == public_pem(keys[device_id])
            assert "PRIVATE KEY" not in stored.public_key_pem
            detail = client.get(f"/api/v1/devices/{device_id}")
            assert detail.json()["has_public_key"] is True
            assert "PRIVATE KEY" not in detail.text
            assert "PUBLIC KEY" not in detail.text
    assert "PRIVATE KEY" not in response.text


def test_restart_reuses_file_and_preserves_revocation_assignments_and_sequence(local_api, monkeypatch):
    client, app, path = local_api
    shipment_id = client.post("/api/v1/shipments", json=SHIPMENT).json()["shipment_id"]
    client.post("/api/v1/devices/ESP32-01/assignments", json={"shipment_id": shipment_id, "active": True})
    key = load_device_keys(path)["ESP32-01"]
    accepted = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=signed(key, shipment_id, 1))
    assert accepted.status_code == 201, accepted.text
    client.patch("/api/v1/devices/ESP32-01/keys/key-v1", json={"status": "revoked"})
    before, modified = path.read_bytes(), path.stat().st_mtime_ns
    monkeypatch.setattr(ec, "generate_private_key", lambda *_: pytest.fail("Restart regenerated a key"))
    with TestClient(app, headers=ADMIN) as restarted:
        detail = restarted.get("/api/v1/devices/ESP32-01").json()
        assert detail["current_shipment_id"] == shipment_id
        assert detail["last_sequence_number"] == 1
        assert detail["has_public_key"] is False
    assert path.read_bytes() == before
    assert path.stat().st_mtime_ns == modified


@pytest.mark.parametrize("damage", ["missing", "invalid_json", "missing_device", "duplicate_key", "wrong_curve"])
def test_missing_or_invalid_file_never_rotates_existing_keys(local_api, damage):
    _, app, path = local_api
    data = json.loads(path.read_text())
    if damage == "missing":
        path.unlink()
    elif damage == "invalid_json":
        path.write_text("invalid file")
    else:
        if damage == "missing_device":
            del data["devices"]["ESP32-10"]
        elif damage == "duplicate_key":
            data["devices"]["ESP32-10"] = data["devices"]["ESP32-01"]
        else:
            data["devices"]["ESP32-10"] = ec.generate_private_key(ec.SECP384R1()).private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ).decode("ascii")
        path.write_text(json.dumps(data))
    with app.state.session_factory() as session:
        before = list(session.scalars(select(DeviceKey.public_key_pem).order_by(DeviceKey.device_id)))
        with pytest.raises(ProvisioningError) as error:
            initialize_fixed_devices(session, path)
        assert error.value.code == ("DEVICE_KEYS_MISSING" if damage == "missing" else "DEVICE_KEYS_INVALID")
        assert list(session.scalars(select(DeviceKey.public_key_pem).order_by(DeviceKey.device_id))) == before


def test_key_mismatch_fails_without_overwriting_database(local_api):
    _, app, path = local_api
    data = json.loads(path.read_text())
    data["devices"]["ESP32-01"], data["devices"]["ESP32-02"] = data["devices"]["ESP32-02"], data["devices"]["ESP32-01"]
    path.write_text(json.dumps(data))
    with app.state.session_factory() as session:
        before = session.get(DeviceKey, ("ESP32-01", DEFAULT_KEY_ID)).public_key_pem
        with pytest.raises(ProvisioningError, match="does not match"):
            initialize_fixed_devices(session, path)
        assert session.get(DeviceKey, ("ESP32-01", DEFAULT_KEY_ID)).public_key_pem == before


def test_database_failure_keeps_file_for_retry(local_api, tmp_path, monkeypatch):
    _, app, _ = local_api
    # Use a fresh database, so this exercises first-time file generation.
    Base.metadata.drop_all(app.state.engine)
    Base.metadata.create_all(app.state.engine)
    path = tmp_path / "new-local/keys.txt"
    with app.state.session_factory() as session:
        with monkeypatch.context() as patch:
            patch.setattr(session, "commit", lambda: (_ for _ in ()).throw(OperationalError("commit", {}, Exception())))
            with pytest.raises(OperationalError):
                initialize_fixed_devices(session, path)
        before = path.read_bytes()
        assert session.scalar(select(func.count(Device.id))) == 0
        initialize_fixed_devices(session, path)
        assert path.read_bytes() == before
        assert session.scalar(select(func.count(Device.id))) == 10


def test_firmware_configuration_uses_existing_key_and_shipment(local_api, tmp_path):
    _, _, key_path = local_api
    path = tmp_path / "config.h"
    template = Path(__file__).resolve().parents[2] / "device/cold_chain_device/config.example.h"
    path.write_bytes(template.read_bytes())
    key = load_device_keys(key_path)["ESP32-03"]
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                            serialization.NoEncryption()).decode("ascii")
    shipment_id = "11111111-1111-4111-8111-111111111111"
    FirmwareConfigWriter(path).update("ESP32-03", DEFAULT_KEY_ID, pem, shipment_id=shipment_id)
    content = path.read_text()
    assert '#define DEVICE_ID "ESP32-03"' in content
    assert f'#define SHIPMENT_ID "{shipment_id}"' in content
    assert pem.strip() in content
    assert content.count("DEVICE_PRIVATE_KEY_PEM[]") == 1
    assert "#define WIFI_SSID" in content
    assert '#define API_BASE_URL "https://YOUR-SERVICE.onrender.com"' in content


def test_production_cannot_generate_private_keys(local_api):
    _, app, _ = local_api
    with pytest.raises(ValueError, match="production"):
        replace(app.state.settings, app_env="production", refresh_cookie_secure=True)
