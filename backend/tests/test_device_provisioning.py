"""Local key provisioning keeps private material out of MySQL and HTTP."""

from __future__ import annotations

import base64
import re
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import Device, DeviceKey
from app.services.telemetry_protocol import canonical_signed_bytes, verify_signature
from test_signed_ingestion import ADMIN


CONFIG_TEMPLATE = """#pragma once
#define API_BASE_URL "https://api.example.test"
#define WIFI_SSID "demo-wifi"
#define WIFI_PASSWORD "keep-this-value"
#define SHIPMENT_ID "11111111-1111-4111-8111-111111111111"
#define DEVICE_ID "YOUR_DEVICE_ID"
#define KEY_ID "YOUR_KEY_ID"

static const char DEVICE_PRIVATE_KEY_PEM[] = R"PEM(-----BEGIN EC PRIVATE KEY-----
GENERATED_BY_LOCAL_BACKEND
-----END EC PRIVATE KEY-----
)PEM";

static const char TLS_ROOT_CA_PEM[] = R"PEM(-----BEGIN CERTIFICATE-----
KEEP_THIS_CA
-----END CERTIFICATE-----
)PEM";
"""


def _make_app(tmp_path, config_path):
    app = create_app(Settings(
        database_url=f"sqlite:///{(tmp_path / 'provisioning.db').as_posix()}",
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
        device_provisioning_mode="local",
        device_config_path=config_path,
    ))
    Base.metadata.create_all(app.state.engine)
    return app


@pytest.fixture
def local_provisioning_api(tmp_path):
    firmware_dir = tmp_path / "firmware"
    firmware_dir.mkdir()
    config_path = firmware_dir / "config.h"
    (firmware_dir / "config.example.h").write_text(CONFIG_TEMPLATE, encoding="utf-8")
    app = _make_app(tmp_path, config_path)
    with TestClient(app) as client:
        yield client, app, config_path
    app.state.engine.dispose()


def _register(client, device_id):
    return client.post(
        "/api/v1/devices",
        headers=ADMIN,
        json={"device_id": device_id, "device_name": f"Sensor {device_id}"},
    )


def _private_key_from_config(config_path):
    content = config_path.read_text(encoding="utf-8")
    match = re.search(
        r'R"PEM\((-----BEGIN EC PRIVATE KEY-----.*?-----END EC PRIVATE KEY-----\r?\n)\)PEM";',
        content,
        re.DOTALL,
    )
    assert match is not None
    return serialization.load_pem_private_key(match.group(1).encode("ascii"), password=None)


def _public_pem(private_key):
    return private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")


