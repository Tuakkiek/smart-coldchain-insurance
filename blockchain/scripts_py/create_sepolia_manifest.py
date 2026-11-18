"""Generate blockchain/deployments/sepolia.json after real MetaMask/Remix deploy.

Never stores private keys, mnemonics, or RPC API keys.

Usage:
    python blockchain/scripts_py/create_sepolia_manifest.py \
        --integrity-address 0x... --integrity-tx 0x... --integrity-block 123457 \
        --insurance-address 0x... --insurance-tx 0x... --insurance-block 123458 \
        --owner 0x... --anchorer 0x... --oracle 0x...
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from web3 import Web3


BLOCKCHAIN_DIR = Path(__file__).resolve().parents[1]
COMPILER_SETTINGS_PATH = BLOCKCHAIN_DIR / "compiler-settings.json"
OUT_MANIFEST_PATH = BLOCKCHAIN_DIR / "deployments" / "sepolia.json"


def _checksum(addr: str) -> str:
    return Web3.to_checksum_address(addr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Sepolia deployment manifest without secrets.")
    parser.add_argument("--integrity-address", required=True)
    parser.add_argument("--integrity-tx", required=True)
    parser.add_argument("--integrity-block", required=True, type=int)
    parser.add_argument("--insurance-address", required=True)
    parser.add_argument("--insurance-tx", required=True)
    parser.add_argument("--insurance-block", required=True, type=int)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--anchorer", required=True)
    parser.add_argument("--oracle", required=True)
    parser.add_argument("--confirmations", type=int, default=2)
    args = parser.parse_args()

    compiler_cfg = json.loads(COMPILER_SETTINGS_PATH.read_text(encoding="utf-8"))
    toolchain = compiler_cfg["toolchain"]

    contracts_manifest: dict[str, dict] = {
        "ColdChainDataIntegrity": {
            "address": _checksum(args.integrity_address),
            "deployTxHash": args.integrity_tx,
            "deployBlockNumber": args.integrity_block,
            "abiPath": "blockchain/deployments/abi/ColdChainDataIntegrity.abi.json",
            "backendAbiPath": "backend/app/integrations/abi/ColdChainDataIntegrity.json",
        },
        "ColdChainInsurance": {
            "address": _checksum(args.insurance_address),
            "deployTxHash": args.insurance_tx,
            "deployBlockNumber": args.insurance_block,
            "abiPath": "blockchain/deployments/abi/ColdChainInsurance.abi.json",
            "backendAbiPath": "backend/app/integrations/abi/ColdChainInsurance.json",
        },
    }

    manifest = {
        "network": "sepolia",
        "chainId": 11155111,
        "currency": "SepoliaETH (Native)",
        "recommendedPolicyDepositETH": "0.01",
        "recommendedPolicyDepositWei": "10000000000000000",
        "explorer": "https://sepolia.etherscan.io",
        "confirmations": args.confirmations,
        "deployedVia": "Remix IDE + Browser Extension (MetaMask)",
        "compiler": {
            "version": toolchain["compilerVersion"],
            "optimizer": toolchain["optimizer"],
            "evmVersion": toolchain["evmVersion"],
            "viaIR": toolchain["viaIR"],
            "openzeppelin": compiler_cfg["dependencies"]["@openzeppelin/contracts"]["pinnedVersion"],
        },
        "contracts": contracts_manifest,
        "roles": {
            "owner": _checksum(args.owner),
            "anchorer": _checksum(args.anchorer),
            "oracle": _checksum(args.oracle),
        },
        "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "note": "Public addresses and tx metadata only. Never store private keys or Alchemy API keys here.",
    }

    OUT_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] Wrote {OUT_MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
