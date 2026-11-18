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

from app.core.config import Settings, load_settings, validate_auth_config, validate_admin_bootstrap
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
    "name": "AUTH-TEST-SHIP",
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
    if param.startswith('ADMIN_'):
        settings = load_settings()
        with pytest.raises(ValueError, match=error_match):
            validate_admin_bootstrap(settings.admin_username, settings.admin_password)
    else:
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


@pytest.mark.parametrize("missing_claim", ["sub", "jti", "type", "iat", "exp"])
def test_token_missing_claims_returns_401(auth_api, missing_claim):
    client, _app, settings = auth_api
    now_ts = int(time.time())
    payload = {
        "sub": VALID_USERNAME,
        "jti": str(uuid4()),
        "type": "access",
        "iat": now_ts,
        "exp": now_ts + 1800,
    }
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
    settings = Settings(
        database_url="sqlite://",
        admin_username=VALID_USERNAME,
        admin_password=VALID_PASSWORD,
        jwt_secret_key=VALID_SECRET,
    )
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

    # 2. Even an Admin cannot create another device.
    dev_resp = client.post(
        "/api/v1/devices",
        json={"device_id": "DEV-AUTH-01", "device_name": "Auth Sensor"},
        headers=admin_auth,
    )
    assert dev_resp.status_code == 403
    assert dev_resp.json()["error"]["code"] == "FIXED_DEVICE_REGISTRY"

    fake_uuid = str(uuid4())

    # Matrix of routes that MUST require Admin JWT
    protected_routes = [
        ("POST", "/api/v1/shipments", {"json": TEST_SHIPMENT}),
        ("GET", "/api/v1/shipments", {}),
        ("GET", f"/api/v1/shipments/{shipment_id}", {}),
        ("DELETE", f"/api/v1/shipments/{shipment_id}", {}),
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

    from test_signed_ingestion import register
    assert register(client, pem, shipment_id).status_code == 201

    # 1. Post signed telemetry WITHOUT JWT -> Must succeed!
    payload = signed(key, shipment_id, 1, device_id="ESP32-01")
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


def test_demo_routes_removed_in_all_environments(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'demo_removed.db').as_posix()}",
        app_env="development",
        admin_username=VALID_USERNAME,
        admin_password=VALID_PASSWORD,
        jwt_secret_key=VALID_SECRET,
        cors_origins=("https://app.coldchain.com",),
    )
    app = create_app(settings)
    token = create_access_token(VALID_USERNAME, VALID_SECRET)
    with TestClient(app) as client:
        # Calling demo endpoint even in development returns 404
        resp = client.post(
            f"/api/v1/demo/shipments/{uuid4()}/scenario",
            json={"scenario": "normal"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
    app.state.engine.dispose()


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


# --- Regression & Coverage Tests for Requirements 1, 2, 3 ---


# 1. Direct Settings & Environment Startup Fail-Closed Coverage
@pytest.mark.parametrize("app_env", ["development", "production"])
def test_direct_settings_missing_all_auth_fails_closed(app_env):
    """Calling Settings without auth credentials fails closed regardless of APP_ENV."""
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(
            database_url="sqlite://",
            app_env=app_env,
            cors_origins=("https://coldchain.example.com",) if app_env == "production" else (),
        )


@pytest.mark.parametrize("kwargs,error_match", [
    ({"admin_username": ""}, "ADMIN_USERNAME"),
    ({"admin_username": "   "}, "ADMIN_USERNAME"),
    ({"admin_username": "<admin>"}, "ADMIN_USERNAME"),
    ({"admin_username": "placeholder"}, "ADMIN_USERNAME"),
    ({"admin_password": ""}, "ADMIN_PASSWORD"),
    ({"admin_password": "   "}, "ADMIN_PASSWORD"),
    ({"admin_password": "<your-demo-password>"}, "ADMIN_PASSWORD"),
    ({"admin_password": "changeme"}, "ADMIN_PASSWORD"),
    ({"admin_password": "password"}, "ADMIN_PASSWORD"),
    ({"jwt_secret_key": ""}, "JWT_SECRET_KEY"),
    ({"jwt_secret_key": "short"}, "JWT_SECRET_KEY"),
    ({"jwt_secret_key": "a" * 31}, "JWT_SECRET_KEY"),
    ({"jwt_secret_key": "<your-secret-key>"}, "JWT_SECRET_KEY"),
    ({"jwt_secret_key": "<your-jwt-secret-key-at-least-32-bytes-placeholder>"}, "JWT_SECRET_KEY"),
    ({"jwt_access_token_expire_minutes": 0}, "JWT_ACCESS_TOKEN_EXPIRE_MINUTES"),
    ({"jwt_access_token_expire_minutes": -5}, "JWT_ACCESS_TOKEN_EXPIRE_MINUTES"),
])
def test_direct_settings_missing_or_invalid_field_fails_closed(kwargs, error_match):
    """Direct Settings instantiation rejects any missing, empty, placeholder or weak field."""
    valid_base = {
        "database_url": "sqlite://",
        "admin_username": VALID_USERNAME,
        "admin_password": VALID_PASSWORD,
        "jwt_secret_key": VALID_SECRET,
        "jwt_access_token_expire_minutes": 30,
    }
    valid_base.update(kwargs)
    if any(key.startswith('admin_') for key in kwargs):
        settings = Settings(**valid_base)
        with pytest.raises(ValueError, match=error_match):
            validate_admin_bootstrap(settings.admin_username, settings.admin_password)
    else:
        with pytest.raises(ValueError, match=error_match):
            Settings(**valid_base)


def test_create_app_fails_closed_if_unconfigured_via_env(monkeypatch):
    """create_app() without arguments fails closed if environment variables are missing."""
    monkeypatch.delenv("ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        create_app()


def test_no_default_test_secrets_in_runtime_module():
    """Verify DEFAULT_TEST_* constants are removed from app.core.config."""
    import app.core.config as config_mod
    assert not hasattr(config_mod, "DEFAULT_TEST_ADMIN_USERNAME")
    assert not hasattr(config_mod, "DEFAULT_TEST_ADMIN_PASSWORD")
    assert not hasattr(config_mod, "DEFAULT_TEST_JWT_SECRET")


def test_valid_auth_config_direct_and_env_works():
    """Valid auth configuration succeeds directly and via load_settings()."""
    # Direct
    direct = Settings(
        database_url="sqlite://",
        admin_username="valid_admin",
        admin_password="ValidAdminPassword123!",
        jwt_secret_key="a" * 32,
    )
    assert direct.admin_username == "valid_admin"

    # Environment
    loaded = load_settings()
    assert loaded.admin_username == VALID_USERNAME


# 2. Unicode and Password Whitespace Handling
UNICODE_USERNAME = "quản_trị_viên"
UNICODE_PASSWORD = "MậtKhẩu_BảoMật_@2026_ĐặcBiệt"
UNICODE_SECRET = "chuỗi_khóa_bí_mật_chứa_tiếng_việt_ít_nhất_32_bytes_chuẩn!"


@pytest.fixture
def unicode_auth_api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'unicode_auth.db').as_posix()}",
        admin_username=UNICODE_USERNAME,
        admin_password=UNICODE_PASSWORD,
        jwt_secret_key=UNICODE_SECRET,
        jwt_access_token_expire_minutes=30,
        cors_origins=("http://localhost:5173",),
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        yield client, app, settings
    app.state.engine.dispose()


def test_login_success_with_unicode_credentials(unicode_auth_api):
    client, _app, settings = unicode_auth_api
    response = client.post("/api/v1/auth/login", json={
        "username": UNICODE_USERNAME,
        "password": UNICODE_PASSWORD,
    })
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert token

    # Protected route with Unicode token succeeds
    shipment_resp = client.post(
        "/api/v1/shipments",
        json=TEST_SHIPMENT,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert shipment_resp.status_code == 201


def test_login_wrong_unicode_credentials_returns_401_no_500(unicode_auth_api):
    client, _app, _settings = unicode_auth_api
    # Wrong Unicode password
    resp1 = client.post("/api/v1/auth/login", json={
        "username": UNICODE_USERNAME,
        "password": "SaiMậtKhẩu_Unicode",
    })
    assert resp1.status_code == 401
    assert resp1.headers.get("www-authenticate") == "Bearer"
    assert resp1.json()["error"]["code"] == "UNAUTHORIZED"

    # Wrong Unicode username
    resp2 = client.post("/api/v1/auth/login", json={
        "username": "người_dùng_khác",
        "password": UNICODE_PASSWORD,
    })
    assert resp2.status_code == 401
    assert resp2.headers.get("www-authenticate") == "Bearer"
    assert resp2.json()["error"]["code"] == "UNAUTHORIZED"

    # ASCII wrong credentials against Unicode config returns 401, not 500
    resp3 = client.post("/api/v1/auth/login", json={
        "username": "ascii_user",
        "password": "ascii_password",
    })
    assert resp3.status_code == 401


def test_jwt_sub_unicode_matching_and_rejection(unicode_auth_api):
    client, _app, settings = unicode_auth_api
    # Token with correct Unicode sub works
    valid_token = create_access_token(UNICODE_USERNAME, settings.jwt_secret_key)
    res_ok = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {valid_token}"})
    assert res_ok.status_code == 200

    # Token with different Unicode sub is rejected safely with 401 (not 500)
    forged_token = create_access_token("kẻ_mạo_danh_tiếng_việt", settings.jwt_secret_key)
    res_fail = client.get("/api/v1/shipments", headers={"Authorization": f"Bearer {forged_token}"})
    assert res_fail.status_code == 401
    assert res_fail.headers.get("www-authenticate") == "Bearer"


def test_password_whitespace_exact_preservation(tmp_path):
    """Password leading/trailing whitespace must be preserved exactly and not trimmed."""
    password_with_spaces = "   Exact Password With Spaces   "
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'spaces_auth.db').as_posix()}",
        admin_username="admin",
        admin_password=password_with_spaces,
        jwt_secret_key=VALID_SECRET,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        # Exact password with spaces succeeds
        ok = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": password_with_spaces,
        })
        assert ok.status_code == 200

        # Stripped password must FAIL with 401 (not considered equivalent)
        stripped = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": password_with_spaces.strip(),
        })
        assert stripped.status_code == 401
        assert stripped.json()["error"]["code"] == "UNAUTHORIZED"

        # Extra space password must FAIL with 401
        extra = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": " " + password_with_spaces,
        })
        assert extra.status_code == 401

        # All-whitespace password is rejected as validation error (422)
        blank = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "     ",
        })
        assert blank.status_code == 422
        assert blank.json()["error"]["code"] == "VALIDATION_ERROR"
    app.state.engine.dispose()


