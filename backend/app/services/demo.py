"""Development scenarios evaluated by the normal telemetry service."""

from __future__ import annotations

import math
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Telemetry
from app.schemas.api import DemoScenarioIn, TelemetryCreate
from app.services.clock import Clock, VirtualClock
from app.services.shipments import add_telemetry, get_shipment, shipment_dict
from app.services.temperature_policy import utc
from app.services.blockchain_outbox import BlockchainCoordinator


class DemoScenarioError(Exception):
    pass


def run_scenario(
    session: Session, shipment_id: str, payload: DemoScenarioIn, clock: Clock, gap_minutes: int,
    blockchain: BlockchainCoordinator | None = None,
) -> dict:
    shipment = get_shipment(session, shipment_id)
    if payload.scenario == "normal":
        add_telemetry(
            session, shipment_id,
            TelemetryCreate(device_id="SIM-DEMO", temperature_c=shipment.temp_min_c, humidity_pct=70.0),
            clock=clock, gap_minutes=gap_minutes, blockchain=blockchain,
        )
        generated = 1
    else:
        latest = session.scalars(
            select(Telemetry).where(Telemetry.shipment_id == shipment_id)
            .order_by(Telemetry.received_at.desc(), Telemetry.id.desc()).limit(1)
        ).first()
        duration = shipment.violation_duration_minutes
        start = max(utc(shipment.created_at), utc(clock.now()) - timedelta(minutes=duration))
        if latest and start <= utc(latest.received_at):
            start = utc(latest.received_at) + timedelta(minutes=gap_minutes, microseconds=1)
        steps = math.ceil(duration / gap_minutes)
        if steps + 1 > 100:
            raise DemoScenarioError("Kịch bản cần quá 100 mẫu; hãy giảm thời lượng vi phạm")
        breach_temp = math.nextafter(shipment.temp_max_c, math.inf)
        if not math.isfinite(breach_temp):
            breach_temp = math.nextafter(shipment.temp_min_c, -math.inf)
        if not math.isfinite(breach_temp):
            raise DemoScenarioError("Không thể tạo nhiệt độ vi phạm hữu hạn cho lô hàng này")
        virtual = VirtualClock(start)
        for step in range(steps + 1):
            virtual.current = start + timedelta(minutes=min(step * gap_minutes, duration))
            add_telemetry(
                session, shipment_id,
                TelemetryCreate(device_id="SIM-DEMO", temperature_c=breach_temp, humidity_pct=70.0),
                clock=virtual, gap_minutes=gap_minutes, blockchain=blockchain,
            )
        generated = steps + 1
    return {
        "shipment_id": shipment_id,
        "scenario": payload.scenario,
        "generated_samples": generated,
        "shipment_status": shipment_dict(session, shipment, clock, gap_minutes)["status"],
    }
