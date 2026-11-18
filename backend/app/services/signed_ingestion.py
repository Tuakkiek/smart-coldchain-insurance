"""Admin-managed device identities and transactional signed telemetry ingestion."""

from __future__ import annotations

import hashlib
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
from app.services.device_registry import DEFAULT_KEY_ID, DEVICE_IDS
from app.services.telemetry_protocol import canonical_signed_bytes, verify_signature


logger = logging.getLogger(__name__)


class IngestionError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message
        super().__init__(message)


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


def prepare_device(session: Session, device_id: str, device_name: str) -> Device:
    """Validate and stage a new device without committing the transaction."""
    _identity(device_id, "device_id")
    if device_id not in DEVICE_IDS:
        raise IngestionError(403, "FIXED_DEVICE_REGISTRY", "Device must be ESP32-01 through ESP32-10")
    device_name = device_name.strip()
    if not 1 <= len(device_name) <= 100:
        raise IngestionError(422, "VALIDATION_ERROR", "Device name must contain 1-100 characters")
    if session.get(Device, device_id):
        raise IngestionError(409, "DEVICE_EXISTS", "Device already exists")
    device = Device(id=device_id, device_name=device_name, status="active", last_sequence_number=0)
    session.add(device)
    return device


def register_device(session: Session, device_id: str, device_name: str) -> Device:
    """Internal setup helper for a fixed identity; unavailable through HTTP."""
    device = prepare_device(session, device_id, device_name)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise IngestionError(409, "DEVICE_EXISTS", "Device already exists") from exc
    return device


def get_device(session: Session, device_id: str, *, lock: bool = False) -> Device:
    if device_id not in DEVICE_IDS:
        raise IngestionError(404, "DEVICE_NOT_FOUND", "Device is not in the fixed ESP32 registry")
    device = (
        session.scalar(select(Device).where(Device.id == device_id).with_for_update()
                       .execution_options(populate_existing=True))
        if lock else session.get(Device, device_id)
    )
    if device is None:
        raise IngestionError(404, "DEVICE_NOT_FOUND", "Device not found")
    return device


def device_view(session: Session, device: Device) -> dict:
    keys = list(session.scalars(
        select(DeviceKey).where(DeviceKey.device_id == device.id).order_by(DeviceKey.key_id)
    ))
    assignments = list(session.scalars(
        select(DeviceAssignment).where(DeviceAssignment.device_id == device.id)
        .order_by(DeviceAssignment.shipment_id)
    ))
    active_shipments = [item.shipment_id for item in assignments if item.active]
    if len(active_shipments) > 1:
        raise IngestionError(409, "DEVICE_ALREADY_ASSIGNED", "Device has conflicting active assignments")
    current_shipment = shipments.get_shipment(session, active_shipments[0]) if active_shipments else None
    return {
        "device_id": device.id, "device_name": device.device_name, "status": device.status,
        "has_public_key": any(
            (device.id not in DEVICE_IDS or key.key_id == DEFAULT_KEY_ID) and key.status == "active"
            for key in keys
        ),
        "current_shipment_id": active_shipments[0] if active_shipments else None,
        "current_shipment_name": current_shipment.name if current_shipment is not None else None,
        "last_sequence_number": device.last_sequence_number,
        "last_seen_at": shipments.ensure_utc(device.last_seen_at),
        "keys": [{"key_id": key.key_id, "status": key.status} for key in keys],
        "assignments": [{"shipment_id": assignment.shipment_id, "active": assignment.active}
                        for assignment in assignments],
    }


def list_devices(session: Session) -> dict:
    items = [device_view(session, device) for device in session.scalars(
        select(Device).where(Device.id.in_(DEVICE_IDS)).order_by(Device.id)
    )]
    return {"items": items, "total": len(items)}


def add_key(session: Session, device_id: str, key_id: str, public_key_pem: str) -> None:
    get_device(session, device_id, lock=True)
    _identity(key_id, "key_id")
    pem = _public_key(public_key_pem)
    if session.get(DeviceKey, (device_id, key_id)):
        raise IngestionError(409, "KEY_EXISTS", "Key ID already exists")
    session.add(DeviceKey(device_id=device_id, key_id=key_id, public_key_pem=pem, status="active"))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise IngestionError(409, "KEY_EXISTS", "Key ID already exists") from exc


def set_key_status(session: Session, device_id: str, key_id: str, status: str) -> None:
    get_device(session, device_id, lock=True)
    key = session.scalar(select(DeviceKey).where(
        DeviceKey.device_id == device_id, DeviceKey.key_id == key_id,
    ).with_for_update().execution_options(populate_existing=True))
    if key is None:
        raise IngestionError(404, "KEY_NOT_FOUND", "Key not found")
    key.status = status
    session.commit()


