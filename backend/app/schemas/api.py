"""Request and response contracts for /api/v1."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator, model_validator

from app.services.eth_units import (
    SEPOLIA_CURRENCY,
    parse_eth_to_wei,
    validate_and_checksum_wallet,
    validate_tx_hash,
)


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(StrictBody):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("username")
    @classmethod
    def nonblank_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("password")
    @classmethod
    def nonblank_password(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("must not be blank")
        return value


class LoginOut(StrictBody):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class Place(StrictBody):
    name: str = Field(min_length=1, max_length=255)
    formatted_address: str | None = Field(default=None, max_length=500)
    place_id: str | None = Field(default=None, max_length=255)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)

    @model_validator(mode="before")
    @classmethod
    def accept_address_alias(cls, data: object) -> object:
        if isinstance(data, dict) and "address" in data:
            copied = dict(data)
            addr = copied.pop("address")
            if "name" not in copied or not copied["name"]:
                copied["name"] = addr
            return copied
        return data

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("formatted_address", "place_id")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InsuranceCreateIn(StrictBody):
    coverage_amount: str
    currency: Literal["SepoliaETH"] = SEPOLIA_CURRENCY


class ShipmentCreate(StrictBody):
    name: str = Field(min_length=1, max_length=255, strict=True)
    cargo_type: str = Field(min_length=1, max_length=100)
    origin: Place
    destination: Place
    temp_min_c: float = Field(allow_inf_nan=False, strict=True)
    temp_max_c: float = Field(allow_inf_nan=False, strict=True)
    violation_duration_minutes: int = Field(default=15, gt=0, strict=True)
    insured_amount_vnd: int | None = Field(default=None, ge=0, strict=True)
    insurance_amount: str | None = None
    insurance_currency: Literal["SepoliaETH", "VND"] | None = None
    insurance: InsuranceCreateIn | None = None
    buyer_wallet_address: str | None = None
    policy_expiry_days: int | None = Field(default=None, ge=1, le=3650, strict=True)

    _resolved_eth_amount: str | None = PrivateAttr(default=None)
    _resolved_wei_amount: str | None = PrivateAttr(default=None)
    _resolved_currency: str = PrivateAttr(default="VND")
    _resolved_buyer_wallet: str | None = PrivateAttr(default=None)

    @property
    def resolved_eth_amount(self) -> str | None:
        return self._resolved_eth_amount

    @property
    def resolved_wei_amount(self) -> str | None:
        return self._resolved_wei_amount

    @property
    def resolved_currency(self) -> str:
        return self._resolved_currency

    @property
    def resolved_buyer_wallet(self) -> str | None:
        return self._resolved_buyer_wallet

    @field_validator("name", "cargo_type")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def valid_shipment_policy(self) -> ShipmentCreate:
        if self.temp_min_c >= self.temp_max_c:
            raise ValueError("temp_min_c must be smaller than temp_max_c")

        raw_eth = self.insurance.coverage_amount if self.insurance is not None else self.insurance_amount
        explicit_currency = self.insurance.currency if self.insurance is not None else self.insurance_currency

        is_eth_mode = (
            self.insurance is not None
            or self.insurance_amount is not None
            or explicit_currency == SEPOLIA_CURRENCY
            or self.insured_amount_vnd is None
        )

        if is_eth_mode:
            if explicit_currency is not None and explicit_currency != SEPOLIA_CURRENCY:
                raise ValueError("Đơn vị tiền tệ bảo hiểm mới phải là SepoliaETH")
            normalized_eth, wei_str = parse_eth_to_wei(raw_eth)
            checksum_wallet = validate_and_checksum_wallet(self.buyer_wallet_address)
            self._resolved_eth_amount = normalized_eth
            self._resolved_wei_amount = wei_str
            self._resolved_currency = SEPOLIA_CURRENCY
            self._resolved_buyer_wallet = checksum_wallet
            self.insured_amount_vnd = 0
        else:
            self._resolved_currency = "VND"
            if self.buyer_wallet_address is not None:
                self._resolved_buyer_wallet = validate_and_checksum_wallet(self.buyer_wallet_address)

        return self


class LocationResolveIn(StrictBody):
    input: str = Field(min_length=1, max_length=2048)

    @field_validator("input")
    @classmethod
    def nonblank_input(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Vui lòng nhập địa chỉ hoặc đường dẫn Google Maps")
        return cleaned


class ResolvedLocationData(BaseModel):
    address: str
    formatted_address: str
    latitude: float
    longitude: float
    place_id: str | None = None
    source: str


class LocationResolveOut(BaseModel):
    success: Literal[True] = True
    data: ResolvedLocationData


class PolicyConfirmIn(StrictBody):
    transaction_hash: str

    @field_validator("transaction_hash")
    @classmethod
    def valid_hash(cls, value: str) -> str:
        return validate_tx_hash(value)


class BlockchainPublicConfigOut(BaseModel):
    network: str
    chain_id: int
    currency: str
    insurance_contract_address: str | None = None
    blockchain_enabled: bool
    server_policy_creation_enabled: bool


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
    payload_version: Literal[1, 2]
    shipment_id: str | None = None
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

        if self.payload_version == 1 and self.shipment_id is None:
            raise ValueError("shipment_id is required for payload_version 1")
        if self.payload_version == 2 and self.shipment_id is not None:
            raise ValueError("shipment_id must not be sent for payload_version 2")
        if self.temperature_c * 1000 != self.temperature_milli_c:
            raise ValueError("temperature_c does not match temperature_milli_c")
        if self.humidity_pct * 1000 != self.humidity_milli_pct:
            raise ValueError("humidity_pct does not match humidity_milli_pct")
        canonical_signed_bytes(self.model_dump())
        return self


class DeviceStateUpdate(StrictBody):
    status: Literal["active", "revoked"]


class AssignmentUpdate(StrictBody):
    shipment_id: str
    active: bool = Field(strict=True)


class DeviceKeyOut(BaseModel):
    key_id: str
    status: Literal["active", "revoked"]


class DeviceAssignmentOut(BaseModel):
    shipment_id: str
    active: bool


class DeviceOut(BaseModel):
    device_id: str
    device_name: str
    status: Literal["active", "revoked"]
    has_public_key: bool
    current_shipment_id: str | None
    current_shipment_name: str | None
    last_sequence_number: int
    last_seen_at: datetime | None
    keys: list[DeviceKeyOut]
    assignments: list[DeviceAssignmentOut]


class DevicesOut(BaseModel):
    items: list[DeviceOut]
    total: int


class LocationOut(BaseModel):
    latitude: float
    longitude: float
    location_source: Literal["backend_simulated", "admin_simulated"]
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
    coverage_amount: str | None = None
    coverage_amount_wei: str | None = None
    currency: Literal["SepoliaETH", "VND"] | None = None
    chain_id: int | None = None
    buyer_wallet_address: str | None = None
    policy_contract_address: str | None = None
    policy_transaction_hash: str | None = None
    policy_status: Literal["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"] | None = None
    policy_last_error: str | None = None
    status: Literal["active", "triggered"]
    payout_status: Literal["not_requested", "evidence_pending", "pending", "paid", "failed"]


class BlockchainOut(BaseModel):
    network: str
    chain_id: int | None = None
    contract_address: str | None = None
    transaction_hash: str | None
    policy_transaction_hash: str | None = None
    policy_status: Literal["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"] | None = None
    confirmation_status: Literal["pending", "success", "failed"]


class ShipmentOut(BaseModel):
    id: str
    shipment_id: str
    name: str
    cargo_type: str
    status: Literal["created", "in_transit", "sensor_data_gap", "insurance_triggered", "delivered"]
    origin: Place
    destination: Place
    temp_min_c: float
    temp_max_c: float
    violation_duration_minutes: int
    buyer_wallet_address: str | None = None
    latest_telemetry: LatestTelemetryOut | None
    location: LocationOut | None
    insurance: InsuranceOut
    blockchain: BlockchainOut | None
    delivered_at: datetime | None = None
    delivery_source: Literal["admin_simulated"] | None = None
    telemetry_closed: bool = False
    delivery_result: Literal["SAFE", "VIOLATED", "INCOMPLETE"] | None = None
    delivery_result_reason: str | None = None
    refund_status: Literal["NOT_APPLICABLE", "PENDING", "WAITING_EXPIRY", "CONFIRMED", "FAILED"] | None = None
    refund_transaction_hash: str | None = None
    refunded_amount_wei: str | None = None
    refund_recipient_address: str | None = None
    created_at: datetime


class ShipmentDeleteOut(BaseModel):
    shipment_id: str
    deleted: Literal[True]


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
    type: Literal[
        "TEMPERATURE_BREACH_STARTED", "TEMPERATURE_BREACH_ENDED", "INSURANCE_TRIGGERED",
        "SENSOR_DATA_GAP", "DEVICE_OFFLINE", "INTEGRITY_MISMATCH"
    ]
    occurred_at: datetime
    details: dict[str, Any]


class EventListOut(BaseModel):
    items: list[EventOut]


class SealBatchIn(StrictBody):
    device_id: str = Field(min_length=1, max_length=100)
    force: bool = True


class IntegrityAnchorTransactionOut(BaseModel):
    network: str | None
    transaction_hash: str | None
    status: Literal["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"]
    attempt_count: int
    last_error: str | None
    submitted_at: datetime | None
    confirmed_at: datetime | None


class IntegrityBatchOut(BaseModel):
    batch_id: str
    shipment_id: str
    device_id: str
    status: Literal["SEALED"]
    first_sequence: int
    last_sequence: int
    record_count: int
    merkle_root: str
    hash_version: Literal["MERKLE-v1"]
    verification_status: Literal["NOT_CHECKED", "MATCHED", "DATA_INTEGRITY_FAILED"]
    anchor_status: Literal["NOT_READY", "BLOCKCHAIN_PENDING", "DATA_ANCHORED", "BLOCKCHAIN_FAILED"]
    sealed_at: datetime
    verified_at: datetime | None
    anchor_transaction: IntegrityAnchorTransactionOut | None = None


class IntegrityBatchListOut(BaseModel):
    items: list[IntegrityBatchOut]
    total: int


class IntegrityVerifyOut(IntegrityBatchOut):
    calculated_root: str | None
    on_chain_match: bool | None = None


class IntegritySummaryOut(BaseModel):
    shipment_id: str | None = None
    batch_count: int
    record_count: int
    verification_status: Literal["NOT_CHECKED", "MATCHED", "DATA_INTEGRITY_FAILED"]
    anchor_status: Literal["NOT_READY", "BLOCKCHAIN_PENDING", "DATA_ANCHORED", "BLOCKCHAIN_FAILED"]


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "degraded", "unavailable"]
    blockchain: Literal["ok", "degraded", "unavailable"]
