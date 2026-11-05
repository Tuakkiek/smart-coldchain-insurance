"""Regenerate public protocol vectors with a disposable, memory-only P-256 key.

Regeneration changes the signatures and roots; coordinate changes with the
Blockchain and firmware owners before replacing a published fixture.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.telemetry_protocol import (  # noqa: E402
    batch_root, canonical_record_bytes, canonical_signed_bytes, leaf_hash,
)


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    records = []
    for sequence, milli_c, received_at in (
        (1524, 12500, "2026-11-04T10:30:01.000000Z"),
        (1525, 12400, "2026-11-04T10:30:31.000000Z"),
        (1526, 12300, "2026-11-04T10:31:01.000000Z"),
    ):
        payload = {
            "payload_version": 1,
            "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
            "device_id": "ESP32-001",
            "key_id": "key-v1",
            "sequence_number": sequence,
            "temperature_c": milli_c / 1000,
            "humidity_pct": 80.0,
            "temperature_milli_c": milli_c,
            "humidity_milli_pct": 80000,
            "recorded_at": "2026-11-04T10:30:00Z",
            "firmware_version": "1.0.0",
        }
        canonical = canonical_signed_bytes(payload)
        payload["signature"] = base64.b64encode(key.sign(canonical, ec.ECDSA(hashes.SHA256()))).decode("ascii")
        records.append({"request": payload, "received_at": received_at})

    bad = dict(records[0]["request"])
    bad["temperature_milli_c"] += 1000
    bad["temperature_c"] += 1.0
    first_record = {**records[0]["request"], "received_at": records[0]["received_at"]}
    fixture = {
        "protocol": "SIGNED-TELEMETRY-v1/MERKLE-v1",
        "public_key_spki_pem": public_pem,
        "valid_request": records[0]["request"],
        "invalid_signature_request": bad,
        "canonical_signed_utf8": canonical_signed_bytes(records[0]["request"]).decode("utf-8"),
        "canonical_signed_hex": canonical_signed_bytes(records[0]["request"]).hex(),
        "canonical_signed_sha256": hashlib.sha256(canonical_signed_bytes(records[0]["request"])).hexdigest(),
        "canonical_record_utf8": canonical_record_bytes(first_record).decode("utf-8"),
        "canonical_record_hex": canonical_record_bytes(first_record).hex(),
        "records": records,
        "leaf_hashes": ["0x" + leaf_hash({**r["request"], "received_at": r["received_at"]}).hex() for r in records],
        "roots": {
            str(count): "0x" + batch_root([
                {**r["request"], "received_at": r["received_at"]} for r in records[:count]
            ]).hex()
            for count in (1, 2, 3)
        },
    }
    path = Path(__file__).with_name("protocol_vectors_v1.json")
    path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote public fixture: {path}")


if __name__ == "__main__":
    main()
