"""Create a Wokwi-only signing identity and register it with the deployed API."""

from __future__ import annotations

import argparse
import getpass
import json
import re
import secrets
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config.h"
PRIVATE_KEY = HERE / "device-key.pem"
PUBLIC_KEY = HERE / "device-key.pub.pem"


def api_json(base_url: str, path: str, body: dict | None = None, admin_key: str = "") -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if admin_key:
        headers["X-Admin-Key"] = admin_key
    request = Request(base_url + path, data=data, headers=headers,
                      method="POST" if data is not None else "GET")
    try:
        with urlopen(request, timeout=45) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise SystemExit(f"Cannot reach API: {exc.reason}") from exc


def create_shipment(base_url: str) -> str:
    code = "WOKWI-" + secrets.token_hex(4).upper()
    body = {
        "code": code,
        "cargo_type": "wokwi_demo",
        "origin": {"name": "Simulator origin", "latitude": 10.82, "longitude": 106.63},
        "destination": {"name": "Simulator destination", "latitude": 10.75, "longitude": 106.70},
        "temp_min_c": 2.0,
        "temp_max_c": 8.0,
        "insured_amount_vnd": 0,
    }
    result = api_json(base_url, "/api/v1/shipments", body)
    print(f"Created shipment {code}: {result['id']}")
    return result["id"]


def config_text(base_url: str, shipment_id: str, device_id: str,
                private_key_pem: str) -> str:
    # Validated identifiers make the C string constants and canonical JSON unambiguous.
    try:
        parsed_id = UUID(shipment_id)
        if parsed_id.version != 4 or str(parsed_id) != shipment_id:
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError("shipment ID must be a lowercase UUID v4") from exc
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", device_id):
        raise ValueError("device ID must contain only ASCII letters, digits, _ or -")
    return (
        "#pragma once\n"
        "// Generated locally for the Wokwi simulator; never commit this file.\n"
        f'#define API_BASE_URL "{base_url}"\n'
        f'#define SHIPMENT_ID "{shipment_id}"\n'
        f'#define DEVICE_ID "{device_id}"\n'
        '#define KEY_ID "wokwi-key-v1"\n'
        'static const char DEVICE_PRIVATE_KEY_PEM[] = R"PEM(' + private_key_pem + ')PEM";\n'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Render HTTPS origin, without /api/v1")
    parser.add_argument("--shipment-id", help="Existing lowercase UUID v4; omitted creates a demo shipment")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::[0-9]+)?", base_url):
        parser.error("--base-url must be an HTTPS origin without a path")
    if args.shipment_id:
        try:
            config_text(base_url, args.shipment_id, "WOKWI-VALIDATION", "")
        except ValueError as exc:
            parser.error(str(exc))
    if any(path.exists() for path in (CONFIG, PRIVATE_KEY, PUBLIC_KEY)):
        parser.error("Wokwi config/key already exists; keep it or remove it before provisioning a new device")
    admin_key = getpass.getpass("Render ADMIN_API_KEY (input hidden): ")
    if not admin_key:
        parser.error("ADMIN_API_KEY is required to register the Wokwi device")
    api_json(base_url, "/api/v1/health")
    shipment_id = args.shipment_id or create_shipment(base_url)
    key = ec.generate_private_key(ec.SECP256R1())
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    device_id = "WOKWI-" + secrets.token_hex(5).upper()
    api_json(base_url, "/api/v1/devices", {
        "device_id": device_id,
        "key_id": "wokwi-key-v1",
        "public_key_pem": public_pem,
        "shipment_id": shipment_id,
    }, admin_key=admin_key)
    PRIVATE_KEY.write_text(private_pem, encoding="ascii")
    PUBLIC_KEY.write_text(public_pem, encoding="ascii")
    CONFIG.write_text(config_text(base_url, shipment_id, device_id, private_pem), encoding="ascii")
    print(f"Registered device {device_id}; generated ignored config.h and key files.")
    print(f"Verify: {base_url}/api/v1/shipments/{shipment_id}/telemetry")


if __name__ == "__main__":
    main()
