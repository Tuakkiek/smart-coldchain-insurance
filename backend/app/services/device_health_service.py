"""Derived device availability from accepted, signed server receipt times."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, DeviceAssignment
from app.services.clock import Clock
from app.services.shipments import ensure_utc, get_shipment


def health_view(device: Device, clock: Clock, offline_after_minutes: int) -> dict:
    last_seen = ensure_utc(device.last_seen_at)
    if last_seen is None:
        telemetry_status = "UNKNOWN"
    elif ensure_utc(clock.now()) - last_seen > timedelta(minutes=offline_after_minutes):
        telemetry_status = "OFFLINE"
    else:
        telemetry_status = "ONLINE"
    return {
        "device_id": device.id,
        "registration_status": device.status,
        "telemetry_status": telemetry_status,
        "last_seen_at": last_seen,
        "last_sequence_number": device.last_sequence_number,
    }


def shipment_devices(session: Session, shipment_id: str, clock: Clock,
                     offline_after_minutes: int) -> list[dict]:
    get_shipment(session, shipment_id)
    devices = session.scalars(
        select(Device).join(DeviceAssignment, DeviceAssignment.device_id == Device.id)
        .where(DeviceAssignment.shipment_id == shipment_id, DeviceAssignment.active.is_(True))
        .order_by(Device.id)
    )
    return [health_view(device, clock, offline_after_minutes) for device in devices]