def set_assignment(session: Session, device_id: str, shipment_id: str, active: bool) -> None:
    # Serialize with signed ingestion and other assignment/key changes on MySQL.
    device = get_device(session, device_id, lock=True)
    _shipment_id(shipment_id)
    target_shipment = shipments.get_shipment(session, shipment_id)
    if active:
        if target_shipment.status == "delivered":
            raise IngestionError(409, "SHIPMENT_COMPLETED", "Completed shipment cannot accept a device assignment")
        if device.status != "active":
            raise IngestionError(403, "DEVICE_NOT_ACTIVE", "Device is not active")
        other = session.scalar(select(DeviceAssignment).where(
            DeviceAssignment.device_id == device_id,
            DeviceAssignment.active.is_(True),
            DeviceAssignment.shipment_id != shipment_id,
        ).with_for_update())
        if other is not None:
            raise IngestionError(409, "DEVICE_ALREADY_ASSIGNED", "Unassign the current shipment first")
    assignment = session.scalar(select(DeviceAssignment).where(
        DeviceAssignment.device_id == device_id, DeviceAssignment.shipment_id == shipment_id,
    ).with_for_update().execution_options(populate_existing=True))
    if assignment is None:
        session.add(DeviceAssignment(device_id=device_id, shipment_id=shipment_id, active=active))
    else:
        assignment.active = active
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        # The unique generated-column index also protects direct/concurrent writes.
        assignment = session.get(DeviceAssignment, (device_id, shipment_id))
        if assignment is not None and assignment.active == active:
            return
        if "uq_device_assignment_active" in str(exc.orig) or "device_assignments.active_device_id" in str(exc.orig):
            raise IngestionError(409, "DEVICE_ALREADY_ASSIGNED", "Unassign the current shipment first") from exc
        raise


