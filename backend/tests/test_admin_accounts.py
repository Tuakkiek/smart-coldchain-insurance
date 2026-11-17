from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
import pytest
import jwt

from app.cli import upgrade_schema
from app.core.config import Settings
from app.core.database import make_engine, make_session_factory
from app.main import create_app
from app.models import AdminAccount
from app.services.auth import initialize_admin, verify_password


@pytest.fixture
def storage(tmp_path):
    settings = Settings(database_url=f"sqlite:///{(tmp_path / 'admin.db').as_posix()}",
                        admin_username='first-admin', admin_password='Initial-password-2026!',
                        jwt_secret_key='test-jwt-secret-at-least-32-bytes-long')
    engine = make_engine(settings.database_url)
    upgrade_schema(engine)
    yield settings, engine, make_session_factory(engine)
    engine.dispose()


def test_bootstrap_hashes_once_and_migrations_preserve_account(storage):
    settings, engine, factory = storage
    with factory() as session:
        account = initialize_admin(session, settings)
        stored = account.password_hash
        assert stored != settings.admin_password
        assert verify_password(settings.admin_password, stored)
        assert not verify_password('wrong', stored)
    upgrade_schema(engine)
    with factory() as session:
        account = initialize_admin(session, replace(settings, admin_username='changed-env', admin_password='changed-password'))
        assert account.username == 'first-admin'
        assert account.password_hash == stored
        assert session.scalar(select(func.count()).select_from(AdminAccount)) == 1
        session.add(AdminAccount(id=2, username='second-admin', password_hash=stored))
        with pytest.raises(IntegrityError):
            session.commit()


def test_concurrent_bootstrap_keeps_a_single_account(storage):
    settings, _, factory = storage
    def bootstrap(_):
        with factory() as session:
            return initialize_admin(session, settings).password_hash
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(bootstrap, range(2)))
    assert results[0] == results[1]
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AdminAccount)) == 1


def test_login_and_jwt_use_database_after_env_credentials_removed(storage):
    settings, _, factory = storage
    with factory() as session:
        account = initialize_admin(session, settings)
        account.username = 'persisted-admin'
        session.commit()
    # A fresh app/process configuration no longer has the bootstrap credentials.
    app = create_app(replace(settings, admin_username='', admin_password=''))
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/login', json={'username':'persisted-admin', 'password':settings.admin_password})
        assert response.status_code == 200
        token = response.json()['access_token']
        assert jwt.decode(token, settings.jwt_secret_key, algorithms=['HS256'])['sub'] == 'persisted-admin'
        assert client.get('/api/v1/devices', headers={'Authorization':f'Bearer {token}'}).status_code == 200
        assert client.post('/api/v1/auth/login', json={'username':settings.admin_username, 'password':settings.admin_password}).status_code == 401
        assert 'password_hash' not in response.text
    app.state.engine.dispose()


def test_empty_database_without_seed_credentials_fails_closed(storage):
    settings, _, factory = storage
    app = create_app(replace(settings, admin_username='', admin_password=''))
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/login', json={'username':'admin', 'password':'something'})
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'ADMIN_NOT_INITIALIZED'
    with factory() as session:
        assert session.get(AdminAccount, 1) is None
    app.state.engine.dispose()


def test_no_env_fallback_when_account_table_is_unavailable(storage):
    settings, engine, _ = storage
    AdminAccount.__table__.drop(engine)
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/login', json={'username':settings.admin_username, 'password':settings.admin_password})
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'AUTH_STORAGE_UNAVAILABLE'
        assert settings.admin_password not in response.text
    app.state.engine.dispose()
