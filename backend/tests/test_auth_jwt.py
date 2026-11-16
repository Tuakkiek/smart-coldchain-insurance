"""Comprehensive test suite for single-admin Login/JWT and API protection."""

from __future__ import annotations

from datetime import datetime, timezone
import time
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient
import jwt
import pytest

from app.core.config import Settings, load_settings, validate_auth_config
from app.core.database import Base
from app.main import create_app
from app.services.auth import (
    AuthError,
    LoginRateLimiter,
    authenticate_admin,
    create_access_token,
    decode_and_verify_token,
    is_ip_in_trusted,
    resolve_client_ip,
)
from app.services.telemetry_protocol import canonical_signed_bytes


VALID_USERNAME = "admin"
VALID_PASSWORD = "test-admin-password-12345"
VALID_SECRET = "test-jwt-secret-key-at-least-32-chars-long!"
TEST_SHIPMENT = {
    "code": "AUTH-TEST-SHIP",
    "cargo_type": "vaccine",
    "origin": {"name": "Kho A", "latitude": 10.0, "longitude": 105.0},
    "destination": {"name": "Kho B", "latitude": 11.0, "longitude": 106.0},
    "temp_min_c": 2.0,
    "temp_max_c": 8.0,
    "insured_amount_vnd": 5000000,
}


@pytest.fixture
def auth_api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'auth_test.db').as_posix()}",
        admin_username=VALID_USERNAME,
        admin_password=VALID_PASSWORD,
        jwt_secret_key=VALID_SECRET,
        jwt_access_token_expire_minutes=30,
        cors_origins=("http://localhost:5173",),
        trusted_proxies=("127.0.0.1", "::1", "10.0.0.1"),
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        yield client, app, settings
    app.state.engine.dispose()


def test_login_success(auth_api):
    client, app, settings = auth_api
    response = client.post("/api/v1/auth/login", json={
        "username": VALID_USERNAME,
        "password": VALID_PASSWORD,
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    # Decode and verify token claims
    payload = decode_and_verify_token(data["access_token"], settings.jwt_secret_key, settings.admin_username)
    assert payload["sub"] == VALID_USERNAME
    assert "iat" in payload
    assert "exp" in payload
    assert payload["exp"] > payload["iat"]


def test_login_wrong_password_returns_401(auth_api):
    client, _app, _settings = auth_api
    response = client.post("/api/v1/auth/login", json={
        "username": VALID_USERNAME,
        "password": "wrong-password",
    })
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Tên đăng nhập hoặc mật khẩu không chính xác",
            "details": [],
        }
    }


def test_login_wrong_username_returns_401(auth_api):
    client, _app, _settings = auth_api
    response = client.post("/api/v1/auth/login", json={
        "username": "wrong-admin",
        "password": VALID_PASSWORD,
    })
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("payload", [
    {},
    {"username": ""},
    {"username": "admin"},
    {"username": "admin", "password": ""},
    {"username": "admin", "password": "  "},
    {"username": "admin", "password": "123", "extra_field": "hacked"},
])
def test_login_validation_errors_return_422(auth_api, payload):
    client, _app, _settings = auth_api
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_login_rate_limiting_returns_429(auth_api):
    client, app, _settings = auth_api
    app.state.login_rate_limiter.reset()

    # 5 failed login attempts
    for _ in range(5):
        resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "bad"})
        assert resp.status_code == 401

    # 6th attempt should be blocked by rate limiter with 429 and Retry-After header
    blocked = client.post("/api/v1/auth/login", json={"username": "admin", "password": VALID_PASSWORD})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert "retry-after" in blocked.headers
    retry_after = int(blocked.headers["retry-after"])
    assert 1 <= retry_after <= 60