# 3. Cross-Origin CORS and Retry-After Exposure
def test_cors_exposes_retry_after_and_x_request_id_on_rate_limit(auth_api):
    client, app, _settings = auth_api
    app.state.login_rate_limiter.reset()
    allowed_origin = "http://localhost:5173"

    # Make 5 failed attempts from allowed origin
    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "wrong"},
            headers={"Origin": allowed_origin},
        )
        assert resp.status_code == 401
        assert resp.headers.get("access-control-allow-origin") == allowed_origin

    # 6th attempt triggers 429
    blocked = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": VALID_PASSWORD},
        headers={"Origin": allowed_origin},
    )
    assert blocked.status_code == 429
    assert blocked.headers.get("access-control-allow-origin") == allowed_origin

    # Check Retry-After header
    assert "retry-after" in blocked.headers
    retry_after = int(blocked.headers["retry-after"])
    assert 1 <= retry_after <= 60

    # Check Access-Control-Expose-Headers exposes BOTH Retry-After and X-Request-ID
    exposed = blocked.headers.get("access-control-expose-headers", "")
    exposed_lower = [h.strip().lower() for h in exposed.split(",")]
    assert "retry-after" in exposed_lower
    assert "x-request-id" in exposed_lower


def test_cors_disallowed_origin_rejected(auth_api):
    client, app, _settings = auth_api
    app.state.login_rate_limiter.reset()
    disallowed_origin = "http://untrusted-attacker.com"

    # Attempt login from disallowed origin
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": VALID_PASSWORD},
        headers={"Origin": disallowed_origin},
    )
    # Origin is not allowed, so Access-Control-Allow-Origin must NOT be returned for disallowed origin
    assert resp.headers.get("access-control-allow-origin") != disallowed_origin


def test_cors_preflight_login_endpoint(auth_api):
    client, _app, _settings = auth_api
    allowed_origin = "http://localhost:5173"

    preflight = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": allowed_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == allowed_origin
    allowed_headers = [h.strip().lower() for h in preflight.headers.get("access-control-allow-headers", "").split(",")]
    assert "content-type" in allowed_headers
    assert "authorization" in allowed_headers
