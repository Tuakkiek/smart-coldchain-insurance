"""Version 1 REST endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import UUID4
from sqlalchemy.orm import Session

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
)
from app.services import shipments


router = APIRouter(prefix="/api/v1")
demo_router = APIRouter(prefix="/api/v1/demo")
DbSession = Annotated[Session, Depends(get_session)]


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut()


@router.post("/shipments", response_model=ShipmentOut, status_code=201)
def create_shipment(payload: ShipmentCreate, request: Request, session: DbSession):
    shipment = shipments.create_shipment(session, payload)
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.get("/shipments", response_model=ShipmentsOut)
def list_shipments(request: Request, session: DbSession):
    items = [
        shipments.shipment_dict(session, item, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)
        for item in shipments.list_shipments(session)
    ]
    return {"items": items, "total": len(items)}


@router.get("/shipments/{shipment_id}", response_model=ShipmentOut)
def get_shipment(shipment_id: UUID4, request: Request, session: DbSession):
    shipment = shipments.get_shipment(session, str(shipment_id))
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.post("/shipments/{shipment_id}/telemetry", response_model=TelemetryOut, status_code=201)
def add_telemetry(shipment_id: UUID4, payload: TelemetryCreate, request: Request, session: DbSession):
    sample = shipments.add_telemetry(
        session, str(shipment_id), payload, request.app.state.clock, request.app.state.settings.sensor_gap_minutes,
        request.app.state.blockchain,
    )
    return shipments.telemetry_dict(sample)


@router.get("/shipments/{shipment_id}/telemetry", response_model=TelemetryListOut)
def list_telemetry(shipment_id: UUID4, session: DbSession):
    return {
        "items": [
            shipments.telemetry_dict(sample)
            for sample in shipments.list_telemetry(session, str(shipment_id))
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


@demo_router.post("/shipments/{shipment_id}/scenario", response_model=DemoScenarioOut)
def demo_scenario(shipment_id: UUID4, payload: DemoScenarioIn, request: Request, session: DbSession):
    from app.services.demo import run_scenario

    return run_scenario(
        session, str(shipment_id), payload, request.app.state.clock, request.app.state.settings.sensor_gap_minutes,
        request.app.state.blockchain,
    )
