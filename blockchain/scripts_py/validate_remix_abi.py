"""Validate and wrap Remix-exported ABI JSON for Backend Web3.py compatibility.

Usage (no Node.js / Hardhat required):
    python blockchain/scripts_py/validate_remix_abi.py \
        --contract ColdChainDataIntegrity \
        --input remix_abi.json \
        --out blockchain/deployments/abi/ColdChainDataIntegrity.backend.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ABI_DIR = REPO_ROOT / "backend" / "app" / "integrations" / "abi"
LEGACY_ABI_DIR = REPO_ROOT / "blockchain" / "deployments" / "abi"


def _extract_abi_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("abi"), list):
        return payload["abi"]
    raise ValueError("Input JSON must be either an ABI array [...] or an object containing an 'abi' list.")


def _signature(item: dict[str, Any]) -> str:
    kind = item.get("type", "")
    name = item.get("name", "")
    inputs = ",".join(i.get("type", "") for i in item.get("inputs", []))
    outputs = ",".join(o.get("type", "") for o in item.get("outputs", []))
    return f"{kind}:{name}({inputs})->({outputs})"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Remix ABI against Backend compatibility baseline.")
    parser.add_argument(
        "--contract",
        required=True,
        choices=["ColdChainDataIntegrity", "ColdChainInsurance"],
    )
    parser.add_argument("--input", required=True, type=Path, help="Path to Remix-exported ABI JSON file.")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional output path to write wrapped {'contractName': ..., 'abi': [...]} JSON.",
    )
    args = parser.parse_args()

    raw_data = json.loads(args.input.read_text(encoding="utf-8"))
    candidate_abi = _extract_abi_list(raw_data)
    candidate_sigs = {_signature(item) for item in candidate_abi if item.get("type") in {"function", "event", "error"}}

    # 1. Check required Backend subset (if contract has a Backend ABI file)
    backend_abi_file = BACKEND_ABI_DIR / f"{args.contract}.json"
    if backend_abi_file.exists():
        backend_abi = _extract_abi_list(json.loads(backend_abi_file.read_text(encoding="utf-8")))
        backend_sigs = {_signature(item) for item in backend_abi if item.get("type") in {"function", "event", "error"}}
        missing_for_backend = sorted(backend_sigs - candidate_sigs)
        if missing_for_backend:
            print(f"[FAIL] Missing signatures required by Backend ({backend_abi_file.name}):")
            for sig in missing_for_backend:
                print(f"  - {sig}")
            return 1
        print(f"[OK] All {len(backend_sigs)} Backend-required signatures present.")

    # 2. Check full ABI parity against legacy exported ABI
    legacy_abi_file = LEGACY_ABI_DIR / f"{args.contract}.abi.json"
    if legacy_abi_file.exists():
        legacy_abi = _extract_abi_list(json.loads(legacy_abi_file.read_text(encoding="utf-8")))
        legacy_sigs = {_signature(item) for item in legacy_abi if item.get("type") in {"function", "event", "error"}}
        missing_full = sorted(legacy_sigs - candidate_sigs)
        extra_full = sorted(candidate_sigs - legacy_sigs)
        if missing_full or extra_full:
            print(f"[WARN] Full ABI difference vs {legacy_abi_file.name}:")
            for sig in missing_full:
                print(f"  - missing: {sig}")
            for sig in extra_full:
                print(f"  + extra:   {sig}")
        else:
            print(f"[OK] 100% signature parity with {legacy_abi_file.name} ({len(legacy_sigs)} entries).")

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        wrapped = {"contractName": args.contract, "abi": candidate_abi}
        args.out.write_text(json.dumps(wrapped, indent=2) + "\n", encoding="utf-8")
        print(f"[OK] Wrote Backend-compatible wrapped ABI to {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