def test_login_rate_limiting_ip_spoofing_defense(auth_api):
    client, app, _settings = auth_api
    app.state.login_rate_limiter.reset()

    # An untrusted client tries to send random X-Forwarded-For headers to evade rate limit
    for i in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "bad"},
            headers={"X-Forwarded-For": f"198.51.100.{i}"},
        )
        assert resp.status_code == 401

    # 6th attempt with yet another fake IP must STILL be rate limited
    blocked = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": VALID_PASSWORD},
        headers={"X-Forwarded-For": "203.0.113.99"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"


def test_trusted_proxy_forwarding_resolution():
    from unittest.mock import Mock

    req = Mock()
    req.client.host = "10.0.0.1"  # trusted proxy
    req.headers = {"x-forwarded-for": "198.51.100.5, 10.0.0.1"}
    resolved = resolve_client_ip(req, ("10.0.0.1", "127.0.0.1"))
    assert resolved == "198.51.100.5"

    # Untrusted direct peer ignores X-Forwarded-For
    req.client.host = "192.168.1.50"  # untrusted
    req.headers = {"x-forwarded-for": "1.2.3.4"}
    resolved_untrusted = resolve_client_ip(req, ("10.0.0.1", "127.0.0.1"))
    assert resolved_untrusted == "192.168.1.50"


@pytest.mark.parametrize("param,value,error_match", [
    ("ADMIN_USERNAME", "", "ADMIN_USERNAME"),
    ("ADMIN_USERNAME", "   ", "ADMIN_USERNAME"),
    ("ADMIN_USERNAME", "<admin>", "ADMIN_USERNAME"),
    ("ADMIN_USERNAME", "placeholder", "ADMIN_USERNAME"),
    ("ADMIN_PASSWORD", "", "ADMIN_PASSWORD"),
    ("ADMIN_PASSWORD", "<your-demo-password>", "ADMIN_PASSWORD"),
    ("ADMIN_PASSWORD", "changeme", "ADMIN_PASSWORD"),
    ("JWT_SECRET_KEY", "", "JWT_SECRET_KEY"),
    ("JWT_SECRET_KEY", "short", "JWT_SECRET_KEY"),
    ("JWT_SECRET_KEY", "a" * 31, "JWT_SECRET_KEY"),
    ("JWT_SECRET_KEY", "<jwt_secret_key_placeholder_here>", "JWT_SECRET_KEY"),
])
def test_startup_config_validation_fails_closed(monkeypatch, param, value, error_match):
    monkeypatch.setenv("ADMIN_USERNAME", VALID_USERNAME)
    monkeypatch.setenv("ADMIN_PASSWORD", VALID_PASSWORD)
    monkeypatch.setenv("JWT_SECRET_KEY", VALID_SECRET)
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")

    monkeypatch.setenv(param, value)
    with pytest.raises(ValueError, match=error_match):
        load_settings()


def test_startup_invalid_ttl_fails_closed(monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAME", VALID_USERNAME)
    monkeypatch.setenv("ADMIN_PASSWORD", VALID_PASSWORD)
    monkeypatch.setenv("JWT_SECRET_KEY", VALID_SECRET)

    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "0")
    with pytest.raises(ValueError, match="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"):
        load_settings()

    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "-10")
    with pytest.raises(ValueError, match="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"):
        load_settings()

    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "invalid_int")
    with pytest.raises(ValueError, match="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"):
        load_settings()


def test_token_missing_returns_401(auth_api):
    client, _app, _settings = auth_api
    response = client.get("/api/v1/shipments")
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("auth_header", [
    "Basic dXNlcjpwYXNz",
    "Token some-token",
    "Bearer",
    "Bearer ",
    "bearer",
    "InvalidScheme token",
])
def test_token_invalid_scheme_returns_401(auth_api, auth_header):
    client, _app, _settings = auth_api
    response = client.get("/api/v1/shipments", headers={"Authorization": auth_header})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_token_expired_returns_401(auth_api):
    client, _app, settings = auth_api
    now_ts = int(time.time())
    expired_token = jwt.encode(
        {"sub": VALID_USERNAME, "iat": now_ts - 3600, "exp": now_ts - 60},
        settings.jwt_secret_key,
        algorithm="HS256",
    )
    response = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_token_invalid_signature_returns_401(auth_api):
    client, _app, _settings = auth_api
    wrong_key_token = create_access_token(VALID_USERNAME, "wrong-secret-key-at-least-32-chars-long!")
    response = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {wrong_key_token}"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_token_wrong_subject_returns_401(auth_api):
    client, _app, settings = auth_api
    wrong_sub_token = create_access_token("other_user", settings.jwt_secret_key)
    response = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {wrong_sub_token}"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@pytest.mark.parametrize("missing_claim", ["sub", "iat", "exp"])
