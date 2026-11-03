"""Initialize the database and load repeatable demo shipments."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.config import load_settings
from app.core.database import Base, make_engine, make_session_factory
from app.models import Shipment, ShipmentEvent
from app.schemas.api import ShipmentCreate, TelemetryCreate
from app.services.shipments import add_telemetry, create_shipment


DEMO_SHIPMENTS = [
    {
        "code": "SHIP-DEMO-001",
        "cargo_type": "vaccine",
        "origin": {"name": "Kho Cần Thơ", "latitude": 10.03, "longitude": 105.77},
        "destination": {"name": "Bệnh viện A", "latitude": 10.05, "longitude": 105.81},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "insured_amount_vnd": 10000000,
    },
    {
        "code": "SHIP-DEMO-002",
        "cargo_type": "fresh_food",
        "origin": {"name": "Kho Long An", "latitude": 10.54, "longitude": 106.41},
        "destination": {"name": "Siêu thị B", "latitude": 10.77, "longitude": 106.69},
        "temp_min_c": 0.0,
        "temp_max_c": 5.0,
        "insured_amount_vnd": 5000000,
    },
    {
        "code": "SHIP-DEMO-003",
        "cargo_type": "medicine",
        "origin": {"name": "Kho HCM", "latitude": 10.82, "longitude": 106.63},
        "destination": {"name": "Nhà thuốc C", "latitude": 10.75, "longitude": 106.70},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "insured_amount_vnd": 8000000,
    },
]


def seed_demo(session_factory) -> None:
    with session_factory() as session:
        for index, data in enumerate(DEMO_SHIPMENTS):
            existing = session.scalar(select(Shipment).where(Shipment.code == data["code"]))
            if existing is not None:
                print(f"Exists: {existing.code} ({existing.id})")
                continue
            shipment = create_shipment(session, ShipmentCreate.model_validate(data))
            if index == 1:
                add_telemetry(
                    session,
                    shipment.id,
                    TelemetryCreate(device_id="SIM-DEMO-02", temperature_c=3.0, humidity_pct=65.0),
                )
            elif index == 2:
                sample = add_telemetry(
                    session,
                    shipment.id,
                    TelemetryCreate(device_id="SIM-DEMO-03", temperature_c=9.2, humidity_pct=72.5),
                )
                session.add(
                    ShipmentEvent(
                        id=str(uuid4()),
                        shipment_id=shipment.id,
                        type="TEMPERATURE_BREACH_STARTED",
                        occurred_at=datetime.now(timezone.utc),
                        details={
                            "temperature_c": sample.temperature_c,
                            "temp_min_c": shipment.temp_min_c,
                            "temp_max_c": shipment.temp_max_c,
                        },
                    )
                )
                session.commit()
            print(f"Created: {shipment.code} ({shipment.id})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init-db", "seed-demo"))
    args = parser.parse_args()
    settings = load_settings()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    print("Database tables ready.")
    if args.command == "seed-demo":
        seed_demo(make_session_factory(engine))
    engine.dispose()


if __name__ == "__main__":
    main()
