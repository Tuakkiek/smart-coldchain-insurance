"""Runtime settings loaded from backend/.env and environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ABI_PATH = BACKEND_DIR.parent / "blockchain/artifacts/contracts/ColdChainInsurance.sol/ColdChainInsurance.json"


@dataclass(frozen=True)
class Settings:
    database_url: str | URL
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: tuple[str, ...] = ()
    sensor_gap_minutes: int = 5
    admin_api_key: str = ""
    max_request_body_bytes: int = 8192
    signed_rate_limit_per_minute: int = 120
    blockchain_enabled: bool = False
    blockchain_network: str = "localhost"
    blockchain_rpc_url: str = "http://127.0.0.1:8545"
    blockchain_chain_id: int = 31337
    blockchain_contract_address: str = ""
    blockchain_oracle_private_key: str = ""
    blockchain_abi_path: Path = DEFAULT_ABI_PATH
    blockchain_receipt_timeout_seconds: int = 15


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
    enabled_text = os.getenv("BLOCKCHAIN_ENABLED", "false").lower()
    if enabled_text not in {"true", "false"}:
        raise ValueError("BLOCKCHAIN_ENABLED must be true or false")
    blockchain_enabled = enabled_text == "true"
    contract_address = os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS", "")
    oracle_private_key = os.getenv("BLOCKCHAIN_ORACLE_PRIVATE_KEY", "")
    if blockchain_enabled and (not contract_address or not oracle_private_key):
        raise ValueError("Blockchain contract address and oracle private key are required when enabled")
    abi_path = Path(os.getenv("BLOCKCHAIN_ABI_PATH", str(DEFAULT_ABI_PATH)))
    if not abi_path.is_absolute():
        abi_path = BACKEND_DIR.parent / abi_path
    receipt_timeout = int(os.getenv("BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS", "15"))
    if receipt_timeout <= 0:
        raise ValueError("BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS must be positive")
    sensor_gap_minutes = int(os.getenv("SENSOR_GAP_MINUTES", "5"))
    if sensor_gap_minutes <= 0:
        raise ValueError("SENSOR_GAP_MINUTES must be positive")
    max_request_body_bytes = int(os.getenv("MAX_REQUEST_BODY_BYTES", "8192"))
    if max_request_body_bytes < 1024:
        raise ValueError("MAX_REQUEST_BODY_BYTES must be at least 1024")
    signed_rate_limit_per_minute = int(os.getenv("SIGNED_RATE_LIMIT_PER_MINUTE", "120"))
    if signed_rate_limit_per_minute <= 0:
        raise ValueError("SIGNED_RATE_LIMIT_PER_MINUTE must be positive")
    query = {"charset": "utf8mb4"}
    if ca_path := os.getenv("MYSQL_SSL_CA"):
        query["ssl_ca"] = ca_path
    return Settings(
        database_url=URL.create(
            "mysql+pymysql",
            username=os.getenv("MYSQL_USER", "coldchain_app"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            host=os.getenv("MYSQL_HOST", "127.0.0.1"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            database=os.getenv("MYSQL_DATABASE", "smart_coldchain"),
            query=query,
        ),
        app_env=os.getenv("APP_ENV", "development"),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        ),
        sensor_gap_minutes=sensor_gap_minutes,
        admin_api_key=os.getenv("ADMIN_API_KEY", ""),
        max_request_body_bytes=max_request_body_bytes,
        signed_rate_limit_per_minute=signed_rate_limit_per_minute,
        blockchain_enabled=blockchain_enabled,
        blockchain_network=os.getenv("BLOCKCHAIN_NETWORK", "localhost"),
        blockchain_rpc_url=os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545"),
        blockchain_chain_id=int(os.getenv("BLOCKCHAIN_CHAIN_ID", "31337")),
        blockchain_contract_address=contract_address,
        blockchain_oracle_private_key=oracle_private_key,
        blockchain_abi_path=abi_path,
        blockchain_receipt_timeout_seconds=receipt_timeout,
    )
