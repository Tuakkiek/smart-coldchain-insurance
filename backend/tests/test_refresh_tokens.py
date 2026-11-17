from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select

from app.cli import upgrade_schema
from app.core.config import Settings
from app.core.database import Base, make_engine
from app.main import create_app
from app.models import AdminAccount, RefreshToken


USERNAME = "admin"
PASSWORD = "refresh-test-password-2026!"
SECRET = "refresh-test-jwt-secret-at-least-32-bytes!"
ORIGIN = "http://localhost:5173"


@pytest.fixture
def refresh_api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'refresh.db').as_posix()}",
        admin_username=USERNAME,
        admin_password=PASSWORD,
        jwt_secret_key=SECRET,
        jwt_access_token_expire_minutes=5,
        jwt_refresh_token_expire_days=7,
        cors_origins=(ORIGIN,),
        refresh_cookie_secure=False,
        refresh_cookie_samesite="lax",
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, base_url="http://localhost") as client:
        yield client, app, settings
    app.state.engine.dispose()


def _login(client: TestClient, origin: str | None = None):
    headers = {"Origin": origin} if origin else {}
    return client.post(
        "/api/v1/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
        headers=headers,
    )


def _cookie_value(client: TestClient, settings: Settings) -> str:
    value = client.cookies.get(settings.refresh_cookie_name)
    assert value
    return value


def _use_cookie(client: TestClient, settings: Settings, value: str) -> None:
    client.cookies.set(
        settings.refresh_cookie_name,
        value,
        path=settings.refresh_cookie_path,
    )


def test_login_sets_httponly_cookie_and_never_returns_refresh_token(refresh_api):
    client, app, settings = refresh_api
    response = _login(client)

    assert response.status_code == 200
    assert set(response.json()) == {"access_token", "token_type"}
    cookie_header = response.headers["set-cookie"].lower()
    assert f"{settings.refresh_cookie_name}=" in cookie_header
    assert "httponly" in cookie_header
    assert "samesite=lax" in cookie_header
    assert f"path={settings.refresh_cookie_path}" in cookie_header
    assert "secure" not in cookie_header

    plaintext = _cookie_value(client, settings)
    with app.state.session_factory() as session:
        stored = session.scalar(select(RefreshToken))
        assert stored is not None
        assert stored.token_hash != plaintext
        assert plaintext not in stored.token_hash


def test_refresh_rotates_once_and_reuse_revokes_the_family(refresh_api):
    client, _app, settings = refresh_api
    assert _login(client).status_code == 200
    old_token = _cookie_value(client, settings)

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert set(refreshed.json()) == {"access_token", "token_type"}
    new_token = _cookie_value(client, settings)
    assert new_token != old_token

    _use_cookie(client, settings, old_token)
    reused = client.post("/api/v1/auth/refresh")
    assert reused.status_code == 401
    assert reused.json()["error"]["code"] == "REFRESH_TOKEN_REUSED"

    _use_cookie(client, settings, new_token)
    revoked = client.post("/api/v1/auth/refresh")
    assert revoked.status_code == 401
    assert revoked.json()["error"]["code"] == "REFRESH_TOKEN_REVOKED"


def test_invalid_missing_and_expired_refresh_errors_are_consistent(refresh_api):
    client, app, settings = refresh_api
    missing = client.post("/api/v1/auth/refresh")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "REFRESH_TOKEN_MISSING"

    _use_cookie(client, settings, "tampered-token")
    invalid = client.post("/api/v1/auth/refresh")
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "REFRESH_TOKEN_INVALID"

    assert _login(client).status_code == 200
    with app.state.session_factory() as session:
        row = session.scalar(select(RefreshToken).order_by(RefreshToken.created_at.desc()))
        assert row is not None
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.commit()
    expired = client.post("/api/v1/auth/refresh")
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "REFRESH_TOKEN_EXPIRED"
    expired_again = client.post("/api/v1/auth/refresh")
    assert expired_again.status_code == 401
    assert expired_again.json()["error"]["code"] == "REFRESH_TOKEN_EXPIRED"


