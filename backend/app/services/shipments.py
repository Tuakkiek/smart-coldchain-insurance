"""Shipment persistence and API projections."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from itertools import chain
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Shipment, ShipmentEvent, Telemetry
from app.schemas.api import ShipmentCreate, TelemetryCreate
from app.services.route_simulator import location_for_sample
from app.services.clock import Clock, SYSTEM_CLOCK
from app.services.temperature_policy import evaluate, utc


class ShipmentNotFound(Exception):
    pass


class DuplicateShipmentCode(Exception):
    pass


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def create_shipment(session: Session, payload: ShipmentCreate) -> Shipment:
    shipment = Shipment(
        id=str(uuid4()),
        code=payload.code,
        cargo_type=payload.cargo_type,
        origin_name=payload.origin.name,
        origin_latitude=payload.origin.latitude,
        origin_longitude=payload.origin.longitude,
        destination_name=payload.destination.name,
        destination_latitude=payload.destination.latitude,
        destination_longitude=payload.destination.longitude,
        temp_min_c=payload.temp_min_c,
        temp_max_c=payload.temp_max_c,
        violation_duration_minutes=payload.violation_duration_minutes,
        insured_amount_vnd=payload.insured_amount_vnd,
        status="created",
        insurance_status="active",
        payout_status="not_requested",
        created_at=datetime.now(timezone.utc),
    )
    session.add(shipment)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        # The only unique constraint on this insert is shipments.code.
        raise DuplicateShipmentCode from exc
    return shipment


def get_shipment(session: Session, shipment_id: str) -> Shipment:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        raise ShipmentNotFound
    return shipment


def list_shipments(session: Session) -> list[Shipment]:
    return list(session.scalars(select(Shipment).order_by(Shipment.created_at, Shipment.id)))


def list_telemetry(session: Session, shipment_id: str) -> list[Telemetry]:
    get_shipment(session, shipment_id)
    return list(
        session.scalars(
            select(Telemetry)
            .where(Telemetry.shipment_id == shipment_id)
            .order_by(Telemetry.received_at, Telemetry.id)
        )
    )


def list_events(session: Session, shipment_id: str) -> list[ShipmentEvent]:
    get_shipment(session, shipment_id)
    return list(
        session.scalars(
            select(ShipmentEvent)
            .where(ShipmentEvent.shipment_id == shipment_id)
            .order_by(ShipmentEvent.occurred_at, ShipmentEvent.id)
        )
    )


def add_telemetry(
    session: Session,
    shipment_id: str,
    payload: TelemetryCreate,
    clock: Clock = SYSTEM_CLOCK,
    gap_minutes: int = 5,
) -> Telemetry:
    # Serialize samples for the same shipment on MySQL so each gets a distinct
    # progress step even when two device requests arrive at once.
    shipment = session.scalars(
        select(Shipment).where(Shipment.id == shipment_id).with_for_update()
    ).one_or_none()
    if shipment is None:
        raise ShipmentNotFound
    sample_count = session.scalar(
        select(func.count(Telemetry.id)).where(Telemetry.shipment_id == shipment_id)
    ) or 0
    prior_samples = session.scalars(
        select(Telemetry)
        .where(Telemetry.shipment_id == shipment_id)
        .order_by(Telemetry.received_at.desc(), Telemetry.id.desc())
    ).yield_per(100)
    try:
        latest = next(prior_samples, None)
        received_at = utc(clock.now())
        if latest and received_at <= utc(latest.received_at):
            received_at = utc(latest.received_at) + timedelta(microseconds=1)
        history = chain((latest,), prior_samples) if latest else ()
        decision = evaluate(shipment, history, payload.temperature_c, received_at, gap_minutes)
    finally:
        prior_samples.close()
    latitude, longitude, progress_pct = location_for_sample(shipment, sample_count + 1)
    sample = Telemetry(
        id=str(uuid4()),
        shipment_id=shipment_id,
        device_id=payload.device_id,
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        recorded_at=payload.recorded_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        progress_pct=progress_pct,
        location_source="backend_simulated",
    )
    session.add(sample)
    for event_type, details in decision.events:
        session.add(ShipmentEvent(
            id=str(uuid4()), shipment_id=shipment_id, type=event_type,
            occurred_at=received_at, details=details,
        ))
    if decision.triggered:
        shipment.insurance_status = "triggered"
    shipment.status = "insurance_triggered" if shipment.insurance_status == "triggered" else "in_transit"
    session.commit()
    return sample


def location_dict(sample: Telemetry) -> dict:
    return {
        "latitude": sample.latitude,
        "longitude": sample.longitude,
        "location_source": sample.location_source,
        "progress_pct": sample.progress_pct,
    }


def telemetry_dict(sample: Telemetry) -> dict:
    return {
        "id": sample.id,
        "shipment_id": sample.shipment_id,
        "device_id": sample.device_id,
        "temperature_c": sample.temperature_c,
        "humidity_pct": sample.humidity_pct,
        "recorded_at": ensure_utc(sample.recorded_at),
        "received_at": ensure_utc(sample.received_at),
        "location": location_dict(sample),
    }


def shipment_dict(
    session: Session, shipment: Shipment, clock: Clock = SYSTEM_CLOCK, gap_minutes: int = 5,
) -> dict:
    latest = session.scalars(
        select(Telemetry)
        .where(Telemetry.shipment_id == shipment.id)
        .order_by(Telemetry.received_at.desc(), Telemetry.id.desc())
        .limit(1)
    ).first()
    latest_dict = telemetry_dict(latest) if latest else None
    if latest_dict is not None:
        latest_dict.pop("shipment_id")
        latest_dict.pop("location")
    blockchain = None
    if shipment.blockchain_network is not None:
        blockchain = {
            "network": shipment.blockchain_network,
            "transaction_hash": shipment.transaction_hash,
            "confirmation_status": shipment.confirmation_status,
        }
    status = shipment.status
    if latest and utc(clock.now()) - utc(latest.received_at) > timedelta(minutes=gap_minutes):
        status = "sensor_data_gap"
    return {
        "id": shipment.id,
        "code": shipment.code,
        "cargo_type": shipment.cargo_type,
        "status": status,
        "origin": {
            "name": shipment.origin_name,
            "latitude": shipment.origin_latitude,
            "longitude": shipment.origin_longitude,
        },
        "destination": {
            "name": shipment.destination_name,
            "latitude": shipment.destination_latitude,
            "longitude": shipment.destination_longitude,
        },
        "temp_min_c": shipment.temp_min_c,
        "temp_max_c": shipment.temp_max_c,
        "violation_duration_minutes": shipment.violation_duration_minutes,
        "latest_telemetry": latest_dict,
        "location": location_dict(latest) if latest else None,
        "insurance": {
            "insured_amount_vnd": shipment.insured_amount_vnd,
            "status": shipment.insurance_status,
            "payout_status": shipment.payout_status,
        },
        "blockchain": blockchain,
        "created_at": ensure_utc(shipment.created_at),
    }


def event_dict(event: ShipmentEvent) -> dict:
    return {
        "id": event.id,
        "shipment_id": event.shipment_id,
        "type": event.type,
        "occurred_at": ensure_utc(event.occurred_at),
        "details": event.details,
    }
