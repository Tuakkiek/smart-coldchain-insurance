"""Exact Ethereum unit conversion (ETH -> Wei) and EIP-55 wallet validation.

Never uses binary floating point (float) for ETH amounts.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from web3 import Web3


SEPOLIA_CHAIN_ID = 11155111
SEPOLIA_NETWORK_NAME = "Sepolia Testnet"
SEPOLIA_CURRENCY = "SepoliaETH"
UINT256_MAX = (1 << 256) - 1
WEI_PER_ETH = Decimal(10**18)

_ETH_DECIMAL_PATTERN = re.compile(r"^\d+(?:\.\d{1,18})?$")
_ETH_ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
_TX_HASH_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")


def parse_eth_to_wei(raw: object) -> tuple[str, str]:
    """Validate a decimal SepoliaETH string and return (normalized_eth, wei_str).

    Raises ValueError for non-string, negative, zero, >18 decimals, scientific
    notation, invalid characters, or uint256 overflow.
    """
    if not isinstance(raw, str):
        raise ValueError("Số tiền bảo hiểm SepoliaETH phải là chuỗi số thập phân")
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("Số tiền bảo hiểm SepoliaETH không được để trống")
    if not _ETH_DECIMAL_PATTERN.fullmatch(cleaned):
        if cleaned.startswith("-"):
            raise ValueError("Số tiền bảo hiểm phải lớn hơn 0")
        if "." in cleaned and re.fullmatch(r"^\d+\.\d{19,}$", cleaned):
            raise ValueError("Số tiền bảo hiểm chỉ hỗ trợ tối đa 18 chữ số thập phân")
        raise ValueError("Số tiền bảo hiểm SepoliaETH không hợp lệ")

    try:
        dec = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError("Số tiền bảo hiểm SepoliaETH không hợp lệ") from exc

    if not dec.is_finite() or dec <= 0:
        raise ValueError("Số tiền bảo hiểm phải lớn hơn 0")

    wei_decimal = dec * WEI_PER_ETH
    if wei_decimal != wei_decimal.to_integral_value():
        raise ValueError("Số tiền bảo hiểm chỉ hỗ trợ tối đa 18 chữ số thập phân")

    wei_int = int(wei_decimal)
    # Cross-check with Web3.to_wei using Decimal (never float)
    if wei_int != int(Web3.to_wei(dec, "ether")):
        raise ValueError("Lỗi chuyển đổi đơn vị ETH sang Wei")

    if wei_int <= 0:
        raise ValueError("Số tiền bảo hiểm phải lớn hơn 0")
    if wei_int > UINT256_MAX:
        raise ValueError("Số tiền bảo hiểm vượt quá giới hạn uint256 của Smart Contract")

    normalized = format(dec.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized, str(wei_int)


def validate_and_checksum_wallet(raw: object) -> str:
    """Validate an Ethereum address (0x + 40 hex + EIP-55 checksum if mixed-case).

    Returns the EIP-55 checksummed address.
    """
    if not isinstance(raw, str):
        raise ValueError("Địa chỉ ví người mua bảo hiểm phải là chuỗi ký tự")
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("Địa chỉ ví người mua bảo hiểm không được để trống")
    if not _ETH_ADDRESS_PATTERN.fullmatch(cleaned):
        raise ValueError("Địa chỉ ví không đúng định dạng Ethereum (0x + 40 ký tự hex)")
    if not Web3.is_address(cleaned):
        raise ValueError("Địa chỉ ví không hợp lệ")

    hex_part = cleaned[2:]
    has_upper = any("A" <= ch <= "F" for ch in hex_part)
    has_lower = any("a" <= ch <= "f" for ch in hex_part)
    if has_upper and has_lower and not Web3.is_checksum_address(cleaned):
        raise ValueError("Địa chỉ ví sai checksum EIP-55")

    return Web3.to_checksum_address(cleaned)


def format_wei_to_eth(raw_wei: str | int | None) -> str | None:
    """Convert a wei integer or decimal string into a normalized ETH decimal string."""
    if raw_wei is None or raw_wei == "":
        return None
    try:
        dec = Decimal(str(raw_wei)) / WEI_PER_ETH
    except (InvalidOperation, ValueError):
        return None
    normalized = format(dec.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized


def validate_tx_hash(raw: object) -> str:
    """Validate a 32-byte Ethereum transaction hash (0x + 64 hex)."""
    if not isinstance(raw, str):
        raise ValueError("Transaction hash phải là chuỗi ký tự")
    cleaned = raw.strip()
    if not _TX_HASH_PATTERN.fullmatch(cleaned):
        raise ValueError("Transaction hash không hợp lệ (cần 0x + 64 ký tự hex)")
    return cleaned.lower()
