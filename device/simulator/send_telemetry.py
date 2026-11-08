"""Send real SIGNED-TELEMETRY-v1 samples using a separately provisioned test key."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app.services.telemetry_protocol import canonical_signed_bytes  # noqa: E402


def payload_for(*, shipment_id: str, device_id: str, key_id: str,
                sequence: int, temperature: str, humidity: str,
                recorded_at: str, private_key: ec.EllipticCurvePrivateKey) -> dict:
    temp, humid = Decimal(temperature), Decimal(humidity)
    if (temp * 1000 != int(temp * 1000) or humid * 1000 != int(humid * 1000)):
        raise ValueError("temperature and humidity must have at most three decimal places")
    payload = {
        "payload_version": 1, "shipment_id": shipment_id, "device_id": device_id,
        "key_id": key_id, "sequence_number": sequence,
        "temperature_c": float(temp), "humidity_pct": float(humid),
        "temperature_milli_c": int(temp * 1000),
        "humidity_milli_pct": int(humid * 1000),
        "recorded_at": recorded_at, "firmware_version": "simulator-1.0",
    }
    signature = private_key.sign(canonical_signed_bytes(payload), ec.ECDSA(hashes.SHA256()))
    payload["signature"] = base64.b64encode(signature).decode("ascii")
    return payload


def post(base_url: str, payload: dict, *, timeout: float = 10) -> tuple[int, dict]:
    parsed = urlparse(base_url)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    ):
        raise ValueError("Use HTTPS, or HTTP only for localhost development")
    url = base_url.rstrip("/") + "/api/v1/shipments/" + payload["shipment_id"] + "/telemetry"
    request = Request(url, data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        return exc.code, json.load(exc)


def run(args: argparse.Namespace) -> None:
    private_key = serialization.load_pem_private_key(args.private_key.read_bytes(), password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey) or not isinstance(private_key.curve, ec.SECP256R1):
        raise ValueError("Private key must be P-256 PEM")
    recorded_at = args.recorded_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def sample(sequence: int) -> dict:
        return payload_for(shipment_id=args.shipment_id, device_id=args.device_id,
                           key_id=args.key_id, sequence=sequence,
                           temperature=args.temperature, humidity=args.humidity,
                           recorded_at=recorded_at, private_key=private_key)

    first = sample(args.sequence)
    if args.scenario == "happy":
        attempts = [("accepted", first)]
    elif args.scenario == "invalid_signature":
        tampered = dict(first)
        tampered["temperature_milli_c"] += 1000
        tampered["temperature_c"] += 1
        attempts = [("invalid signature", tampered)]
    elif args.scenario == "duplicate":
        attempts = [("accepted", first), ("duplicate", first)]
    elif args.scenario == "replay":
        attempts = [("higher sequence", sample(args.sequence + 1)), ("stale sequence", first)]
    elif args.scenario == "gap":
        attempts = [("accepted", first), ("gap", sample(args.sequence + 2))]
    else:  # reconnect: hold the exact signed bytes while offline and resend.
        try:
            post("http://127.0.0.1:1", first, timeout=0.5)
        except URLError:
            print("offline: connection failed; signed payload retained")
        attempts = [("reconnected", first)]

    for label, payload in attempts:
        if args.dry_run:
            print(json.dumps({"step": label, "payload": payload}, separators=(",", ":")))
            continue
        status, body = post(args.base_url, payload, timeout=args.timeout)
        print(json.dumps({"step": label, "http_status": status, "response": body}, separators=(",", ":")))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--shipment-id", required=True)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--key-id", required=True)
    parser.add_argument("--private-key", required=True, type=Path)
    parser.add_argument("--sequence", type=int, required=True,
                        help="First unused device sequence; the simulator does not persist a counter")
    parser.add_argument("--temperature", default="5.0")
    parser.add_argument("--humidity", default="80.0")
    parser.add_argument("--recorded-at", help="UTC YYYY-MM-DDTHH:mm:ssZ; defaults to current UTC")
    parser.add_argument("--scenario", choices=("happy", "invalid_signature", "duplicate",
                                                "replay", "gap", "reconnect"), default="happy")
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        run(args)
    except (OSError, ValueError, URLError) as exc:
        parser.exit(1, f"simulator error: {exc}\n")


if __name__ == "__main__":
    main()
