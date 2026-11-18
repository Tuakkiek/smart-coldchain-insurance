from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Session

from app.cli import seed_demo
from app.core.config import BACKEND_DIR, _mysql_url, load_settings
from app.core.database import Base, make_engine, make_session_factory
from app.migrate_sqlite_to_mysql import compare_rows, copy_into_empty_target, migrate
from app.models import Shipment, ShipmentEvent, Telemetry


def test_runtime_settings_use_mysql_and_keep_special_password(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("MYSQL_HOST", "127.0.0.1")
    monkeypatch.setenv("MYSQL_PORT", "3306")
    monkeypatch.setenv("MYSQL_DATABASE", "smart_coldchain")
    monkeypatch.setenv("MYSQL_USER", "coldchain_app")
    monkeypatch.setenv("MYSQL_PASSWORD", "p@ss/w:rd")
    monkeypatch.setenv("SENSOR_GAP_MINUTES", "7")
    monkeypatch.setenv("MAX_SAMPLE_GAP_SECONDS", "90")
    monkeypatch.setenv("PAYOUT_REQUIRES_ANCHORED_EVIDENCE", "false")
    monkeypatch.setenv("BLOCKCHAIN_ENABLED", "false")
    settings = load_settings()
    assert settings.database_url.drivername == "mysql+pymysql"
    assert settings.database_url.password == "p@ss/w:rd"
    assert settings.database_url.query["charset"] == "utf8mb4"
    assert settings.sensor_gap_minutes == 7
    assert settings.max_sample_gap_seconds == 90
    assert settings.payout_requires_anchored_evidence is False
    assert settings.blockchain_enabled is False

    monkeypatch.setenv("BLOCKCHAIN_ENABLED", "true")
    monkeypatch.setenv("BLOCKCHAIN_CONTRACT_ADDRESS", "")
    monkeypatch.setenv("BLOCKCHAIN_ORACLE_PRIVATE_KEY", "")
    monkeypatch.setenv("BLOCKCHAIN_INSURER_PRIVATE_KEY", "")
    monkeypatch.setenv("DATA_INTEGRITY_CONTRACT_ADDRESS", "")
    monkeypatch.setenv("BACKEND_ANCHORER_PRIVATE_KEY", "")
    with pytest.raises(ValueError, match="contract address and oracle private key"):
        load_settings()
    monkeypatch.setenv("BLOCKCHAIN_ENABLED", "false")

    monkeypatch.setenv("MAX_SAMPLE_GAP_SECONDS", "0")
    with pytest.raises(ValueError, match="MAX_SAMPLE_GAP_SECONDS"):
        load_settings()
    monkeypatch.setenv("MAX_SAMPLE_GAP_SECONDS", "90")

    monkeypatch.setenv("PAYOUT_REQUIRES_ANCHORED_EVIDENCE", "sometimes")
    with pytest.raises(ValueError, match="PAYOUT_REQUIRES_ANCHORED_EVIDENCE"):
        load_settings()
    monkeypatch.setenv("PAYOUT_REQUIRES_ANCHORED_EVIDENCE", "true")

    monkeypatch.setenv("SENSOR_GAP_MINUTES", "0")
    with pytest.raises(ValueError, match="SENSOR_GAP_MINUTES"):
        load_settings()


def test_database_url_takes_precedence_and_uses_pymysql(monkeypatch):
    monkeypatch.delenv("MYSQL_SSL_CA", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        "mysql://provider:p%40ss%2Fword@mysql.example.com:25060/coldchain?ssl-mode=REQUIRED",
    )
    monkeypatch.setenv("MYSQL_HOST", "ignored.example.com")
    settings = load_settings()
    assert settings.database_url.drivername == "mysql+pymysql"
    assert settings.database_url.host == "mysql.example.com"
    assert settings.database_url.port == 25060
    assert settings.database_url.database == "coldchain"
    assert settings.database_url.password == "p@ss/word"
    assert settings.database_url.query == {"charset": "utf8mb4"}


@pytest.mark.parametrize("source", ["env", "url"])
def test_mysql_ca_path_is_relative_to_backend_not_working_directory(monkeypatch, tmp_path, source):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("MYSQL_SSL_CA", raising=False)
    database_url = "mysql://provider:password@mysql.example.com:25060/coldchain"
    if source == "env":
        monkeypatch.setenv("MYSQL_SSL_CA", " certs/aiven-ca.crt ")
    else:
        database_url += "?ssl_ca=certs/aiven-ca.crt"
    monkeypatch.setenv("DATABASE_URL", database_url)

    url = _mysql_url()

    assert url.query["ssl_ca"] == str((BACKEND_DIR / "certs/aiven-ca.crt").resolve())


def test_mysql_ca_preserves_absolute_secret_file_path(monkeypatch, tmp_path):
    ca_file = tmp_path / "mysql-ca.pem"
    ca_file.write_bytes((BACKEND_DIR / "certs/aiven-ca.crt").read_bytes())
    monkeypatch.setenv("DATABASE_URL", "mysql://provider:password@mysql.example.com:25060/coldchain")
    monkeypatch.setenv("MYSQL_SSL_CA", str(ca_file))

    assert _mysql_url().query["ssl_ca"] == str(ca_file.resolve())


@pytest.mark.parametrize("source", ["env", "url"])
def test_missing_mysql_ca_fails_before_accepting_login_requests(monkeypatch, tmp_path, source):
    missing_file = tmp_path / "missing-ca.pem"
    monkeypatch.delenv("MYSQL_SSL_CA", raising=False)
    database_url = "mysql://provider:password@mysql.example.com:25060/coldchain"
    if source == "env":
        monkeypatch.setenv("MYSQL_SSL_CA", str(missing_file))
    else:
        database_url += "?ssl_ca=certs/missing-ca.pem"
    monkeypatch.setenv("DATABASE_URL", database_url)

    with pytest.raises(ValueError, match="MySQL CA file is missing"):
        load_settings()


def test_production_requires_admin_secret_and_explicit_cors(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "short")
    monkeypatch.setenv("CORS_ORIGINS", "https://frontend.example.com")
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        load_settings()

    monkeypatch.setenv("JWT_SECRET_KEY", "a" * 32)
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        load_settings()

    monkeypatch.setenv("CORS_ORIGINS", "https://frontend.example.com/")
    monkeypatch.setenv("REFRESH_COOKIE_SECURE", "true")
    settings = load_settings()
    assert settings.app_env == "production"
    assert settings.cors_origins == ("https://frontend.example.com",)


def test_mysql_schema_keeps_double_and_microsecond_precision():
    assert Shipment.__table__.columns["origin_latitude"].type.compile(dialect=mysql.dialect()) == "DOUBLE"
    assert Telemetry.__table__.columns["temperature_c"].type.compile(dialect=mysql.dialect()) == "DOUBLE"
    assert Shipment.__table__.columns["created_at"].type.compile(dialect=mysql.dialect()) == "DATETIME(6)"
    assert Telemetry.__table__.columns["received_at"].type.compile(dialect=mysql.dialect()) == "DATETIME(6)"


def test_migration_preserves_ids_timestamps_events_and_refuses_duplicates(tmp_path):
    source_path = tmp_path / "old.db"
    source = make_engine(f"sqlite:///{source_path.as_posix()}")
    target = make_engine(f"sqlite:///{(tmp_path / 'target.db').as_posix()}")
    try:
        Base.metadata.create_all(source)
        seed_demo(make_session_factory(source))
        assert migrate(source_path, check_source_only=True) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        assert copy_into_empty_target(source, target) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        assert compare_rows(source, target) == {
            "shipments": 3, "telemetry": 2, "shipment_events": 1
        }
        with Session(source) as old, Session(target) as new:
            for model in (Shipment, Telemetry, ShipmentEvent):
                old_rows = list(old.scalars(select(model).order_by(model.id)))
                new_rows = list(new.scalars(select(model).order_by(model.id)))
                assert [row.id for row in old_rows] == [row.id for row in new_rows]
                for before, after in zip(old_rows, new_rows):
                    assert all(
                        getattr(before, column.name) == getattr(after, column.name)
                        for column in model.__table__.columns
                    )

        try:
            copy_into_empty_target(source, target)
        except ValueError as exc:
            assert "already contains data" in str(exc)
        else:
            raise AssertionError("A second migration must refuse a nonempty target")
    finally:
        source.dispose()
        target.dispose()