def test_local_registration_provisions_matching_keys_without_http_key_material(
    local_provisioning_api,
    monkeypatch,
):
    client, app, config_path = local_provisioning_api

    first = _register(client, "ESP32-001")
    assert first.status_code == 201, first.text
    assert first.json()["key_id"] == "key-v1"
    assert first.json()["provisioning_status"] == "ready"
    assert first.json()["has_public_key"] is True
    assert first.json()["keys"] == [{"key_id": "key-v1", "status": "active"}]
    assert "PRIVATE KEY" not in first.text
    assert "PUBLIC KEY" not in first.text

    generated = config_path.read_text(encoding="utf-8")
    assert '#define DEVICE_ID "ESP32-001"' in generated
    assert '#define KEY_ID "key-v1"' in generated
    assert '#define WIFI_SSID "demo-wifi"' in generated
    assert '#define WIFI_PASSWORD "keep-this-value"' in generated
    assert '#define API_BASE_URL "https://api.example.test"' in generated
    assert "KEEP_THIS_CA" in generated
    assert generated.count("#define DEVICE_ID") == 1
    assert generated.count("#define KEY_ID") == 1
    assert generated.count("DEVICE_PRIVATE_KEY_PEM[]") == 1

    first_private_key = _private_key_from_config(config_path)
    with app.state.session_factory() as session:
        first_database_pem = session.get(DeviceKey, ("ESP32-001", "key-v1")).public_key_pem
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 1
    assert first_database_pem == _public_pem(first_private_key)

    payload = {
        "device_id": "ESP32-001",
        "firmware_version": "esp32-1.0",
        "humidity_milli_pct": 65000,
        "key_id": "key-v1",
        "payload_version": 1,
        "recorded_at": "2026-11-17T10:00:00Z",
        "sequence_number": 1,
        "shipment_id": str(uuid4()),
        "temperature_milli_c": 5000,
    }
    signature = first_private_key.sign(
        canonical_signed_bytes(payload),
        ec.ECDSA(hashes.SHA256()),
    )
    payload["signature"] = base64.b64encode(signature).decode("ascii")
    assert verify_signature(payload, first_database_pem.encode("ascii")) is True

    before_duplicate = config_path.read_bytes()
    with monkeypatch.context() as duplicate_context:
        def must_not_generate_key(_curve):
            raise AssertionError("duplicate registration must not regenerate a key")

        duplicate_context.setattr(
            "app.services.device_provisioning.ec.generate_private_key",
            must_not_generate_key,
        )
        duplicate = _register(client, "ESP32-001")
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DEVICE_EXISTS"
    assert config_path.read_bytes() == before_duplicate
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 1

    second = _register(client, "ESP32-002")
    assert second.status_code == 201
    assert '#define DEVICE_ID "ESP32-002"' in config_path.read_text(encoding="utf-8")
    second_private_key = _private_key_from_config(config_path)
    assert _public_pem(second_private_key) != first_database_pem
    with app.state.session_factory() as session:
        assert session.get(DeviceKey, ("ESP32-001", "key-v1")).public_key_pem == first_database_pem
        assert session.get(DeviceKey, ("ESP32-002", "key-v1")).public_key_pem == _public_pem(
            second_private_key
        )


def test_key_generation_failure_does_not_create_device_or_config(
    local_provisioning_api,
    monkeypatch,
):
    client, app, config_path = local_provisioning_api

    def fail_key_generation(_curve):
        raise RuntimeError("simulated key generation failure")

    monkeypatch.setattr(
        "app.services.device_provisioning.ec.generate_private_key",
        fail_key_generation,
    )
    response = _register(client, "ESP32-KEY-FAIL")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "KEY_GENERATION_FAILED"
    assert "simulated" not in response.text
    assert not config_path.exists()
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-KEY-FAIL") is None
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 0


def test_missing_config_template_rolls_back_database(tmp_path):
    firmware_dir = tmp_path / "firmware"
    firmware_dir.mkdir()
    config_path = firmware_dir / "config.h"
    app = _make_app(tmp_path, config_path)
    with TestClient(app) as client:
        response = _register(client, "ESP32-NO-TEMPLATE")
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "CONFIG_TEMPLATE_NOT_FOUND"
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-NO-TEMPLATE") is None
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 0
    app.state.engine.dispose()


def test_config_permission_failure_rolls_back_database(local_provisioning_api, monkeypatch):
    client, app, config_path = local_provisioning_api

    def deny_write(_path, _content, _mode):
        raise PermissionError("simulated access denied")

    monkeypatch.setattr(
        app.state.device_provisioner.config_writer,
        "_atomic_write",
        deny_write,
    )
    response = _register(client, "ESP32-NO-WRITE")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "CONFIG_WRITE_FAILED"
    assert "simulated" not in response.text
    assert not config_path.exists()
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-NO-WRITE") is None
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 0


def test_database_commit_failure_restores_previous_config(local_provisioning_api, monkeypatch):
    client, app, config_path = local_provisioning_api
    original_commit = Session.commit

    def fail_commit(_session):
        if config_path.exists():
            raise OperationalError("COMMIT", {}, RuntimeError("simulated database failure"))
        return original_commit(_session)

    monkeypatch.setattr(Session, "commit", fail_commit)
    response = _register(client, "ESP32-DB-FAIL")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "simulated" not in response.text
    assert not config_path.exists()

    monkeypatch.setattr(Session, "commit", original_commit)
    with app.state.session_factory() as session:
        assert session.get(Device, "ESP32-DB-FAIL") is None
        assert session.scalar(select(func.count(DeviceKey.device_id))) == 0
