"""Version 1 REST endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import UUID4
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_session
from app.schemas.api import (
    EventListOut,
    DemoScenarioIn,
    DemoScenarioOut,
    HealthOut,
    ShipmentCreate,
    ShipmentOut,
    ShipmentsOut,
    TelemetryCreate,
    TelemetryListOut,
    TelemetryOut,
    SignedTelemetryCreate,
    SignedTelemetryOut,
    DeviceRegister,
    DeviceKeyRegister,
    DeviceStateUpdate,
    AssignmentUpdate,
    DeviceHealthListOut,
)
from app.services import shipments
from app.services import signed_ingestion
from app.models import SignedTelemetryReceipt
from app.services.device_health_service import shipment_devices


router = APIRouter(prefix="/api/v1")
demo_router = APIRouter(prefix="/api/v1/demo")
DbSession = Annotated[Session, Depends(get_session)]


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut()


@router.post("/shipments", response_model=ShipmentOut, response_model_exclude_unset=True, status_code=201)
def create_shipment(payload: ShipmentCreate, request: Request, session: DbSession):
    shipment = shipments.create_shipment(session, payload)
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.get("/shipments", response_model=ShipmentsOut, response_model_exclude_unset=True)
def list_shipments(request: Request, session: DbSession):
    items = [
        shipments.shipment_dict(session, item, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)
        for item in shipments.list_shipments(session)
    ]
    return {"items": items, "total": len(items)}


@router.get("/shipments/{shipment_id}", response_model=ShipmentOut, response_model_exclude_unset=True)
def get_shipment(shipment_id: UUID4, request: Request, session: DbSession):
    shipment = shipments.get_shipment(session, str(shipment_id))
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.post("/shipments/{shipment_id}/telemetry", response_model=SignedTelemetryOut | TelemetryOut,
             response_model_exclude_unset=True, status_code=201)
def add_telemetry(shipment_id: UUID4, payload: SignedTelemetryCreate | TelemetryCreate,
                  request: Request, response: Response, session: DbSession):
    if isinstance(payload, SignedTelemetryCreate):
        result = signed_ingestion.ingest(
            session, str(shipment_id), payload, request.app.state.clock,
            request.app.state.settings.sensor_gap_minutes,
            request.app.state.settings.signed_rate_limit_per_minute,
        )
        if result["duplicate"]:
            response.status_code = 200
        return result
    if request.app.state.settings.app_env != "development":
        raise signed_ingestion.IngestionError(403, "SIGNED_TELEMETRY_REQUIRED", "Signed telemetry is required")
    sample = shipments.add_telemetry(
        session, str(shipment_id), payload, request.app.state.clock, request.app.state.settings.sensor_gap_minutes,
        request.app.state.blockchain,
    )
    return shipments.telemetry_dict(sample)


def admin_session(request: Request, session: DbSession,
                  x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")) -> Session:
    signed_ingestion.require_admin(x_admin_key, request.app.state.settings.admin_api_key)
    return session


AdminSession = Annotated[Session, Depends(admin_session)]


@router.post("/devices", status_code=201)
def register_device(payload: DeviceRegister, session: AdminSession):
    device = signed_ingestion.register_device(
        session, payload.device_id, payload.key_id, payload.public_key_pem, payload.shipment_id,
    )
    return signed_ingestion.device_view(session, device)


@router.get("/devices/{device_id}")
def get_device(device_id: str, session: AdminSession):
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.post("/devices/{device_id}/keys", status_code=201)
def add_device_key(device_id: str, payload: DeviceKeyRegister, session: AdminSession):
    signed_ingestion.add_key(session, device_id, payload.key_id, payload.public_key_pem)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.patch("/devices/{device_id}")
def set_device_status(device_id: str, payload: DeviceStateUpdate, session: AdminSession):
    device = signed_ingestion.get_device(session, device_id)
    device.status = payload.status
    session.commit()
    return signed_ingestion.device_view(session, device)


@router.patch("/devices/{device_id}/keys/{key_id}")
def set_device_key_status(device_id: str, key_id: str, payload: DeviceStateUpdate, session: AdminSession):
    signed_ingestion.set_key_status(session, device_id, key_id, payload.status)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.post("/devices/{device_id}/assignments")
def set_device_assignment(device_id: str, payload: AssignmentUpdate, session: AdminSession):
    signed_ingestion.set_assignment(session, device_id, payload.shipment_id, payload.active)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.get("/shipments/{shipment_id}/telemetry", response_model=TelemetryListOut,
            response_model_exclude_unset=True)
def list_telemetry(shipment_id: UUID4, session: DbSession):
    samples = shipments.list_telemetry(session, str(shipment_id))
    receipts = {item.telemetry_id: item for item in session.scalars(
        select(SignedTelemetryReceipt).where(
            SignedTelemetryReceipt.telemetry_id.in_([sample.id for sample in samples])
        )
    )} if samples else {}
    return {
        "items": [
            shipments.telemetry_dict(sample, receipts.get(sample.id))
            for sample in samples
        ]
    }


@router.get("/shipments/{shipment_id}/events", response_model=EventListOut)
def list_events(shipment_id: UUID4, session: DbSession):
    return {
        "items": [
            shipments.event_dict(event)
            for event in shipments.list_events(session, str(shipment_id))
        ]
    }


@router.get("/shipments/{shipment_id}/devices", response_model=DeviceHealthListOut)
def list_shipment_devices(shipment_id: UUID4, request: Request, session: DbSession):
    return {"items": shipment_devices(
        session, str(shipment_id), request.app.state.clock,
        request.app.state.settings.sensor_gap_minutes,
    )}


@demo_router.post("/shipments/{shipment_id}/scenario", response_model=DemoScenarioOut)
def demo_scenario(shipment_id: UUID4, payload: DemoScenarioIn, request: Request, session: DbSession):
    from app.services.demo import run_scenario

    return run_scenario(
        session, str(shipment_id), payload, request.app.state.clock, request.app.state.settings.sensor_gap_minutes,
        request.app.state.blockchain,
    )
