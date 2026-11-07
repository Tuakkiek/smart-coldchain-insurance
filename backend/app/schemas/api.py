"""Request and response contracts for /api/v1."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Place(StrictBody):
    name: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class ShipmentCreate(StrictBody):
    code: str = Field(min_length=1, max_length=64)
    cargo_type: str = Field(min_length=1, max_length=100)
    origin: Place
    destination: Place
    temp_min_c: float = Field(allow_inf_nan=False, strict=True)
    temp_max_c: float = Field(allow_inf_nan=False, strict=True)
    violation_duration_minutes: int = Field(default=15, gt=0, strict=True)
    insured_amount_vnd: int = Field(ge=0, strict=True)

    @field_validator("code", "cargo_type")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def valid_temperature_range(self) -> ShipmentCreate:
        if self.temp_min_c >= self.temp_max_c:
            raise ValueError("temp_min_c must be smaller than temp_max_c")
        return self


class TelemetryCreate(StrictBody):
    device_id: str = Field(min_length=1, max_length=100)
    temperature_c: float = Field(allow_inf_nan=False, strict=True)
    humidity_pct: float = Field(ge=0, le=100, allow_inf_nan=False, strict=True)
    recorded_at: datetime | None = None

    @field_validator("device_id")
    @classmethod
    def nonblank_device_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("recorded_at")
    @classmethod
    def utc_recorded_at(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("recorded_at must include a timezone")
        return value.astimezone(timezone.utc)

    @field_validator("recorded_at", mode="before")
    @classmethod
    def recorded_at_is_iso_string(cls, value: object) -> object:
        if value is not None and not isinstance(value, str):
            raise ValueError("recorded_at must be an ISO 8601 string")
        return value


class SignedTelemetryCreate(StrictBody):
    payload_version: Literal[1]
    shipment_id: str
    device_id: str
    key_id: str
    sequence_number: int = Field(ge=1, le=2**63 - 1, strict=True)
    temperature_c: Decimal
    humidity_pct: Decimal
    temperature_milli_c: int = Field(ge=-100000, le=100000, strict=True)
    humidity_milli_pct: int = Field(ge=0, le=100000, strict=True)
    recorded_at: str
    firmware_version: str
    signature: str = Field(min_length=1, max_length=128)

    @field_validator("temperature_c", "humidity_pct", mode="before")
    @classmethod
    def decimal_json_number(cls, value: object) -> Decimal:
        if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
            raise ValueError("must be a JSON number")
        raw = str(value)
        if "e" in raw.lower():
            raise ValueError("exponential notation is not allowed")
        try:
            number = Decimal(raw)
        except InvalidOperation as exc:
            raise ValueError("invalid decimal number") from exc
        if not number.is_finite() or number.as_tuple().exponent < -3:
            raise ValueError("must be finite with at most three decimal places")
        return number

    @model_validator(mode="after")
    def valid_signed_payload(self) -> SignedTelemetryCreate:
        from app.services.telemetry_protocol import canonical_signed_bytes

        if self.temperature_c * 1000 != self.temperature_milli_c:
            raise ValueError("temperature_c does not match temperature_milli_c")
        if self.humidity_pct * 1000 != self.humidity_milli_pct:
            raise ValueError("humidity_pct does not match humidity_milli_pct")
        canonical_signed_bytes(self.model_dump())
        return self


class DeviceRegister(StrictBody):
    device_id: str
    key_id: str
    public_key_pem: str = Field(min_length=1, max_length=512)
    shipment_id: str


class DeviceKeyRegister(StrictBody):
    key_id: str
    public_key_pem: str = Field(min_length=1, max_length=512)


class DeviceStateUpdate(StrictBody):
    status: Literal["active", "revoked"]


class AssignmentUpdate(StrictBody):
    shipment_id: str
    active: bool


class LocationOut(BaseModel):
    latitude: float
    longitude: float
    location_source: Literal["backend_simulated"]
    progress_pct: float


class LatestTelemetryOut(BaseModel):
    id: str
    device_id: str
    temperature_c: float
    humidity_pct: float
    recorded_at: datetime | None
    received_at: datetime
    signature_status: Literal["VALID"] | None = None
    completeness_status: Literal["COMPLETE", "DATA_INCOMPLETE"] | None = None
    sequence_number: int | None = None
    missing_sequences: dict[str, int] | None = None


class InsuranceOut(BaseModel):
    insured_amount_vnd: int
    status: Literal["active", "triggered"]
    payout_status: Literal["not_requested", "pending", "paid", "failed"]


class BlockchainOut(BaseModel):
    network: str
    transaction_hash: str | None
    confirmation_status: Literal["pending", "success", "failed"]


class ShipmentOut(BaseModel):
    id: str
    code: str
    cargo_type: str
    status: Literal["created", "in_transit", "sensor_data_gap", "insurance_triggered"]
    origin: Place
    destination: Place
    temp_min_c: float
    temp_max_c: float
    violation_duration_minutes: int
    latest_telemetry: LatestTelemetryOut | None
    location: LocationOut | None
    insurance: InsuranceOut
    blockchain: BlockchainOut | None
    created_at: datetime


class ShipmentsOut(BaseModel):
    items: list[ShipmentOut]
    total: int


class TelemetryOut(LatestTelemetryOut):
    shipment_id: str
    location: LocationOut


class SignedTelemetryOut(TelemetryOut):
    signature_status: Literal["VALID"] = "VALID"
    completeness_status: Literal["COMPLETE", "DATA_INCOMPLETE"]
    sequence_number: int
    duplicate: bool


class DeviceHealthOut(BaseModel):
    device_id: str
    registration_status: Literal["active", "revoked"]
    telemetry_status: Literal["UNKNOWN", "ONLINE", "OFFLINE"]
    last_seen_at: datetime | None
    last_sequence_number: int


class DeviceHealthListOut(BaseModel):
    items: list[DeviceHealthOut]


class TelemetryListOut(BaseModel):
    items: list[TelemetryOut]


class EventOut(BaseModel):
    id: str
    shipment_id: str
    type: Literal["TEMPERATURE_BREACH_STARTED", "INSURANCE_TRIGGERED", "SENSOR_DATA_GAP"]
    occurred_at: datetime
    details: dict[str, Any]


class EventListOut(BaseModel):
    items: list[EventOut]


class DemoScenarioIn(StrictBody):
    scenario: Literal["normal", "temperature_breach"]


class DemoScenarioOut(BaseModel):
    shipment_id: str
    scenario: Literal["normal", "temperature_breach"]
    generated_samples: int
    shipment_status: Literal["created", "in_transit", "sensor_data_gap", "insurance_triggered"]


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
