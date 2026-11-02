"""Send bounded, repeatable telemetry samples to the Backend API.

Uses only the Python standard library. The Backend, not this simulator, assigns
received_at and simulated coordinates.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import uuid
from urllib import error, parse, request


def finite_number(value: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise argparse.ArgumentTypeError("value must be finite")
    return number


def non_negative_number(value: str) -> float:
    number = finite_number(value)
    if number < 0:
        raise argparse.ArgumentTypeError("value must be >= 0")
    return number


def positive_number(value: str) -> float:
    number = finite_number(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be > 0")
    return number


def positive_int(value: str) -> int:
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("value must be >= 1")
    return number


def non_negative_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("value must be >= 0")
    return number


def shipment_uuid(value: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("shipment ID must be a UUID") from exc
    if parsed.version != 4 or str(parsed) != value:
        raise argparse.ArgumentTypeError("shipment ID must be a lowercase UUID v4")
    return value


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shipment-id", required=True, type=shipment_uuid)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--device-id", default="SIM-01")
    parser.add_argument("--mode", choices=("normal", "breach", "sequence"), default="sequence")
    parser.add_argument("--normal-temp", type=finite_number, default=5.0)
    parser.add_argument("--breach-temp", type=finite_number, default=9.2)
    parser.add_argument("--humidity", type=finite_number, default=72.5)
    parser.add_argument("--count", type=positive_int, default=5)
    parser.add_argument("--normal-count", type=non_negative_int, default=2)
    parser.add_argument("--breach-count", type=non_negative_int, default=3)
    parser.add_argument("--interval-seconds", type=non_negative_number, default=1.0)
    parser.add_argument("--timeout-seconds", type=positive_number, default=5.0)
    parser.add_argument("--retries", type=non_negative_int, default=2)
    parser.add_argument("--retry-delay-seconds", type=non_negative_number, default=0.5)
    parser.add_argument("--dry-run", action="store_true", help="print payloads without sending")
    args = parser.parse_args(argv)

    parsed_url = parse.urlsplit(args.base_url)
    if (
        parsed_url.scheme not in ("http", "https")
        or not parsed_url.netloc
        or parsed_url.path not in ("", "/")
        or parsed_url.query
        or parsed_url.fragment
    ):
        parser.error("--base-url must be an http(s) server root without path, query or fragment")
    if not args.device_id or len(args.device_id) > 100:
        parser.error("--device-id must contain 1-100 characters")
    if not 0 <= args.humidity <= 100:
        parser.error("--humidity must be between 0 and 100")
    if args.mode == "sequence" and args.normal_count + args.breach_count == 0:
        parser.error("sequence needs at least one sample")
    return args


def samples(args: argparse.Namespace) -> list[tuple[str, float]]:
    if args.mode == "normal":
        return [("normal", args.normal_temp)] * args.count
    if args.mode == "breach":
        return [("breach", args.breach_temp)] * args.count
    return [("normal", args.normal_temp)] * args.normal_count + [
        ("breach", args.breach_temp)
    ] * args.breach_count


def post_with_retry(url: str, payload: dict[str, object], args: argparse.Namespace) -> bool:
    data = json.dumps(payload, allow_nan=False).encode("utf-8")
    for attempt in range(args.retries + 1):
        req = request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=args.timeout_seconds) as response:
                if 200 <= response.status < 300:
                    print(f"  HTTP {response.status}: accepted")
                    return True
                print(f"  unexpected HTTP {response.status}", file=sys.stderr)
        except error.HTTPError as exc:
            message = exc.read(200).decode("utf-8", errors="replace")
            print(f"  HTTP {exc.code}: {message}", file=sys.stderr)
            if 400 <= exc.code < 500 and exc.code != 429:
                return False
        except (error.URLError, TimeoutError, OSError) as exc:
            print(f"  connection error: {exc}", file=sys.stderr)
        if attempt < args.retries:
            print(f"  retry {attempt + 1}/{args.retries} in {args.retry_delay_seconds:g}s")
            time.sleep(args.retry_delay_seconds)
    return False


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    url = args.base_url.rstrip("/") + f"/api/v1/shipments/{args.shipment_id}/telemetry"
    planned = samples(args)
    failed = 0
    try:
        for index, (kind, temperature) in enumerate(planned, start=1):
            payload = {
                "device_id": args.device_id,
                "temperature_c": temperature,
                "humidity_pct": args.humidity,
            }
            print(f"[{index}/{len(planned)}] {kind}: {json.dumps(payload, allow_nan=False)}")
            if not args.dry_run and not post_with_retry(url, payload, args):
                failed += 1
            if index < len(planned) and not args.dry_run:
                time.sleep(args.interval_seconds)
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130

    if args.dry_run:
        print("Dry run: no HTTP requests were sent.")
    else:
        print(f"Completed: {len(planned) - failed}/{len(planned)} samples accepted.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(run())
