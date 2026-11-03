from __future__ import annotations

from uuid import UUID
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.cli import seed_demo
from app.core.config import Settings
from app.core.database import Base
from app.main import create_app


SHIPMENT = {
    "code": "SHIP-TEST-001",
    "cargo_type": "vaccine",
    "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
    "destination": {"name": "Điểm B", "latitude": 10.05, "longitude": 105.81},
    "temp_min_c": 2.0,
    "temp_max_c": 8.0,
    "violation_duration_minutes": 15,
    "insured_amount_vnd": 10000000,
}


@pytest.fixture
def api(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    app = create_app(Settings(database_url=database_url))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        yield client, app
    app.state.engine.dispose()


def create_shipment(client: TestClient) -> dict:
    response = client.post("/api/v1/shipments", json=SHIPMENT)
    assert response.status_code == 201, response.text
    return response.json()


def test_health_and_openapi(api):
    client, _app = api
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/shipments/{shipment_id}/telemetry" in paths
    assert client.get("/docs").status_code == 200


def test_create_list_detail_and_persistence(api):
    client, app = api
    created = create_shipment(client)
    assert UUID(created["id"]).version == 4
    assert created["status"] == "created"
    assert created["latest_telemetry"] is None
    assert created["location"] is None
    assert created["insurance"] == {
        "insured_amount_vnd": 10000000,
        "status": "active",
        "payout_status": "not_requested",
    }
    assert created["created_at"].endswith("Z")
    assert client.get(f"/api/v1/shipments/{created['id']}").json() == created
    listing = client.get("/api/v1/shipments").json()
    assert listing == {"items": [created], "total": 1}

    # A fresh app instance sees the data committed by the first request.
    fresh = create_app(app.state.settings)
    with TestClient(fresh) as second_client:
        assert second_client.get(f"/api/v1/shipments/{created['id']}").json() == created
    fresh.state.engine.dispose()


def test_multiple_telemetry_samples_and_simulated_location(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    for temperature in (5.0, 9.2, 5.0):
        response = client.post(
            f"/api/v1/shipments/{shipment_id}/telemetry",
            json={"device_id": "ESP32-01", "temperature_c": temperature, "humidity_pct": 72.5},
        )
        assert response.status_code == 201, response.text
        assert response.json()["recorded_at"] is None
        assert response.json()["received_at"].endswith("Z")
        assert response.json()["location"]["location_source"] == "backend_simulated"

    history = client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]
    assert len(history) == 3
    assert [item["temperature_c"] for item in history] == [5.0, 9.2, 5.0]
    assert [item["location"]["progress_pct"] for item in history] == [5.0, 10.0, 15.0]
    detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
    assert detail["status"] == "in_transit"
    assert detail["latest_telemetry"]["id"] == history[-1]["id"]
    assert detail["location"] == history[-1]["location"]
    assert client.get(f"/api/v1/shipments/{shipment_id}/events").json() == {"items": []}


@pytest.mark.parametrize(
    "changes",
    [
        {"temp_min_c": 8.0, "temp_max_c": 2.0},
        {"temp_min_c": 8.0, "temp_max_c": 8.0},
        {"violation_duration_minutes": -1},
        {"insured_amount_vnd": -1},
        {"origin": {"name": " ", "latitude": 10.0, "longitude": 105.0}},
        {"temp_min_c": "NaN"},
        {"temp_min_c": "2.0"},
    ],
)
def test_invalid_shipment_is_422(api, changes):
    client, _app = api
    response = client.post("/api/v1/shipments", json=SHIPMENT | changes)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"]


@pytest.mark.parametrize(
    "payload",
    [
        {"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 101},
        {"device_id": "ESP32-01", "temperature_c": "NaN", "humidity_pct": 70},
        {"device_id": "ESP32-01", "temperature_c": "5.0", "humidity_pct": 70},
        {"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 70, "latitude": 10.0},
        {"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 70, "recorded_at": "2026-11-03T10:00:00"},
        {"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 70, "recorded_at": 1793700000},
    ],
)
def test_invalid_telemetry_is_422(api, payload):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    response = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json() == {"items": []}


def test_timezone_is_normalized_to_utc(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    response = client.post(
        f"/api/v1/shipments/{shipment_id}/telemetry",
        json={
            "device_id": "ESP32-01",
            "temperature_c": 5.0,
            "humidity_pct": 70,
            "recorded_at": "2026-11-03T17:00:00+07:00",
        },
    )
    assert response.status_code == 201
    assert response.json()["recorded_at"] == "2026-11-03T10:00:00Z"


def test_duplicate_missing_and_malformed_json(api):
    client, _app = api
    create_shipment(client)
    duplicate = client.post("/api/v1/shipments", json=SHIPMENT)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DUPLICATE_SHIPMENT_CODE"
    unknown = client.get("/api/v1/shipments/8b4fb8a2-2996-4da2-90b9-35019517f56f")
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "SHIPMENT_NOT_FOUND"
    malformed = client.post(
        "/api/v1/shipments", content=b"{broken", headers={"Content-Type": "application/json"}
    )
    assert malformed.status_code == 400
    assert malformed.json()["error"]["code"] == "INVALID_JSON"
    assert "Traceback" not in malformed.text


def test_seed_is_repeatable_and_has_example_event(api):
    client, app = api
    seed_demo(app.state.session_factory)
    seed_demo(app.state.session_factory)
    items = client.get("/api/v1/shipments").json()["items"]
    assert len(items) == 3
    demo_three = next(item for item in items if item["code"] == "SHIP-DEMO-003")
    events = client.get(f"/api/v1/shipments/{demo_three['id']}/events").json()["items"]
    assert len(events) == 1
    assert events[0]["type"] == "TEMPERATURE_BREACH_STARTED"


def test_unexpected_failure_has_safe_response(api):
    _client, app = api
    with TestClient(app, raise_server_exceptions=False) as client:
        with patch("app.api.routes.shipments.list_shipments", side_effect=RuntimeError("database secret")):
            response = client.get("/api/v1/shipments")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "Lỗi nội bộ", "details": []}
    }
    assert "database secret" not in response.text
