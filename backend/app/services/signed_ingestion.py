"""Admin-managed device identities and transactional signed telemetry ingestion."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (Device, DeviceAssignment, DeviceKey, IngestionAudit,
                        SignedTelemetryReceipt, Telemetry)
from app.schemas.api import SignedTelemetryCreate, TelemetryCreate
from app.services import shipments
from app.services.telemetry_protocol import canonical_signed_bytes, verify_signature


logger = logging.getLogger(__name__)


class IngestionError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message
        super().__init__(message)


def require_admin(provided: str | None, expected: str) -> None:
    if not expected:
        raise IngestionError(503, "ADMIN_NOT_CONFIGURED", "Admin API is not configured")
    if not provided or not hmac.compare_digest(provided, expected):
        raise IngestionError(401, "UNAUTHORIZED", "Admin API key is invalid")


def _identity(value: str, name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value):
        raise IngestionError(422, "VALIDATION_ERROR", f"Invalid {name}")
    return value


def _public_key(value: str) -> str:
    try:
        key = serialization.load_pem_public_key(value.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError) as exc:
        raise IngestionError(422, "INVALID_PUBLIC_KEY", "Expected P-256 SPKI PEM") from exc
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise IngestionError(422, "INVALID_PUBLIC_KEY", "Expected P-256 SPKI PEM")
    return key.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode("ascii")


def _shipment_id(value: str) -> str:
    try:
        parsed = UUID(value)
        if parsed.version != 4 or str(parsed) != value:
            raise ValueError
    except (TypeError, ValueError, AttributeError) as exc:
        raise IngestionError(422, "VALIDATION_ERROR", "shipment_id must be a lowercase UUID v4") from exc
    return value


def register_device(session: Session, device_id: str, key_id: str, public_key_pem: str, shipment_id: str) -> Device:
    _identity(device_id, "device_id")
    _identity(key_id, "key_id")
    _shipment_id(shipment_id)
    pem = _public_key(public_key_pem)
    shipments.get_shipment(session, shipment_id)
    if session.get(Device, device_id):
        raise IngestionError(409, "DEVICE_EXISTS", "Device already exists")
    device = Device(id=device_id, status="active", last_sequence_number=0)
    session.add_all([
        device,
        DeviceKey(device_id=device_id, key_id=key_id, public_key_pem=pem, status="active"),
        DeviceAssignment(device_id=device_id, shipment_id=shipment_id, active=True),
    ])
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise IngestionError(409, "DEVICE_EXISTS", "Device already exists") from exc
    return device


def get_device(session: Session, device_id: str) -> Device:
    device = session.get(Device, device_id)
    if device is None:
        raise IngestionError(404, "DEVICE_NOT_FOUND", "Device not found")
    return device


def device_view(session: Session, device: Device) -> dict:
    return {
        "device_id": device.id, "status": device.status,
        "last_sequence_number": device.last_sequence_number,
        "last_seen_at": shipments.ensure_utc(device.last_seen_at),
        "keys": [{"key_id": key.key_id, "status": key.status} for key in session.scalars(
            select(DeviceKey).where(DeviceKey.device_id == device.id).order_by(DeviceKey.key_id)
        )],
        "assignments": [{"shipment_id": assignment.shipment_id, "active": assignment.active}
                        for assignment in session.scalars(select(DeviceAssignment).where(
                            DeviceAssignment.device_id == device.id).order_by(DeviceAssignment.shipment_id)
                        )],
    }


def add_key(session: Session, device_id: str, key_id: str, public_key_pem: str) -> None:
    get_device(session, device_id)
    _identity(key_id, "key_id")
    pem = _public_key(public_key_pem)
    if session.get(DeviceKey, (device_id, key_id)):
        raise IngestionError(409, "KEY_EXISTS", "Key ID already exists")
    session.add(DeviceKey(device_id=device_id, key_id=key_id, public_key_pem=pem, status="active"))
    session.commit()


def set_key_status(session: Session, device_id: str, key_id: str, status: str) -> None:
    key = session.get(DeviceKey, (device_id, key_id))
    if key is None:
        raise IngestionError(404, "KEY_NOT_FOUND", "Key not found")
    key.status = status
    session.commit()


def set_assignment(session: Session, device_id: str, shipment_id: str, active: bool) -> None:
    get_device(session, device_id)
    _shipment_id(shipment_id)
    shipments.get_shipment(session, shipment_id)
    assignment = session.get(DeviceAssignment, (device_id, shipment_id))
    if assignment is None:
        session.add(DeviceAssignment(device_id=device_id, shipment_id=shipment_id, active=active))
    else:
        assignment.active = active
    session.commit()


def _reject(session: Session, payload: SignedTelemetryCreate, code: str, status: int, message: str) -> None:
    session.add(IngestionAudit(
        id=str(uuid4()), shipment_id=payload.shipment_id, device_id=payload.device_id,
        sequence_number=payload.sequence_number, code=code, received_at=datetime.now(timezone.utc),
    ))
    session.commit()
    raise IngestionError(status, code, message)


def _response(sample: Telemetry, receipt: SignedTelemetryReceipt, duplicate: bool) -> dict:
    gap = ({"from": receipt.missing_from, "to": receipt.missing_to}
           if receipt.missing_from is not None else None)
    return {**shipments.telemetry_dict(sample), "signature_status": "VALID",
            "completeness_status": "DATA_INCOMPLETE" if gap else "COMPLETE",
            "sequence_number": receipt.sequence_number, "duplicate": duplicate,
            "missing_sequences": gap}


def ingest(session: Session, shipment_id: str, payload: SignedTelemetryCreate, clock,
           gap_minutes: int, rate_limit_per_minute: int,
           batch_max_records: int = 100, batch_max_age_minutes: int = 5,
           integrity_anchor=None) -> dict:
    if payload.shipment_id != shipment_id:
        _reject(session, payload, "SHIPMENT_MISMATCH", 422, "Body shipment_id does not match path")
    shipments.get_shipment(session, shipment_id)
    device = session.scalars(select(Device).where(Device.id == payload.device_id).with_for_update()).one_or_none()
    if device is None or device.status != "active":
        _reject(session, payload, "DEVICE_NOT_ACTIVE", 403, "Device is not active")
    assignment = session.get(DeviceAssignment, (device.id, shipment_id))
    if assignment is None or not assignment.active:
        _reject(session, payload, "DEVICE_NOT_ASSIGNED", 403, "Device is not assigned to shipment")
    key = session.get(DeviceKey, (device.id, payload.key_id))
    if key is None or key.status != "active":
        _reject(session, payload, "UNKNOWN_KEY", 401, "Key is unknown or revoked")
    value = payload.model_dump()
    try:
        signature_valid = verify_signature(value, key.public_key_pem.encode("ascii"))
    except ValueError:
        signature_valid = False
    if not signature_valid:
        _reject(session, payload, "INVALID_SIGNATURE", 401, "Signature verification failed")
    digest = hashlib.sha256(canonical_signed_bytes(value)).hexdigest()
    existing = session.scalar(select(SignedTelemetryReceipt).where(
        SignedTelemetryReceipt.device_id == device.id,
        SignedTelemetryReceipt.sequence_number == payload.sequence_number,
    ))
    if existing:
        if existing.canonical_sha256 != digest:
            _reject(session, payload, "SEQUENCE_CONFLICT", 409, "Sequence already has different content")
        sample = session.get(Telemetry, existing.telemetry_id)
        return _response(sample, existing, True)
    if payload.sequence_number <= device.last_sequence_number:
        _reject(session, payload, "SEQUENCE_REPLAY", 409, "Sequence is older than last accepted sequence")
    now = shipments.ensure_utc(clock.now())
    window_start = shipments.ensure_utc(device.rate_window_started_at)
    if window_start is None or now < window_start or now - window_start >= timedelta(minutes=1):
        device.rate_window_started_at = now
        device.rate_window_count = 0
    if device.rate_window_count >= rate_limit_per_minute:
        _reject(session, payload, "RATE_LIMITED", 429, "Device telemetry rate limit exceeded")
    gap = ((device.last_sequence_number + 1, payload.sequence_number - 1)
           if payload.sequence_number > device.last_sequence_number + 1 else None)
    sample = shipments.add_telemetry(
        session, shipment_id,
        TelemetryCreate(device_id=device.id, temperature_c=float(payload.temperature_c),
                        humidity_pct=float(payload.humidity_pct),
                        recorded_at=payload.recorded_at),
        clock, gap_minutes, None, commit=False, verified_only=True, sequence_gap=gap,
    )
    receipt = SignedTelemetryReceipt(
        telemetry_id=sample.id, shipment_id=shipment_id, device_id=device.id,
        key_id=payload.key_id, sequence_number=payload.sequence_number,
        payload_version=payload.payload_version, firmware_version=payload.firmware_version,
        temperature_milli_c=payload.temperature_milli_c, humidity_milli_pct=payload.humidity_milli_pct,
        signature=payload.signature, canonical_sha256=digest,
        missing_from=gap[0] if gap else None, missing_to=gap[1] if gap else None,
    )
    session.add(receipt)
    device.last_sequence_number = payload.sequence_number
    device.last_seen_at = sample.received_at
    device.rate_window_count += 1
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        # Database uniqueness is the final guard for concurrent requests.
        existing = session.scalar(select(SignedTelemetryReceipt).where(
            SignedTelemetryReceipt.device_id == payload.device_id,
            SignedTelemetryReceipt.sequence_number == payload.sequence_number,
        ))
        if existing and existing.canonical_sha256 == digest:
            return _response(session.get(Telemetry, existing.telemetry_id), existing, True)
        _reject(session, payload, "SEQUENCE_CONFLICT", 409, "Sequence already has different content")
    try:
        # Telemetry is already committed. Sealing is a separate transaction so
        # a batch failure can never roll back accepted sensor data.
        from app.services.batch_service import seal_ready_batch

        seal_ready_batch(
            session,
            shipment_id,
            device.id,
            now,
            max_records=batch_max_records,
            max_age_minutes=batch_max_age_minutes,
            anchor_coordinator=integrity_anchor,
        )
    except Exception:
        session.rollback()
        logger.exception(
            "Automatic integrity batch sealing failed shipment_id=%s device_id=%s",
            shipment_id,
            device.id,
        )
    return _response(sample, receipt, False)