def test_logout_revokes_server_session_and_clears_cookie(refresh_api):
    client, _app, settings = refresh_api
    assert _login(client).status_code == 200
    token = _cookie_value(client, settings)

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    cookie_header = logout.headers["set-cookie"].lower()
    assert f"{settings.refresh_cookie_name}=" in cookie_header
    assert "max-age=0" in cookie_header
    assert f"path={settings.refresh_cookie_path}" in cookie_header

    _use_cookie(client, settings, token)
    rejected = client.post("/api/v1/auth/refresh")
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "REFRESH_TOKEN_REVOKED"


@pytest.mark.parametrize("account_change", ["disabled", "security_version", "password"])
def test_account_security_changes_invalidate_refresh_session(refresh_api, account_change):
    client, app, _settings = refresh_api
    assert _login(client).status_code == 200
    with app.state.session_factory() as session:
        account = session.get(AdminAccount, 1)
        assert account is not None
        if account_change == "disabled":
            account.is_active = False
        elif account_change == "security_version":
            account.security_version += 1
        else:
            account.password_hash += "changed"
        session.commit()

    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "SESSION_INVALID"
    repeated = client.post("/api/v1/auth/refresh")
    assert repeated.status_code == 401
    assert repeated.json()["error"]["code"] == "SESSION_INVALID"


def test_auth_origin_and_credentialed_cors_are_enforced(refresh_api):
    client, _app, _settings = refresh_api
    allowed = _login(client, ORIGIN)
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == ORIGIN
    assert allowed.headers["access-control-allow-credentials"] == "true"

    denied = _login(client, "https://attacker.example")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"
    assert denied.headers.get("access-control-allow-origin") is None

    preflight = client.options(
        "/api/v1/auth/refresh",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-credentials"] == "true"


def test_production_cookie_is_secure(refresh_api):
    _client, app, development = refresh_api
    production = replace(
        development,
        database_url=development.database_url,
        app_env="production",
        refresh_cookie_secure=True,
        cors_origins=("https://app.example.com",),
    )
    prod_app = create_app(production)
    Base.metadata.create_all(prod_app.state.engine)
    with TestClient(prod_app, base_url="https://api.example.com") as client:
        response = _login(client, "https://app.example.com")
        assert response.status_code == 200
        assert "secure" in response.headers["set-cookie"].lower()
        assert "httponly" in response.headers["set-cookie"].lower()
    prod_app.state.engine.dispose()


def test_unsafe_cookie_and_wildcard_cors_configuration_fail_closed():
    common = dict(
        database_url="sqlite://",
        admin_username=USERNAME,
        admin_password=PASSWORD,
        jwt_secret_key=SECRET,
    )
    with pytest.raises(ValueError, match="REFRESH_COOKIE_SECURE"):
        Settings(**common, app_env="production", refresh_cookie_secure=False)
    with pytest.raises(ValueError, match="SameSite=None"):
        Settings(
            **common,
            refresh_cookie_secure=False,
            refresh_cookie_samesite="none",
        )
    with pytest.raises(ValueError, match="wildcard"):
        Settings(**common, cors_origins=("*",))
    with pytest.raises(ValueError, match="REFRESH_COOKIE_DOMAIN"):
        Settings(**common, refresh_cookie_domain="https://bad.example.com")


def test_refresh_token_migration_creates_session_storage(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'migration.db').as_posix()}")
    try:
        upgrade_schema(engine)
        inspector = inspect(engine)
        assert "refresh_tokens" in inspector.get_table_names()
        assert {column["name"] for column in inspector.get_columns("refresh_tokens")} >= {
            "family_id",
            "token_hash",
            "account_snapshot_hash",
            "expires_at",
            "used_at",
            "revoked_at",
            "replaced_by_id",
        }
        assert {column["name"] for column in inspector.get_columns("admin_accounts")} >= {
            "is_active",
            "security_version",
        }
    finally:
        engine.dispose()
