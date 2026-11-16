import pytest


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Prevent backend/.env from reloading during tests and leaking secrets or overriding test env."""
    monkeypatch.setattr("app.core.config.load_dotenv", lambda *args, **kwargs: None)