def _reject(
    session: Session,
    payload: SignedTelemetryCreate,
    code: str,
    status: int,
    message: str,
    *,
    shipment_id: str | None = None,
) -> None:
    session.add(IngestionAudit(
        id=str(uuid4()), shipment_id=shipment_id or payload.shipment_id, device_id=payload.device_id,
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
           gap_minutes: int, max_sample_gap_seconds: int, rate_limit_per_minute: int,
           batch_max_records: int = 100, batch_max_age_minutes: int = 5,
           integrity_anchor=None, insurance_blockchain=None, evidence_coordinator=None) -> dict:
    if payload.payload_version == 1 and payload.shipment_id != shipment_id:
        _reject(session, payload, "SHIPMENT_MISMATCH", 422, "Body shipment_id does not match path")
    if payload.payload_version == 2 and payload.shipment_id is not None:
        _reject(
            session, payload, "SHIPMENT_ID_NOT_ALLOWED", 422,
            "payload_version 2 must not contain shipment_id", shipment_id=shipment_id,
        )
    shipments.get_shipment(session, shipment_id)
    device = session.scalar(
        select(Device).where(Device.id == payload.device_id).with_for_update()
        .execution_options(populate_existing=True)
    )
    if device is None or payload.device_id not in DEVICE_IDS or device.status != "active":
        _reject(session, payload, "DEVICE_NOT_ACTIVE", 403, "Device is not active", shipment_id=shipment_id)
    # Locking reads see current committed rows on MySQL REPEATABLE READ even if
    # the earlier shipment lookup established an older consistent snapshot.
    assignment = session.scalar(select(DeviceAssignment).where(
        DeviceAssignment.device_id == device.id, DeviceAssignment.shipment_id == shipment_id,
    ).with_for_update().execution_options(populate_existing=True))
    if assignment is None or not assignment.active:
        _reject(session, payload, "DEVICE_NOT_ASSIGNED", 403, "Device is not assigned to shipment", shipment_id=shipment_id)
    key = session.scalar(select(DeviceKey).where(
        DeviceKey.device_id == device.id, DeviceKey.key_id == payload.key_id,
    ).with_for_update().execution_options(populate_existing=True))
    if key is None or payload.key_id != DEFAULT_KEY_ID or key.status != "active":
        _reject(session, payload, "UNKNOWN_KEY", 401, "Key is unknown or revoked", shipment_id=shipment_id)
    value = payload.model_dump()
    try:
        signature_valid = verify_signature(value, key.public_key_pem.encode("ascii"))
    except ValueError:
        signature_valid = False
    if not signature_valid:
        _reject(session, payload, "INVALID_SIGNATURE", 401, "Signature verification failed", shipment_id=shipment_id)
    digest = hashlib.sha256(canonical_signed_bytes(value)).hexdigest()
    existing = session.scalar(select(SignedTelemetryReceipt).where(
        SignedTelemetryReceipt.device_id == device.id,
        SignedTelemetryReceipt.sequence_number == payload.sequence_number,
    ).with_for_update())
    if existing:
        if existing.canonical_sha256 != digest:
            _reject(session, payload, "SEQUENCE_CONFLICT", 409, "Sequence already has different content", shipment_id=shipment_id)
        sample = session.scalar(select(Telemetry).where(Telemetry.id == existing.telemetry_id).with_for_update())
        return _response(sample, existing, True)
    if payload.sequence_number <= device.last_sequence_number:
        _reject(session, payload, "SEQUENCE_REPLAY", 409, "Sequence is older than last accepted sequence", shipment_id=shipment_id)
    now = shipments.ensure_utc(clock.now())
    window_start = shipments.ensure_utc(device.rate_window_started_at)
    if window_start is None or now < window_start or now - window_start >= timedelta(minutes=1):
        device.rate_window_started_at = now
        device.rate_window_count = 0
    if device.rate_window_count >= rate_limit_per_minute:
        _reject(session, payload, "RATE_LIMITED", 429, "Device telemetry rate limit exceeded", shipment_id=shipment_id)
    gap = ((device.last_sequence_number + 1, payload.sequence_number - 1)
           if payload.sequence_number > device.last_sequence_number + 1 else None)
    sample = shipments.add_telemetry(
        session, shipment_id,
        TelemetryCreate(device_id=device.id, temperature_c=float(payload.temperature_c),
                        humidity_pct=float(payload.humidity_pct),
                        recorded_at=payload.recorded_at),
        clock,
        gap_minutes,
        insurance_blockchain if evidence_coordinator is None else None,
        commit=False,
        verified_only=True,
        sequence_gap=gap,
        max_sample_gap_seconds=max_sample_gap_seconds,
        evidence_gate=evidence_coordinator is not None,
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
        _reject(session, payload, "SEQUENCE_CONFLICT", 409, "Sequence already has different content", shipment_id=shipment_id)
    try:
        # Telemetry is already committed. Sealing is a separate transaction so
        # a batch failure can never roll back accepted sensor data.
        from app.services.batch_service import BatchServiceError, seal_ready_batch, verify_batch

        gate_triggered = (
            evidence_coordinator is not None
            and shipments.get_shipment(session, shipment_id).insurance_status == "triggered"
        )
        while True:
            try:
                batch = seal_ready_batch(
                    session,
                    shipment_id,
                    device.id,
                    now,
                    max_records=batch_max_records,
                    max_age_minutes=batch_max_age_minutes,
                    force=gate_triggered,
                    anchor_coordinator=integrity_anchor,
                )
            except BatchServiceError as exc:
                if gate_triggered and exc.code == "NO_ELIGIBLE_TELEMETRY":
                    break
                raise
            if batch is None:
                break
            verify_batch(session, batch.id, now, integrity_anchor)
            if not gate_triggered:
                break
    except Exception:
        session.rollback()
        logger.exception(
            "Automatic integrity batch sealing failed shipment_id=%s device_id=%s",
            shipment_id,
            device.id,
        )
    if evidence_coordinator is not None:
        try:
            evidence_coordinator.reconcile(session, shipment_id)
        except Exception:
            session.rollback()
            logger.exception("Insurance evidence reconciliation failed shipment_id=%s", shipment_id)
    return _response(sample, receipt, False)


def ingest_for_current_assignment(
    session: Session,
    device_id: str,
    payload: SignedTelemetryCreate,
    clock,
    gap_minutes: int,
    max_sample_gap_seconds: int,
    rate_limit_per_minute: int,
    batch_max_records: int = 100,
    batch_max_age_minutes: int = 5,
    integrity_anchor=None,
    insurance_blockchain=None,
    evidence_coordinator=None,
) -> dict:
    """Authenticate a v2 device payload and bind it to the active DB assignment."""
    if payload.payload_version != 2:
        _reject(
            session, payload, "PAYLOAD_VERSION_UNSUPPORTED", 422,
            "Device telemetry endpoint requires payload_version 2",
        )
    if payload.device_id != device_id:
        _reject(
            session, payload, "DEVICE_MISMATCH", 422,
            "Body device_id does not match path",
        )

    # Assignment changes take the same device-row lock, so the assignment used
    # below cannot change between authentication and the telemetry commit.
    device = session.scalar(
        select(Device).where(Device.id == device_id).with_for_update()
        .execution_options(populate_existing=True)
    )
    if device is None or device_id not in DEVICE_IDS or device.status != "active":
        _reject(session, payload, "DEVICE_NOT_ACTIVE", 403, "Device is not active")
    key = session.scalar(select(DeviceKey).where(
        DeviceKey.device_id == device.id, DeviceKey.key_id == payload.key_id,
    ).with_for_update().execution_options(populate_existing=True))
    if key is None or payload.key_id != DEFAULT_KEY_ID or key.status != "active":
        _reject(session, payload, "UNKNOWN_KEY", 401, "Key is unknown or revoked")
    try:
        signature_valid = verify_signature(payload.model_dump(), key.public_key_pem.encode("ascii"))
    except ValueError:
        signature_valid = False
    if not signature_valid:
        _reject(session, payload, "INVALID_SIGNATURE", 401, "Signature verification failed")

    assignment = session.scalar(select(DeviceAssignment).where(
        DeviceAssignment.device_id == device.id,
        DeviceAssignment.active.is_(True),
    ).with_for_update().execution_options(populate_existing=True))
    if assignment is None:
        _reject(session, payload, "DEVICE_NOT_ASSIGNED", 403, "Device has no active shipment assignment")

    return ingest(
        session,
        assignment.shipment_id,
        payload,
        clock,
        gap_minutes,
        max_sample_gap_seconds,
        rate_limit_per_minute,
        batch_max_records,
        batch_max_age_minutes,
        integrity_anchor,
        insurance_blockchain,
        evidence_coordinator,
    )