def test_token_missing_claims_returns_401(auth_api, missing_claim):
    client, _app, settings = auth_api
    now_ts = int(time.time())
    payload = {"sub": VALID_USERNAME, "iat": now_ts, "exp": now_ts + 1800}
    del payload[missing_claim]
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    response = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_token_wrong_algorithm_returns_401(auth_api):
    client, _app, settings = auth_api
    now_ts = int(time.time())
    # Algorithm "none"
    none_token = jwt.encode(
        {"sub": VALID_USERNAME, "iat": now_ts, "exp": now_ts + 1800},
        key="",
        algorithm="none",
    )
    response = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {none_token}"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_old_x_admin_key_header_is_completely_rejected(auth_api):
    client, _app, _settings = auth_api
    # Passing only X-Admin-Key should be rejected with 401
    response = client.get("/api/v1/shipments", headers={"X-Admin-Key": "coldchain_secret_admin_key_32chars_test"})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"

    # Even creating shipment with X-Admin-Key is rejected
    post_resp = client.post(
        "/api/v1/shipments",
        json=TEST_SHIPMENT,
        headers={"X-Admin-Key": "coldchain_secret_admin_key_32chars_test"},
    )
    assert post_resp.status_code == 401
    assert post_resp.headers.get("www-authenticate") == "Bearer"


def test_settings_has_no_admin_api_key():
    settings = Settings(database_url="sqlite://")
    assert not hasattr(settings, "admin_api_key")


def test_openapi_declares_http_bearer_and_no_api_key(auth_api):
    client, _app, _settings = auth_api
    schema = client.get("/openapi.json").json()
    security_schemes = schema["components"].get("securitySchemes", {})
    assert "HTTPBearer" in security_schemes
    assert security_schemes["HTTPBearer"]["type"] == "http"
    assert security_schemes["HTTPBearer"]["scheme"] == "bearer"
    # Ensure no API Key security scheme exists
    assert "APIKey" not in security_schemes
    assert "X-Admin-Key" not in str(security_schemes)


def test_protected_routes_matrix(auth_api):
    client, app, settings = auth_api
    admin_token = create_access_token(VALID_USERNAME, settings.jwt_secret_key)
    admin_auth = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a shipment with admin token
    shipment_resp = client.post("/api/v1/shipments", json=TEST_SHIPMENT, headers=admin_auth)
    assert shipment_resp.status_code == 201
    shipment_id = shipment_resp.json()["id"]

    # 2. Register a device with admin token
    dev_resp = client.post(
        "/api/v1/devices",
        json={"device_id": "DEV-AUTH-01", "device_name": "Auth Sensor"},
        headers=admin_auth,
    )
    assert dev_resp.status_code == 201

    fake_uuid = str(uuid4())

    # Matrix of routes that MUST require Admin JWT
    protected_routes = [
        ("POST", "/api/v1/shipments", {"json": TEST_SHIPMENT}),
        ("GET", "/api/v1/shipments", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}", {}),
        ("POST", "/api/v1/devices", {"json": {"device_id": "DEV-AUTH-02", "device_name": "Sensor 2"}}),
        ("GET", "/api/v1/devices", {}),
        ("GET", "/api/v1/devices/DEV-AUTH-01", {}),
        ("POST", "/api/v1/devices/DEV-AUTH-01/keys", {"json": {"key_id": "k1", "public_key_pem": "test"}}),
        ("PATCH", "/api/v1/devices/DEV-AUTH-01", {"json": {"status": "active"}}),
        ("PATCH", "/api/v1/devices/DEV-AUTH-01/keys/k1", {"json": {"status": "active"}}),
        ("POST", "/api/v1/devices/DEV-AUTH-01/assignments", {"json": {"shipment_id": shipment_id, "active": True}}),
        ("GET", f"/api/v1/shipments/{shipment_id}/telemetry", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}/events", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}/devices", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}/integrity", {}),
        ("GET", "/api/v1/integrity/summary", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}/batches", {}),
        ("GET", "/api/v1/batches", {}),
        ("POST", f"/api/v1/shipments/{shipment_id}/batches/seal", {"json": {"device_id": "DEV-AUTH-01", "force": True}}),
        ("GET", f"/api/v1/batches/{fake_uuid}", {}),
        ("POST", f"/api/v1/batches/{fake_uuid}/anchor", {}),
        ("POST", f"/api/v1/batches/{fake_uuid}/verify", {}),
        ("POST", f"/api/v1/shipments/{shipment_id}/insurance/reconcile", {}),
        ("POST", f"/api/v1/demo/shipments/{shipment_id}/scenario", {"json": {"scenario": "normal"}}),
    ]

    for method, path, kwargs in protected_routes:
        # Call without auth -> MUST be 401
        unauthed = client.request(method, path, **kwargs)
        assert unauthed.status_code == 401, f"{method} {path} should return 401 without auth, got {unauthed.status_code}"
        assert unauthed.headers.get("www-authenticate") == "Bearer"


