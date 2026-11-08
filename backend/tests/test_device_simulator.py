"""Simulator emits the exact payload that the backend verifies."""

import sys
from argparse import Namespace
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "device" / "simulator"))
import send_telemetry  # noqa: E402
from send_telemetry import payload_for  # noqa: E402

from app.services.telemetry_protocol import verify_signature
from app.schemas.api import SignedTelemetryCreate
from cryptography.hazmat.primitives import serialization


def test_simulator_signed_payload_matches_backend():
    key = ec.generate_private_key(ec.SECP256R1())
    payload = payload_for(
        shipment_id="67f1e79a-68cb-461b-b104-5c7583bd9047",
        device_id="SIM-001", key_id="sim-v1", sequence=1,
        temperature="5.125", humidity="80.25",
        recorded_at="2026-11-08T12:00:00Z", private_key=key,
    )
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    validated = SignedTelemetryCreate.model_validate(payload)
    assert verify_signature(validated.model_dump(), public)
    tampered = dict(payload)
    tampered["temperature_c"] = 6.125
    tampered["temperature_milli_c"] = 6125
    assert not verify_signature(tampered, public)


@pytest.mark.parametrize("scenario,expected", [
    ("happy", [10]), ("invalid_signature", [10]),
    ("duplicate", [10, 10]), ("replay", [11, 10]),
    ("gap", [10, 12]), ("reconnect", [10]),
])
def test_simulator_scenario_sequences_and_retry(tmp_path, monkeypatch, capsys, scenario, expected):
    key = ec.generate_private_key(ec.SECP256R1())
    key_path = tmp_path / "test-only.pem"
    key_path.write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    sent = []

    def fake_post(base_url, payload, **_kwargs):
        if base_url == "http://127.0.0.1:1":
            raise URLError("offline")
        sent.append(payload)
        return 201, {"id": "accepted"}

    monkeypatch.setattr(send_telemetry, "post", fake_post)
    send_telemetry.run(Namespace(
        private_key=key_path, shipment_id="67f1e79a-68cb-461b-b104-5c7583bd9047",
        device_id="SIM-001", key_id="sim-v1", sequence=10,
        temperature="5.0", humidity="80.0", recorded_at="2026-11-08T12:00:00Z",
        scenario=scenario, dry_run=False, base_url="https://api.example.test", timeout=10,
    ))
    capsys.readouterr()
    assert [payload["sequence_number"] for payload in sent] == expected
    if scenario == "duplicate":
        assert sent[0] == sent[1]
    if scenario == "invalid_signature":
        public = key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        assert not verify_signature(sent[0], public)
