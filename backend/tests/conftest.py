import os
import pytest

TEST_ADMIN_USERNAME = "admin"
TEST_ADMIN_PASSWORD = "test-admin-password-12345"
TEST_JWT_SECRET = "test-jwt-secret-key-at-least-32-chars-long!"
TEST_EXPIRE_MINUTES = 30
TEST_TRUSTED_PROXIES = "127.0.0.1,::1,testclient"

# Ensure isolated test env before modules are imported
os.environ.setdefault("ADMIN_USERNAME", TEST_ADMIN_USERNAME)
os.environ.setdefault("ADMIN_PASSWORD", TEST_ADMIN_PASSWORD)
os.environ.setdefault("JWT_SECRET_KEY", TEST_JWT_SECRET)
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", str(TEST_EXPIRE_MINUTES))
os.environ.setdefault("TRUSTED_PROXIES", TEST_TRUSTED_PROXIES)

from app.services.auth import create_access_token


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Prevent backend/.env from reloading during tests and leaking secrets or overriding test env."""
    monkeypatch.setattr("app.core.config.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setenv("ADMIN_USERNAME", TEST_ADMIN_USERNAME)
    monkeypatch.setenv("ADMIN_PASSWORD", TEST_ADMIN_PASSWORD)
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", str(TEST_EXPIRE_MINUTES))
    monkeypatch.setenv("TRUSTED_PROXIES", TEST_TRUSTED_PROXIES)


@pytest.fixture
def admin_token():
    return create_access_token(TEST_ADMIN_USERNAME, TEST_JWT_SECRET)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
