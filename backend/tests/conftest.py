import os
import pytest

# Ensure isolated test env before modules are imported
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password-12345")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!")
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("TRUSTED_PROXIES", "127.0.0.1,::1,testclient")

from app.services.auth import create_access_token


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Prevent backend/.env from reloading during tests and leaking secrets or overriding test env."""
    monkeypatch.setattr("app.core.config.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-password-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!")
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    monkeypatch.setenv("TRUSTED_PROXIES", "127.0.0.1,::1,testclient")


@pytest.fixture
def admin_token():
    return create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
