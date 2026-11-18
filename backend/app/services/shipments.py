"""Shipment persistence and API projections."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from itertools import chain
from uuid import uuid4

from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from app.models import (DeviceAssignment, IngestionAudit, IntegrityBatch, Shipment,
                        ShipmentEvent, SignedTelemetryReceipt, Telemetry)
from app.schemas.api import ShipmentCreate, TelemetryCreate
from app.services.route_simulator import location_for_sample
from app.services.clock import Clock, SYSTEM_CLOCK
from app.services.temperature_policy import evaluate, utc
from app.services.blockchain_outbox import BlockchainCoordinator, RAW_TRANSACTION_KEY
from app.services.eth_units import SEPOLIA_CHAIN_ID, SEPOLIA_CURRENCY
from app.services.policy_blockchain import PolicyCoordinator


class ShipmentNotFound(Exception):
    pass


class ShipmentDeleteConflict(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def create_shipment(
    session: Session,
    payload: ShipmentCreate,
    *,
    policy_coordinator: PolicyCoordinator | None = None,
    default_contract_address: str = "",
    default_expiry_days: int = 30,
) -> Shipment:
    now = datetime.now(timezone.utc)
    is_sepolia_eth = payload.resolved_currency == SEPOLIA_CURRENCY
    contract_address = (
        policy_coordinator.contract_address
        if policy_coordinator is not None and policy_coordinator.contract_address
        else default_contract_address
    ) or None
    chain_id = (
        policy_coordinator.chain_id
        if policy_coordinator is not None
        else SEPOLIA_CHAIN_ID
    ) if is_sepolia_eth else None
    expiry_days = payload.policy_expiry_days or default_expiry_days
    shipment = Shipment(
        id=str(uuid4()),
        name=payload.name,
        cargo_type=payload.cargo_type,
        origin_name=payload.origin.name,
        origin_formatted_address=payload.origin.formatted_address,
        origin_place_id=payload.origin.place_id,
        origin_latitude=payload.origin.latitude,
        origin_longitude=payload.origin.longitude,
        destination_name=payload.destination.name,
        destination_formatted_address=payload.destination.formatted_address,
        destination_place_id=payload.destination.place_id,
        destination_latitude=payload.destination.latitude,
        destination_longitude=payload.destination.longitude,
        temp_min_c=payload.temp_min_c,
        temp_max_c=payload.temp_max_c,
        violation_duration_minutes=payload.violation_duration_minutes,
        insured_amount_vnd=payload.insured_amount_vnd or 0,
        insurance_amount=payload.resolved_eth_amount,
        insurance_amount_wei=payload.resolved_wei_amount,
        insurance_currency=payload.resolved_currency,
        blockchain_chain_id=chain_id,
        buyer_wallet_address=payload.resolved_buyer_wallet,
        policy_contract_address=contract_address if is_sepolia_eth else None,
        policy_transaction_hash=None,
        policy_status="PENDING" if is_sepolia_eth else None,
        policy_last_error=None,
        policy_expiry=(now + timedelta(days=expiry_days)) if is_sepolia_eth else None,
        status="created",
        insurance_status="active",
        payout_status="not_requested",
        created_at=now,
    )
    session.add(shipment)
    session.commit()

    if is_sepolia_eth and policy_coordinator is not None and policy_coordinator.can_submit_server_side:
        shipment = policy_coordinator.create_or_retry_policy(
            session,
            shipment.id,
            wait_timeout_seconds=min(policy_coordinator.receipt_timeout_seconds, 5),
        )
    return shipment


def get_shipment(session: Session, shipment_id: str) -> Shipment:
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        raise ShipmentNotFound
    return shipment


def list_shipments(session: Session) -> list[Shipment]:
    return list(session.scalars(select(Shipment).order_by(Shipment.created_at, Shipment.id)))


def delete_shipment(session: Session, shipment_id: str) -> None:
    """Delete an unused shipment without removing operational evidence."""
    shipment = session.scalar(
        select(Shipment).where(Shipment.id == shipment_id).with_for_update()
    )
    if shipment is None:
        raise ShipmentNotFound

    active_assignment = session.scalar(select(DeviceAssignment.device_id).where(
        DeviceAssignment.shipment_id == shipment_id,
        DeviceAssignment.active.is_(True),
    ).limit(1))
    if active_assignment is not None:
        raise ShipmentDeleteConflict(
            "SHIPMENT_HAS_ASSIGNED_DEVICES",
            "Unassign all devices from the shipment before deleting it",
        )

    # These records form the shipment's operational and integrity history.
    # Keep them intact instead of cascading a destructive delete.
    has_telemetry = session.scalar(select(Telemetry.id).where(
        Telemetry.shipment_id == shipment_id,
    ).limit(1)) is not None
    has_event = session.scalar(select(ShipmentEvent.id).where(
        ShipmentEvent.shipment_id == shipment_id,
    ).limit(1)) is not None
    has_batch = session.scalar(select(IntegrityBatch.id).where(
        IntegrityBatch.shipment_id == shipment_id,
    ).limit(1)) is not None
    has_audit = session.scalar(select(IngestionAudit.id).where(
        IngestionAudit.shipment_id == shipment_id,
    ).limit(1)) is not None
    has_blockchain_record = (
        shipment.blockchain_network is not None
        or shipment.transaction_hash is not None
        or shipment.policy_transaction_hash is not None
        or shipment.policy_status in {"SUBMITTED", "CONFIRMED"}
    )
    if has_telemetry or has_event or has_batch or has_audit or has_blockchain_record:
        raise ShipmentDeleteConflict(
            "SHIPMENT_HAS_DATA",
            "Shipment has operational history and cannot be deleted",
        )

    # Inactive assignments are setup history only and are safe to remove for a
    # shipment that never produced operational data.
    session.execute(delete(DeviceAssignment).where(DeviceAssignment.shipment_id == shipment_id))
    session.delete(shipment)
    session.commit()


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
            .order_by(
                ShipmentEvent.occurred_at,
                case(
                    (ShipmentEvent.type == "SENSOR_DATA_GAP", 0),
                    (ShipmentEvent.type == "TEMPERATURE_BREACH_STARTED", 1),
                    (ShipmentEvent.type == "INSURANCE_TRIGGERED", 2),
                    else_=3,
                ),
                ShipmentEvent.id,
            )
        )
    )


def add_telemetry(
    session: Session,
    shipment_id: str,
    payload: TelemetryCreate,
    clock: Clock = SYSTEM_CLOCK,
    gap_minutes: int = 5,
    blockchain: BlockchainCoordinator | None = None,
    *,
    commit: bool = True,
    verified_only: bool = False,
    sequence_gap: tuple[int, int] | None = None,
    max_sample_gap_seconds: int | None = None,
    evidence_gate: bool = False,
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
    latest_received = session.scalar(
        select(Telemetry.received_at).where(Telemetry.shipment_id == shipment_id)
        .order_by(Telemetry.received_at.desc(), Telemetry.id.desc()).limit(1)
    )
    history_query = select(Telemetry).where(
        Telemetry.shipment_id == shipment_id,
        Telemetry.device_id == payload.device_id,
    )
    if verified_only:
        history_query = history_query.join(SignedTelemetryReceipt, SignedTelemetryReceipt.telemetry_id == Telemetry.id)
    prior_samples = session.scalars(
        history_query.order_by(Telemetry.received_at.desc(), Telemetry.id.desc())
    ).yield_per(100)
    try:
        latest = next(prior_samples, None)
        received_at = utc(clock.now())
        if latest_received and received_at <= utc(latest_received):
            received_at = utc(latest_received) + timedelta(microseconds=1)
        history = chain((latest,), prior_samples) if latest else ()
        decision = evaluate(
            shipment,
            history,
            payload.temperature_c,
            received_at,
            gap_minutes,
            sequence_gap,
            max_sample_gap_seconds,
        )
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
        event_id = str(uuid4())
        if event_type == "INSURANCE_TRIGGERED":
            details = {
                **details,
                "device_id": payload.device_id,
                "violation_evidence_id": str(uuid4()),
                "policy_version": "ANCHORED-EVIDENCE-v1",
                "first_received_at": details["breach_started_at"],
                "last_received_at": received_at.isoformat().replace("+00:00", "Z"),
                "evidence_status": "EVIDENCE_PENDING" if evidence_gate else "LEGACY_UNGATED",
            }
        event = ShipmentEvent(
            id=event_id, shipment_id=shipment_id, type=event_type,
            occurred_at=received_at, details=details,
        )
        session.add(event)
        if event_type == "INSURANCE_TRIGGERED" and blockchain is not None and not evidence_gate:
            blockchain.queue(shipment, event)
    if decision.triggered:
        shipment.insurance_status = "triggered"
        if evidence_gate:
            shipment.payout_status = "evidence_pending"
    shipment.status = "insurance_triggered" if shipment.insurance_status == "triggered" else "in_transit"
    if commit:
        session.commit()
    else:
        session.flush()
    if commit and decision.triggered and blockchain is not None:
        blockchain.dispatch(session, shipment_id)
    return sample


def location_dict(sample: Telemetry) -> dict:
    return {
        "latitude": sample.latitude,
        "longitude": sample.longitude,
        "location_source": sample.location_source,
        "progress_pct": sample.progress_pct,
    }


def telemetry_dict(sample: Telemetry, receipt: SignedTelemetryReceipt | None = None) -> dict:
    value = {
        "id": sample.id,
        "shipment_id": sample.shipment_id,
        "device_id": sample.device_id,
        "temperature_c": sample.temperature_c,
        "humidity_pct": sample.humidity_pct,
        "recorded_at": ensure_utc(sample.recorded_at),
        "received_at": ensure_utc(sample.received_at),
        "location": location_dict(sample),
    }
    if receipt is not None:
        gap = ({"from": receipt.missing_from, "to": receipt.missing_to}
               if receipt.missing_from is not None else None)
        value.update({"signature_status": "VALID", "sequence_number": receipt.sequence_number,
                      "completeness_status": "DATA_INCOMPLETE" if gap else "COMPLETE",
                      "missing_sequences": gap})
    return value


def shipment_dict(
    session: Session, shipment: Shipment, clock: Clock = SYSTEM_CLOCK, gap_minutes: int = 5,
) -> dict:
    latest = session.scalars(
        select(Telemetry)
        .where(Telemetry.shipment_id == shipment.id)
        .order_by(Telemetry.received_at.desc(), Telemetry.id.desc())
        .limit(1)
    ).first()
    latest_dict = telemetry_dict(latest, session.get(SignedTelemetryReceipt, latest.id)) if latest else None
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
        if shipment.blockchain_chain_id is not None:
            blockchain["chain_id"] = shipment.blockchain_chain_id
        if shipment.policy_contract_address is not None:
            blockchain["contract_address"] = shipment.policy_contract_address
        if shipment.policy_transaction_hash is not None:
            blockchain["policy_transaction_hash"] = shipment.policy_transaction_hash
        if shipment.policy_status is not None:
            blockchain["policy_status"] = shipment.policy_status

    origin_data: dict = {
        "name": shipment.origin_name,
        "latitude": shipment.origin_latitude,
        "longitude": shipment.origin_longitude,
    }
    if shipment.origin_formatted_address is not None:
        origin_data["formatted_address"] = shipment.origin_formatted_address
    if shipment.origin_place_id is not None:
        origin_data["place_id"] = shipment.origin_place_id

    destination_data: dict = {
        "name": shipment.destination_name,
        "latitude": shipment.destination_latitude,
        "longitude": shipment.destination_longitude,
    }
    if shipment.destination_formatted_address is not None:
        destination_data["formatted_address"] = shipment.destination_formatted_address
    if shipment.destination_place_id is not None:
        destination_data["place_id"] = shipment.destination_place_id

    insurance_data: dict = {
        "insured_amount_vnd": shipment.insured_amount_vnd,
        "status": shipment.insurance_status,
        "payout_status": shipment.payout_status,
    }
    if (
        shipment.insurance_currency != "VND"
        or shipment.insurance_amount is not None
        or shipment.buyer_wallet_address is not None
        or shipment.policy_status is not None
    ):
        insurance_data.update({
            "coverage_amount": shipment.insurance_amount,
            "coverage_amount_wei": shipment.insurance_amount_wei,
            "currency": shipment.insurance_currency,
            "chain_id": shipment.blockchain_chain_id,
            "buyer_wallet_address": shipment.buyer_wallet_address,
            "policy_contract_address": shipment.policy_contract_address,
            "policy_transaction_hash": shipment.policy_transaction_hash,
            "policy_status": shipment.policy_status,
            "policy_last_error": shipment.policy_last_error,
        })

    status = shipment.status
    if latest and utc(clock.now()) - utc(latest.received_at) > timedelta(minutes=gap_minutes):
        status = "sensor_data_gap"
    result: dict = {
        "id": shipment.id,
        "shipment_id": shipment.id,
        "name": shipment.name,
        "cargo_type": shipment.cargo_type,
        "status": status,
        "origin": origin_data,
        "destination": destination_data,
        "temp_min_c": shipment.temp_min_c,
        "temp_max_c": shipment.temp_max_c,
        "violation_duration_minutes": shipment.violation_duration_minutes,
        "latest_telemetry": latest_dict,
        "location": location_dict(latest) if latest else None,
        "insurance": insurance_data,
        "blockchain": blockchain,
        "created_at": ensure_utc(shipment.created_at),
    }
    if shipment.buyer_wallet_address is not None:
        result["buyer_wallet_address"] = shipment.buyer_wallet_address
    return result


def event_dict(event: ShipmentEvent) -> dict:
    return {
        "id": event.id,
        "shipment_id": event.shipment_id,
        "type": event.type,
        "occurred_at": ensure_utc(event.occurred_at),
        "details": {key: value for key, value in event.details.items() if key != RAW_TRANSACTION_KEY},
    }