def test_public_routes_matrix(auth_api):
    client, _app, _settings = auth_api

    # 1. Health is public
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    # 2. Ready is public
    ready = client.get("/api/v1/ready")
    assert ready.status_code == 200
    assert ready.json()["database"] == "ok"

    # 3. Login is public
    login = client.post("/api/v1/auth/login", json={"username": VALID_USERNAME, "password": VALID_PASSWORD})
    assert login.status_code == 200


from test_signed_ingestion import signed


def test_signed_telemetry_does_not_require_jwt_and_jwt_cannot_bypass_ecdsa(auth_api):
    client, app, settings = auth_api
    admin_auth = {"Authorization": f"Bearer {create_access_token(VALID_USERNAME, settings.jwt_secret_key)}"}

    # Setup device, key, assignment
    shipment_resp = client.post("/api/v1/shipments", json=TEST_SHIPMENT, headers=admin_auth)
    shipment_id = shipment_resp.json()["id"]

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")

    client.post("/api/v1/devices", json={"device_id": "SENSOR-ECDSA", "device_name": "Sensor ECDSA"}, headers=admin_auth)
    client.post(
        "/api/v1/devices/SENSOR-ECDSA/assignments",
        json={"shipment_id": shipment_id, "active": True},
        headers=admin_auth,
    )
    client.post(
        "/api/v1/devices/SENSOR-ECDSA/keys",
        json={"key_id": "key-1", "public_key_pem": pem},
        headers=admin_auth,
    )

    # 1. Post signed telemetry WITHOUT JWT -> Must succeed!
    payload = signed(key, shipment_id, 1, device_id="SENSOR-ECDSA", key_id="key-1")
    telemetry_resp = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=payload)
    assert telemetry_resp.status_code == 201
    assert telemetry_resp.json()["signature_status"] == "VALID"

    # 2. Tamper with payload (invalid signature) but provide valid Admin JWT -> Must FAIL with 401/403/422!
    bad_payload = dict(payload)
    bad_payload["sequence_number"] = 2
    import base64
    bad_payload["signature"] = base64.b64encode(b"invalid-signature-bytes").decode("ascii")

    tampered_resp = client.post(
        f"/api/v1/shipments/{shipment_id}/telemetry",
        json=bad_payload,
        headers=admin_auth,
    )
    assert tampered_resp.status_code in {401, 403, 422}
    assert tampered_resp.json()["error"]["code"] in {"INVALID_SIGNATURE", "VALIDATION_ERROR"}


def test_production_disables_demo_routes(tmp_path):
    prod_settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'prod_demo.db').as_posix()}",
        app_env="production",
        admin_username=VALID_USERNAME,
        admin_password=VALID_PASSWORD,
        jwt_secret_key=VALID_SECRET,
        cors_origins=("https://app.coldchain.com",),
    )
    prod_app = create_app(prod_settings)
    token = create_access_token(VALID_USERNAME, VALID_SECRET)
    with TestClient(prod_app) as prod_client:
        # Calling demo endpoint even with valid JWT returns 404
        resp = prod_client.post(
            f"/api/v1/demo/shipments/{uuid4()}/scenario",
            json={"scenario": "normal"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
    prod_app.state.engine.dispose()


def test_cors_preflight_allows_authorization(auth_api):
    client, _app, _settings = auth_api
    preflight = client.options("/api/v1/devices", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
    })
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:5173"
    allowed_headers = preflight.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers
