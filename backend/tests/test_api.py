from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.cli import seed_demo
from app.core.config import Settings
from app.core.database import Base
from app.main import create_app
from app.models import DeviceAssignment
from app.services.clock import VirtualClock


SHIPMENT = {
    "name": "SHIP-TEST-001",
    "cargo_type": "vaccine",
    "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
    "destination": {"name": "Điểm B", "latitude": 10.05, "longitude": 105.81},
    "temp_min_c": 2.0,
    "temp_max_c": 8.0,
    "violation_duration_minutes": 15,
    "insured_amount_vnd": 10000000,
}
from app.services.auth import create_access_token

ADMIN_TOKEN = create_access_token("admin", "test-jwt-secret-key-at-least-32-chars-long!")
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture
def api(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    app = create_app(Settings(
        database_url=database_url,
        admin_username="admin",
        admin_password="test-admin-password-12345",
        jwt_secret_key="test-jwt-secret-key-at-least-32-chars-long!",
    ))
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers=ADMIN) as client:
        yield client, app
    app.state.engine.dispose()


def create_shipment(client: TestClient) -> dict:
    response = client.post("/api/v1/shipments", json=SHIPMENT)
    assert response.status_code == 201, response.text
    return response.json()


def test_health_and_openapi(api):
    client, _app = api
    expected = {"status": "ok", "database": "ok", "blockchain": "unavailable"}
    assert client.get("/api/v1/health").json() == expected
    assert client.get("/api/v1/ready").json() == expected
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/shipments/{shipment_id}/telemetry" in paths
    assert "/api/v1/devices/{device_id}/telemetry" in paths
    assert "/api/v1/shipments/{shipment_id}/complete" in paths
    assert "/api/v1/ready" in paths
    assert client.get("/docs").status_code == 200


def test_complete_shipment_is_idempotent_and_closes_telemetry(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    telemetry = {
        "device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 60.0,
    }
    assert client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=telemetry).status_code == 201

    first = client.post(f"/api/v1/shipments/{shipment_id}/complete")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "delivered"
    assert body["telemetry_closed"] is True
    assert body["location"] == {
        "latitude": SHIPMENT["destination"]["latitude"],
        "longitude": SHIPMENT["destination"]["longitude"],
        "location_source": "admin_simulated", "progress_pct": 100.0,
    }
    assert body["delivery_result"] == "INCOMPLETE"
    assert body["delivery_result_reason"] == "UNSIGNED_TELEMETRY_PRESENT"

    second = client.post(f"/api/v1/shipments/{shipment_id}/complete")
    assert second.status_code == 200
    assert second.json()["delivered_at"] == body["delivered_at"]
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert sum(event["type"] == "SHIPMENT_DELIVERED" for event in events) == 1

    rejected = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json=telemetry)
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "SHIPMENT_COMPLETED"
    assert len(client.get(f"/api/v1/shipments/{shipment_id}/telemetry").json()["items"]) == 1


def test_health_is_live_but_readiness_fails_when_database_is_unavailable(api):
    client, _app = api
    result = {"status": "degraded", "database": "unavailable", "blockchain": "unavailable"}
    with patch("app.api.routes.service_health", return_value=result):
        assert client.get("/api/v1/health").status_code == 200
        ready = client.get("/api/v1/ready")
        assert ready.status_code == 503
        assert ready.json() == result


def test_create_list_detail_and_persistence(api):
    client, app = api
    created = create_shipment(client)
    assert UUID(created["id"]).version == 4
    assert created["shipment_id"] == created["id"]
    assert created["name"] == SHIPMENT["name"]
    assert "code" not in created
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
    with TestClient(fresh, headers=ADMIN) as second_client:
        assert second_client.get(f"/api/v1/shipments/{created['id']}").json() == created
    fresh.state.engine.dispose()


@pytest.mark.parametrize("name", ["", "   ", "a" * 256, 123, None])
def test_shipment_name_is_required_text_with_maximum_255_characters(api, name):
    client, _ = api
    assert client.post("/api/v1/shipments", json=SHIPMENT | {"name": name}).status_code == 422


def test_shipment_name_is_trimmed_and_legacy_code_is_rejected(api):
    client, _ = api
    response = client.post("/api/v1/shipments", json=SHIPMENT | {"name": "  Vaccine Cần Thơ  "})
    assert response.json()["name"] == "Vaccine Cần Thơ"
    payload = dict(SHIPMENT)
    payload["code"] = payload.pop("name")
    assert client.post("/api/v1/shipments", json=payload).status_code == 422


def test_delete_unused_shipment_requires_device_unassignment(api):
    client, app = api
    created = create_shipment(client)
    shipment_id = created["id"]
    from app.services.signed_ingestion import register_device
    with app.state.session_factory() as session:
        register_device(session, "ESP32-01", "Test sensor")
    assignment_url = "/api/v1/devices/ESP32-01/assignments"
    assert client.post(assignment_url, json={
        "shipment_id": shipment_id, "active": True,
    }).status_code == 200

    blocked = client.delete(f"/api/v1/shipments/{shipment_id}")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "SHIPMENT_HAS_ASSIGNED_DEVICES"

    # active=false is the existing unlink operation.
    assert client.post(assignment_url, json={
        "shipment_id": shipment_id, "active": False,
    }).status_code == 200
    deleted = client.delete(f"/api/v1/shipments/{shipment_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"shipment_id": shipment_id, "deleted": True}
    assert client.get(f"/api/v1/shipments/{shipment_id}").status_code == 404
    assert client.get("/api/v1/shipments").json() == {"items": [], "total": 0}
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count(DeviceAssignment.device_id))) == 0


def test_delete_shipment_preserves_operational_history(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    response = client.post(f"/api/v1/shipments/{shipment_id}/telemetry", json={
        "device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 70.0,
    })
    assert response.status_code == 201

    blocked = client.delete(f"/api/v1/shipments/{shipment_id}")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "SHIPMENT_HAS_DATA"
    assert client.get(f"/api/v1/shipments/{shipment_id}").status_code == 200


def test_delete_missing_shipment_returns_404(api):
    client, _app = api
    response = client.delete("/api/v1/shipments/8b4fb8a2-2996-4da2-90b9-35019517f56f")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SHIPMENT_NOT_FOUND"


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
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert [event["type"] for event in events] == [
        "TEMPERATURE_BREACH_STARTED", "TEMPERATURE_BREACH_ENDED",
    ]


def test_route_reaches_destination_and_stays_there(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    route = f"/api/v1/shipments/{shipment_id}/telemetry"
    for sample_number in range(1, 22):
        response = client.post(
            route,
            json={"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 72.5},
        )
        assert response.status_code == 201, response.text
        location = response.json()["location"]
        assert location["progress_pct"] == min(sample_number * 5.0, 100.0)
        assert location["latitude"] == pytest.approx(10.03 + 0.02 * location["progress_pct"] / 100)
        assert location["longitude"] == pytest.approx(105.77 + 0.04 * location["progress_pct"] / 100)
        assert location["location_source"] == "backend_simulated"

    detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
    history = client.get(route).json()["items"]
    assert len(history) == 21
    assert detail["location"] == history[-1]["location"]
    assert history[-1]["location"] == history[-2]["location"]


def test_continuous_breach_triggers_once_at_policy_duration(api):
    client, app = api
    start = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)
    clock = VirtualClock(start)
    app.state.clock = clock
    shipment_id = create_shipment(client)["id"]
    route = f"/api/v1/shipments/{shipment_id}/telemetry"

    for minute, temperature in [(0, 2.0), (1, 9.2), (6, 9.2), (11, 9.2), (15, 9.2)]:
        clock.current = start + timedelta(minutes=minute)
        response = client.post(route, json={
            "device_id": "ESP32-01", "temperature_c": temperature, "humidity_pct": 70.0,
            "recorded_at": "2025-01-01T00:00:00Z",
        })
        assert response.status_code == 201, response.text
    assert client.get(f"/api/v1/shipments/{shipment_id}").json()["insurance"]["status"] == "active"

    clock.current = start + timedelta(minutes=16)
    assert client.post(route, json={"device_id": "ESP32-01", "temperature_c": 9.2, "humidity_pct": 70.0}).status_code == 201
    detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
    assert detail["status"] == "insurance_triggered"
    assert detail["insurance"]["status"] == "triggered"
    assert detail["insurance"]["payout_status"] == "not_requested"
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert [item["type"] for item in events] == ["TEMPERATURE_BREACH_STARTED", "INSURANCE_TRIGGERED"]
    assert events[1]["details"]["breach_started_at"] == "2026-11-04T00:01:00Z"
    assert events[1]["details"]["duration_minutes"] == 15.0
    assert events[1]["details"]["consecutive_samples"] == 5
    assert events[1]["details"]["evidence_status"] == "EVIDENCE_REJECTED"
    assert events[1]["details"]["evidence_reason"] == "SIGNED_EVIDENCE_REQUIRED"

    clock.current = start + timedelta(minutes=17)
    client.post(route, json={"device_id": "ESP32-01", "temperature_c": 5.0, "humidity_pct": 70.0})
    clock.current = start + timedelta(minutes=18)
    client.post(route, json={"device_id": "ESP32-01", "temperature_c": 9.2, "humidity_pct": 70.0})
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert sum(event["type"] == "INSURANCE_TRIGGERED" for event in events) == 1
    clock.current = start + timedelta(minutes=24)
    disconnected = client.get(f"/api/v1/shipments/{shipment_id}").json()
    assert disconnected["status"] == "sensor_data_gap"
    assert disconnected["insurance"]["status"] == "triggered"


def test_recovery_resets_breach_and_sensor_gap_breaks_streak(api):
    client, app = api
    start = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)
    clock = VirtualClock(start)
    app.state.clock = clock
    shipment_id = create_shipment(client)["id"]
    route = f"/api/v1/shipments/{shipment_id}/telemetry"

    for minute, temperature in [(0, 9.2), (1, 5.0), (2, 9.2), (8, 9.2)]:
        clock.current = start + timedelta(minutes=minute)
        response = client.post(route, json={
            "device_id": "ESP32-01", "temperature_c": temperature, "humidity_pct": 70.0,
        })
        assert response.status_code == 201, response.text

    clock.current = start + timedelta(minutes=14)
    detail = client.get(f"/api/v1/shipments/{shipment_id}").json()
    assert detail["status"] == "sensor_data_gap"
    assert detail["insurance"]["status"] == "active"
    events = client.get(f"/api/v1/shipments/{shipment_id}/events").json()["items"]
    assert [event["type"] for event in events] == [
        "TEMPERATURE_BREACH_STARTED", "TEMPERATURE_BREACH_ENDED",
        "TEMPERATURE_BREACH_STARTED",
        "SENSOR_DATA_GAP", "TEMPERATURE_BREACH_STARTED",
    ]
    assert events[3]["details"]["gap_minutes"] == 6.0
    assert not any(event["type"] == "INSURANCE_TRIGGERED" for event in events)


def test_demo_scenario_route_does_not_exist(api):
    client, _app = api
    shipment_id = create_shipment(client)["id"]
    route = f"/api/v1/demo/shipments/{shipment_id}/scenario"
    response = client.post(route, json={"scenario": "normal"})
    assert response.status_code == 404
    assert route.replace(shipment_id, "{shipment_id}") not in client.get("/openapi.json").json()["paths"]


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
    first = create_shipment(client)
    duplicate = client.post("/api/v1/shipments", json=SHIPMENT)
    assert duplicate.status_code == 201
    assert duplicate.json()["name"] == first["name"]
    assert duplicate.json()["shipment_id"] != first["shipment_id"]
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
    demo_three = next(item for item in items if item["name"] == "SHIP-DEMO-003")
    events = client.get(f"/api/v1/shipments/{demo_three['id']}/events").json()["items"]
    assert len(events) == 1
    assert events[0]["type"] == "TEMPERATURE_BREACH_STARTED"


def test_unexpected_failure_has_safe_response(api):
    _client, app = api
    with TestClient(app, headers=ADMIN, raise_server_exceptions=False) as client:
        with patch("app.api.routes.shipments.list_shipments", side_effect=RuntimeError("database secret")):
            response = client.get("/api/v1/shipments")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "Lỗi nội bộ", "details": []}
    }
    assert "database secret" not in response.text
