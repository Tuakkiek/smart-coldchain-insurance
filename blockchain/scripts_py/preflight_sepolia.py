"""Preflight and post-deploy verification for Ethereum Sepolia (no Hardhat/Node.js).

Checks:
1. RPC connectivity and chainId == 11155111.
2. Sepolia ETH balances for public Owner, Anchorer, and Oracle addresses.
3. Optional post-deploy checks against blockchain/deployments/sepolia.json:
   - Bytecode exists at ColdChainDataIntegrity and ColdChainInsurance
   - anchorer(), oracle(), and Insurance ETH balance match expected public addresses.

Usage:
    python blockchain/scripts_py/preflight_sepolia.py
    python blockchain/scripts_py/preflight_sepolia.py --manifest blockchain/deployments/sepolia.json
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from web3 import Web3


BLOCKCHAIN_DIR = Path(__file__).resolve().parents[1]
ABI_DIR = BLOCKCHAIN_DIR / "deployments" / "abi"
SEPOLIA_CHAIN_ID = 11155111


def _load_abi(contract_name: str) -> list[dict[str, Any]]:
    wrapped = ABI_DIR / f"{contract_name}.json"
    raw = ABI_DIR / f"{contract_name}.abi.json"
    target = wrapped if wrapped.exists() else raw
    data = json.loads(target.read_text(encoding="utf-8"))
    return data["abi"] if isinstance(data, dict) else data


def _check_balance(web3: Web3, label: str, address: str) -> None:
    if not address or int(address, 16) == 0:
        print(f"[SKIP] {label}: address not provided")
        return
    checksum = Web3.to_checksum_address(address)
    wei = web3.eth.get_balance(checksum)
    eth = web3.from_wei(wei, "ether")
    status = "OK" if wei > 0 else "WARN (0 SepoliaETH)"
    print(f"[{status}] {label} ({checksum}): {eth:.6f} SepoliaETH")


def _verify_manifest(web3: Web3, manifest_path: Path) -> bool:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    contracts = manifest.get("contracts", {})
    roles = manifest.get("roles", {})
    ok = True

    for name in ("ColdChainDataIntegrity", "ColdChainInsurance"):
        info = contracts.get(name, {})
        addr = info.get("address")
        if not addr:
            print(f"[FAIL] {name}: missing deployed address in {manifest_path.name}")
            ok = False
            continue
        checksum = Web3.to_checksum_address(addr)
        code = web3.eth.get_code(checksum)
        if not code:
            print(f"[FAIL] {name} ({checksum}): no bytecode on chain")
            ok = False
            continue
        print(f"[OK] {name} ({checksum}): bytecode verified ({len(code)} bytes)")

        if name == "ColdChainDataIntegrity":
            c = web3.eth.contract(address=checksum, abi=_load_abi(name))
            onchain_anchorer = c.functions.anchorer().call()
            expected_anchorer = roles.get("anchorer")
            match = expected_anchorer and onchain_anchorer.lower() == expected_anchorer.lower()
            print(f"[{'OK' if match else 'FAIL'}] Integrity.anchorer() = {onchain_anchorer}")
            ok = ok and bool(match)
        elif name == "ColdChainInsurance":
            c = web3.eth.contract(address=checksum, abi=_load_abi(name))
            onchain_oracle = c.functions.oracle().call()
            expected_oracle = roles.get("oracle")
            oracle_ok = expected_oracle and onchain_oracle.lower() == expected_oracle.lower()
            eth_bal = web3.from_wei(c.functions.getContractBalance().call(), "ether")
            print(f"[{'OK' if oracle_ok else 'FAIL'}] Insurance.oracle() = {onchain_oracle}")
            print(f"[OK] Insurance.getContractBalance() = {eth_bal:.6f} SepoliaETH")
            ok = ok and bool(oracle_ok)

    return ok


def main() -> int:
    load_dotenv(BLOCKCHAIN_DIR / ".env")
    parser = argparse.ArgumentParser(description="Sepolia RPC preflight and deployment verifier.")
    parser.add_argument("--rpc-url", default=os.getenv("SEPOLIA_RPC_URL", ""), help="Sepolia HTTPS RPC URL.")
    parser.add_argument("--manifest", type=Path, default=None, help="Optional path to deployments/sepolia.json.")
    args = parser.parse_args()

    if not args.rpc_url or "YOUR_ALCHEMY_API_KEY" in args.rpc_url:
        print("[ERROR] Set SEPOLIA_RPC_URL in blockchain/.env or pass --rpc-url.")
        return 1

    web3 = Web3(Web3.HTTPProvider(args.rpc_url, request_kwargs={"timeout": 10}))
    if not web3.is_connected():
        print("[ERROR] Unable to connect to Sepolia RPC.")
        return 1

    chain_id = web3.eth.chain_id
    if chain_id != SEPOLIA_CHAIN_ID:
        print(f"[ERROR] Wrong chainId={chain_id}; expected {SEPOLIA_CHAIN_ID} (Sepolia).")
        return 1
    print(f"[OK] Connected to Sepolia (chainId={chain_id}, latestBlock={web3.eth.block_number})")

    _check_balance(web3, "Owner", os.getenv("OWNER_ADDRESS", ""))
    _check_balance(web3, "Anchorer", os.getenv("ANCHORER_ADDRESS", ""))
    _check_balance(web3, "Oracle", os.getenv("ORACLE_ADDRESS", ""))

    if args.manifest is not None:
        if not args.manifest.exists():
            print(f"[ERROR] Manifest not found: {args.manifest}")
            return 1
        return 0 if _verify_manifest(web3, args.manifest) else 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
