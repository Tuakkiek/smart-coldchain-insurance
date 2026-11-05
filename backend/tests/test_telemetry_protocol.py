"""Golden vectors and boundary cases shared by device, Backend and chain teams."""

import hashlib
import json
from pathlib import Path

import pytest

from app.services.telemetry_protocol import (
    batch_root, canonical_record_bytes, canonical_signed_bytes, leaf_hash,
    merkle_root, verify_signature,
)


VECTORS = json.loads(
    (Path(__file__).parent / "fixtures/protocol_vectors_v1.json").read_text(encoding="utf-8")
)


def records():
    return [{**item["request"], "received_at": item["received_at"]} for item in VECTORS["records"]]


def test_signed_golden_vector_and_invalid_signature():
    valid = VECTORS["valid_request"]
    canonical = canonical_signed_bytes(valid)
    assert canonical.decode("utf-8") == VECTORS["canonical_signed_utf8"]
    assert canonical.hex() == VECTORS["canonical_signed_hex"]
    assert hashlib.sha256(canonical).hexdigest() == VECTORS["canonical_signed_sha256"]
    assert verify_signature(valid, VECTORS["public_key_spki_pem"].encode("ascii"))
    assert all(
        verify_signature(item["request"], VECTORS["public_key_spki_pem"].encode("ascii"))
        for item in VECTORS["records"]
    )
    assert not verify_signature(
        VECTORS["invalid_signature_request"], VECTORS["public_key_spki_pem"].encode("ascii"),
    )
    # Display floats and request JSON key order are never signed.
    assert canonical_signed_bytes(dict(reversed(list(valid.items())))) == canonical


def test_merkle_golden_roots_and_tamper_detection():
    batch = records()
    assert canonical_record_bytes(batch[0]).decode("utf-8") == VECTORS["canonical_record_utf8"]
    assert canonical_record_bytes(batch[0]).hex() == VECTORS["canonical_record_hex"]
    assert ["0x" + leaf_hash(row).hex() for row in batch] == VECTORS["leaf_hashes"]
    for count in (1, 2, 3):
        assert "0x" + batch_root(batch[:count]).hex() == VECTORS["roots"][str(count)]
    assert batch_root(list(reversed(batch))) == batch_root(batch)
    changed = [dict(row) for row in batch]
    changed[1]["received_at"] = "2026-11-04T10:30:32.000000Z"
    assert batch_root(changed) != batch_root(batch)
    changed[1]["received_at"] = batch[1]["received_at"]
    changed[1]["signature"] = batch[0]["signature"]
    assert batch_root(changed) != batch_root(batch)
    assert b"received_at" in canonical_record_bytes(batch[0])


def test_odd_leaf_is_duplicated_at_each_level():
    hashes = [leaf_hash(row) for row in records()]
    parent = lambda left, right: hashlib.sha256(b"\x01" + left + right).digest()
    assert merkle_root(hashes) == parent(parent(hashes[0], hashes[1]), parent(hashes[2], hashes[2]))


@pytest.mark.parametrize("mutate", [
    lambda row: row.update(sequence_number=True),
    lambda row: row.update(recorded_at="2026-11-04T10:30:00+00:00"),
    lambda row: row.update(device_id="é"),
    lambda row: row.update(payload_version=2),
    lambda row: row.update(temperature_milli_c=1.5),
    lambda row: row.update(shipment_id="00000000-0000-0000-0000-000000000000"),
])
def test_signed_projection_rejects_ambiguous_input(mutate):
    row = dict(VECTORS["valid_request"])
    mutate(row)
    with pytest.raises(ValueError):
        canonical_signed_bytes(row)


def test_batch_membership_and_empty_batch_rejected():
    batch = records()
    with pytest.raises(ValueError, match="empty"):
        batch_root([])
    with pytest.raises(ValueError, match="duplicate sequence"):
        batch_root([batch[0], batch[0]])
    mixed = dict(batch[1], device_id="OTHER")
    with pytest.raises(ValueError, match="mix"):
        batch_root([batch[0], mixed])
