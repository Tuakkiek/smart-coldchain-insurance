"""Byte-level SIGNED-TELEMETRY-v1 and MERKLE-v1 rules.

These primitives are deliberately separate from the legacy ingestion endpoint.
Only verified records may be passed to a future batch persistence service.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils


SIGNED_FIELDS = (
    "device_id", "firmware_version", "humidity_milli_pct", "key_id",
    "payload_version", "recorded_at", "sequence_number", "shipment_id",
    "temperature_milli_c",
)
RECORD_FIELDS = (*SIGNED_FIELDS, "received_at", "signature")
_ID = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
_FIRMWARE = re.compile(r"[A-Za-z0-9._+-]{1,64}\Z")
_UTC_SECOND = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
_UTC_MICROSECOND = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\Z")


def _utc_timestamp(value: Any, *, fractional: bool) -> str:
    if not isinstance(value, str) or not (
        _UTC_MICROSECOND.fullmatch(value) if fractional else _UTC_SECOND.fullmatch(value)
    ):
        raise ValueError("timestamp must be UTC with the prescribed precision")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid UTC timestamp") from exc
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError("timestamp must be UTC")
    return value


def _integer(value: Any, name: str, *, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer in [{minimum}, {maximum}]")
    return value


def _signed_projection(value: Mapping[str, Any]) -> dict[str, Any]:
    result = {name: value[name] for name in SIGNED_FIELDS}
    try:
        shipment_id = UUID(result["shipment_id"])
        if shipment_id.version != 4 or str(shipment_id) != result["shipment_id"]:
            raise ValueError
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("shipment_id must be a lowercase UUID v4 string") from exc
    for name in ("device_id", "key_id"):
        if not isinstance(result[name], str) or not _ID.fullmatch(result[name]):
            raise ValueError(f"{name} must be 1-100 ASCII letters, digits, _ or -")
    if not isinstance(result["firmware_version"], str) or not _FIRMWARE.fullmatch(result["firmware_version"]):
        raise ValueError("firmware_version has invalid characters")
    _integer(result["payload_version"], "payload_version", minimum=1, maximum=1)
    _integer(result["sequence_number"], "sequence_number", minimum=1, maximum=2**63 - 1)
    _integer(result["temperature_milli_c"], "temperature_milli_c", minimum=-100000, maximum=100000)
    _integer(result["humidity_milli_pct"], "humidity_milli_pct", minimum=0, maximum=100000)
    _utc_timestamp(result["recorded_at"], fractional=False)
    return result


def _json_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("utf-8")


def canonical_signed_bytes(value: Mapping[str, Any]) -> bytes:
    """Build the fixed projection; raw request key order and display floats do not matter."""
    return _json_bytes(_signed_projection(value))


def _signature_bytes(value: Any) -> bytes:
    if not isinstance(value, str) or not value:
        raise ValueError("signature must be nonempty DER/Base64")
    try:
        raw = base64.b64decode(value, validate=True)
        if base64.b64encode(raw).decode("ascii") != value:
            raise ValueError("signature Base64 must use canonical padding")
        r, s = utils.decode_dss_signature(raw)
        if utils.encode_dss_signature(r, s) != raw:
            raise ValueError("signature DER must be canonical")
    except (binascii.Error, ValueError) as exc:
        raise ValueError("signature must be canonical DER/Base64") from exc
    return raw


def verify_signature(value: Mapping[str, Any], public_key_pem: bytes) -> bool:
    """Verify ECDSA P-256/SHA-256; invalid signatures return False."""
    message = canonical_signed_bytes(value)
    signature = _signature_bytes(value["signature"])
    key = serialization.load_pem_public_key(public_key_pem)
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("public key must be P-256 SPKI PEM")
    try:
        key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature:
        return False
    return True


def canonical_record_bytes(value: Mapping[str, Any]) -> bytes:
    """Hash only immutable accepted-record fields, including server received_at."""
    result = _signed_projection(value)
    result["received_at"] = _utc_timestamp(value["received_at"], fractional=True)
    _signature_bytes(value["signature"])
    result["signature"] = value["signature"]
    return _json_bytes(result)


def leaf_hash(value: Mapping[str, Any]) -> bytes:
    return hashlib.sha256(b"\x00" + canonical_record_bytes(value)).digest()


def merkle_root(leaves: Sequence[bytes]) -> bytes:
    if not leaves:
        raise ValueError("empty batches cannot be anchored")
    if any(len(item) != 32 for item in leaves):
        raise ValueError("each leaf hash must be 32 bytes")
    level = list(leaves)
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [
            hashlib.sha256(b"\x01" + level[index] + level[index + 1]).digest()
            for index in range(0, len(level), 2)
        ]
    return level[0]


def batch_root(records: Sequence[Mapping[str, Any]]) -> bytes:
    """Sort one shipment/device batch by sequence, rejecting ambiguous membership."""
    if not records:
        raise ValueError("empty batches cannot be anchored")
    first = _signed_projection(records[0])
    identities = (first["shipment_id"], first["device_id"])
    ordered = sorted(records, key=lambda row: row["sequence_number"])
    seen: set[int] = set()
    leaves = []
    for row in ordered:
        projection = _signed_projection(row)
        if (projection["shipment_id"], projection["device_id"]) != identities:
            raise ValueError("batch cannot mix shipment or device identities")
        sequence = projection["sequence_number"]
        if sequence in seen:
            raise ValueError("duplicate sequence in batch")
        seen.add(sequence)
        leaves.append(leaf_hash(row))
    return merkle_root(leaves)
