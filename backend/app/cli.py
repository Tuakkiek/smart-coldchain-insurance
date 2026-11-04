"""Initialize the database and load repeatable demo shipments."""

from __future__ import annotations

import argparse
import re

from sqlalchemy import select
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import load_settings
from app.core.database import Base, make_engine, make_session_factory
from app.models import Shipment
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
                add_telemetry(
                    session,
                    shipment.id,
                    TelemetryCreate(device_id="SIM-DEMO-03", temperature_c=9.2, humidity_pct=72.5),
                )
            print(f"Created: {shipment.code} ({shipment.id})")


def create_database(database_url: str | URL) -> None:
    url = make_url(database_url)
    if url.get_backend_name() != "mysql" or not url.database:
        raise ValueError("A MySQL database name is required")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", url.database):
        raise ValueError("MYSQL_DATABASE may contain only letters, digits, _ or -")

    server_url = URL.create(
        url.drivername,
        username=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
        query=url.query,
    )
    engine = make_engine(server_url)
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                f"CREATE DATABASE IF NOT EXISTS `{url.database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
    finally:
        engine.dispose()
    print(f"MySQL database ready: {url.database}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("create-db", "init-db", "seed-demo"))
    args = parser.parse_args()
    settings = load_settings()
    try:
        if args.command == "create-db":
            create_database(settings.database_url)
            return
        engine = make_engine(settings.database_url)
        try:
            Base.metadata.create_all(engine)
            print("Database tables ready.")
            if args.command == "seed-demo":
                seed_demo(make_session_factory(engine))
        finally:
            engine.dispose()
    except ValueError as exc:
        parser.exit(2, f"Configuration error: {exc}\n")
    except SQLAlchemyError as exc:
        code = exc.orig.args[0] if hasattr(exc, "orig") and exc.orig.args else "unknown"
        parser.exit(2, f"MySQL operation failed (error {code}). Check .env, database and account privileges.\n")


if __name__ == "__main__":
    main()
