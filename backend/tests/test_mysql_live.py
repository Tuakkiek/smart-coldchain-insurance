"""Opt-in read-only smoke test against the configured MySQL database."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import load_settings
from app.main import create_app


@pytest.mark.skipif(os.getenv("RUN_MYSQL_TESTS") != "1", reason="set RUN_MYSQL_TESTS=1 to check local MySQL")
def test_api_reads_configured_mysql():
    app = create_app(load_settings())
    try:
        assert app.state.engine.dialect.name == "mysql"
        with app.state.engine.connect() as connection:
            cipher = connection.execute(text("SHOW SESSION STATUS LIKE 'Ssl_cipher'")).one()[1]
            assert cipher, "MySQL connection must use TLS"
        with TestClient(app) as client:
            assert client.get("/api/v1/health").status_code == 200
            response = client.get("/api/v1/shipments")
            assert response.status_code == 200
            items = response.json()["items"]
            assert response.json()["total"] == len(items) >= 1
            shipment_id = items[0]["id"]
            detail = client.get(f"/api/v1/shipments/{shipment_id}")
            assert detail.status_code == 200
            assert detail.json()["created_at"].endswith("Z")
            assert client.get(f"/api/v1/shipments/{shipment_id}/telemetry").status_code == 200
            assert client.get(f"/api/v1/shipments/{shipment_id}/events").status_code == 200
    finally:
        app.state.engine.dispose()
