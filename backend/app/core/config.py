"""Runtime settings loaded from backend/.env and environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ABI_PATH = BACKEND_DIR / "app/integrations/abi/ColdChainInsurance.json"
DEFAULT_INTEGRITY_ABI_PATH = BACKEND_DIR / "app/integrations/abi/ColdChainDataIntegrity.json"
DEFAULT_DEVICE_CONFIG_PATH = BACKEND_DIR.parent / "device/cold_chain_device/config.h"


def is_placeholder(val: str | None) -> bool:
    if not val or not isinstance(val, str):
        return True
    cleaned = val.strip()
    if not cleaned:
        return True
    lower = cleaned.lower()
    if "<" in lower and ">" in lower:
        return True
    placeholders = {
        "placeholder",
        "changeme",
        "your-demo-password",
        "your-admin-password",
        "your-password",
        "your-secret-key",
        "admin123",
        "replace-me",
        "secret",
        "password",
    }
    return lower in placeholders


def validate_auth_config(
    admin_username: str | None,
    admin_password: str | None,
    jwt_secret_key: str | None,
    jwt_access_token_expire_minutes: int,
) -> None:
    # Username/password are bootstrap inputs, validated only when the DB has no
    # Admin. Existing accounts keep working after those inputs are removed.
    if not jwt_secret_key or is_placeholder(jwt_secret_key) or len(jwt_secret_key.encode("utf-8")) < 32:
        raise ValueError("JWT_SECRET_KEY must be at least 32 bytes and cannot be a placeholder")
    if type(jwt_access_token_expire_minutes) is not int or jwt_access_token_expire_minutes <= 0:
        raise ValueError("JWT_ACCESS_TOKEN_EXPIRE_MINUTES must be positive")


def validate_refresh_config(
    app_env: str,
    expire_days: int,
    cookie_name: str,
    cookie_path: str,
    cookie_secure: bool,
    cookie_samesite: str,
    cookie_domain: str,
    cors_origins: tuple[str, ...],
) -> None:
    if type(expire_days) is not int or expire_days <= 0:
        raise ValueError("JWT_REFRESH_TOKEN_EXPIRE_DAYS must be positive")
    if not cookie_name or any(
        not char.isascii() or not (char.isalnum() or char in "_.-")
        for char in cookie_name
    ):
        raise ValueError("REFRESH_COOKIE_NAME is invalid")
    if cookie_path not in {"/api/v1/auth", "/api/v1/auth/"}:
        raise ValueError("REFRESH_COOKIE_PATH must be /api/v1/auth")
    if type(cookie_secure) is not bool:
        raise ValueError("REFRESH_COOKIE_SECURE must be true or false")
    if cookie_samesite not in {"lax", "strict", "none"}:
        raise ValueError("REFRESH_COOKIE_SAMESITE must be lax, strict or none")
    if cookie_samesite == "none" and not cookie_secure:
        raise ValueError("REFRESH_COOKIE_SECURE must be true when SameSite=None")
    if app_env == "production" and not cookie_secure:
        raise ValueError("REFRESH_COOKIE_SECURE must be true in production")
    if cookie_domain and (
        len(cookie_domain) > 253
        or ".." in cookie_domain
        or any(char.isspace() or char in "/:;,=\r\n" for char in cookie_domain)
        or any(
            not char.isascii() or not (char.isalnum() or char in ".-")
            for char in cookie_domain
        )
    ):
        raise ValueError("REFRESH_COOKIE_DOMAIN is invalid")
    if "*" in cors_origins:
        raise ValueError("CORS_ORIGINS cannot contain wildcard when credentials are enabled")


def validate_admin_bootstrap(username: str, password: str) -> None:
    if is_placeholder(username) or not 1 <= len(username.strip()) <= 100:
        raise ValueError("ADMIN_USERNAME is required to initialize the Admin account")
    if is_placeholder(password) or not 1 <= len(password) <= 256:
        raise ValueError("ADMIN_PASSWORD is required to initialize the Admin account")


@dataclass(frozen=True)
class Settings:
    database_url: str | URL
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: tuple[str, ...] = ()
    sensor_gap_minutes: int = 5
    admin_username: str = ""
    admin_password: str = ""
    jwt_secret_key: str = ""
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30
    refresh_cookie_name: str = "coldchain_refresh"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_secure: bool | None = None
    refresh_cookie_samesite: str = "lax"
    refresh_cookie_domain: str = ""
    trusted_proxies: tuple[str, ...] = ("127.0.0.1", "::1")
    max_request_body_bytes: int = 8192
    signed_rate_limit_per_minute: int = 120
    max_sample_gap_seconds: int = 300
    integrity_batch_max_records: int = 100
    integrity_batch_max_age_minutes: int = 5
    payout_requires_anchored_evidence: bool = True
    blockchain_enabled: bool = False
    blockchain_network: str = "localhost"
    blockchain_rpc_url: str = "http://127.0.0.1:8545"
    blockchain_chain_id: int = 31337
    blockchain_contract_address: str = ""
    blockchain_oracle_private_key: str = ""
    blockchain_insurer_private_key: str = ""
    blockchain_default_policy_expiry_days: int = 30
    blockchain_deploy_block: int = 0
    blockchain_abi_path: Path = DEFAULT_ABI_PATH
    data_integrity_contract_address: str = ""
    blockchain_anchorer_private_key: str = ""
    data_integrity_abi_path: Path = DEFAULT_INTEGRITY_ABI_PATH
    blockchain_confirmations: int = 1
    blockchain_receipt_timeout_seconds: int = 15
    google_maps_api_key: str = ""
    geocoding_fallback_nominatim: bool = True
    public_api_base_url: str = ""
    device_provisioning_mode: str = "manual"
    device_config_path: Path = DEFAULT_DEVICE_CONFIG_PATH

    def __post_init__(self) -> None:
        if self.refresh_cookie_secure is None:
            object.__setattr__(self, "refresh_cookie_secure", self.app_env == "production")
        validate_auth_config(
            self.admin_username,
            self.admin_password,
            self.jwt_secret_key,
            self.jwt_access_token_expire_minutes,
        )
        validate_refresh_config(
            self.app_env,
            self.jwt_refresh_token_expire_days,
            self.refresh_cookie_name,
            self.refresh_cookie_path,
            self.refresh_cookie_secure,
            self.refresh_cookie_samesite,
            self.refresh_cookie_domain,
            self.cors_origins,
        )
        if self.device_provisioning_mode not in {"local", "manual"}:
            raise ValueError("DEVICE_PROVISIONING_MODE must be local or manual")
        config_path = Path(self.device_config_path)
        if config_path.name != "config.h":
            raise ValueError("DEVICE_CONFIG_PATH must point to a file named config.h")
        if not config_path.is_absolute():
            config_path = BACKEND_DIR.parent / config_path
        object.__setattr__(self, "device_config_path", config_path.resolve(strict=False))


def _mysql_url() -> URL:
    """Build one PyMySQL URL, preferring the provider-supplied DATABASE_URL."""
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if raw_url:
        try:
            url = make_url(raw_url)
        except ArgumentError as exc:
            raise ValueError("DATABASE_URL is not a valid SQLAlchemy URL") from exc
        if url.get_backend_name() != "mysql":
            raise ValueError("DATABASE_URL must use MySQL")
        if not url.host or not url.database:
            raise ValueError("DATABASE_URL must include a host and database name")
        url = url.set(drivername="mysql+pymysql")
    else:
        url = URL.create(
            "mysql+pymysql",
            username=os.getenv("MYSQL_USER", "coldchain_app"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            host=os.getenv("MYSQL_HOST", "127.0.0.1"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            database=os.getenv("MYSQL_DATABASE", "smart_coldchain"),
        )

    query = {
        key: value for key, value in url.query.items()
        if key.lower() not in {"ssl-mode", "sslmode"}
    }
    query.setdefault("charset", "utf8mb4")
    if ca_path := os.getenv("MYSQL_SSL_CA"):
        query["ssl_ca"] = ca_path
    return url.set(query=query)


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if app_env not in {"development", "test", "production"}:
        raise ValueError("APP_ENV must be development, test or production")

    admin_username = os.getenv("ADMIN_USERNAME", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "")
    jwt_secret_key = os.getenv("JWT_SECRET_KEY", "")
    raw_expire = os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30").strip()
    try:
        jwt_access_token_expire_minutes = int(raw_expire)
    except ValueError as exc:
        raise ValueError("JWT_ACCESS_TOKEN_EXPIRE_MINUTES must be an integer") from exc
    raw_refresh_expire = os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "30").strip()
    try:
        jwt_refresh_token_expire_days = int(raw_refresh_expire)
    except ValueError as exc:
        raise ValueError("JWT_REFRESH_TOKEN_EXPIRE_DAYS must be an integer") from exc

    raw_cookie_secure = os.getenv(
        "REFRESH_COOKIE_SECURE", "true" if app_env == "production" else "false"
    ).strip().lower()
    if raw_cookie_secure not in {"true", "false"}:
        raise ValueError("REFRESH_COOKIE_SECURE must be true or false")
    refresh_cookie_secure = raw_cookie_secure == "true"
    refresh_cookie_samesite = os.getenv("REFRESH_COOKIE_SAMESITE", "lax").strip().lower()
    refresh_cookie_domain = os.getenv("REFRESH_COOKIE_DOMAIN", "").strip()

    raw_trusted_proxies = os.getenv("TRUSTED_PROXIES", "127.0.0.1,::1")
    trusted_proxies = tuple(
        p.strip() for p in raw_trusted_proxies.split(",") if p.strip()
    )

    validate_auth_config(
        admin_username,
        admin_password,
        jwt_secret_key,
        jwt_access_token_expire_minutes,
    )

    cors_origins = tuple(
        origin.strip().rstrip("/")
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    )
    if app_env == "production":
        if not cors_origins or "*" in cors_origins:
            raise ValueError("CORS_ORIGINS must be an explicit allowlist in production")
    validate_refresh_config(
        app_env,
        jwt_refresh_token_expire_days,
        os.getenv("REFRESH_COOKIE_NAME", "coldchain_refresh").strip(),
        os.getenv("REFRESH_COOKIE_PATH", "/api/v1/auth").strip(),
        refresh_cookie_secure,
        refresh_cookie_samesite,
        refresh_cookie_domain,
        cors_origins,
    )
    enabled_text = os.getenv("BLOCKCHAIN_ENABLED", "false").lower()
    if enabled_text not in {"true", "false"}:
        raise ValueError("BLOCKCHAIN_ENABLED must be true or false")
    blockchain_enabled = enabled_text == "true"
    contract_address = os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS", "").strip()
    oracle_private_key = os.getenv("BLOCKCHAIN_ORACLE_PRIVATE_KEY", "").strip()
    insurer_private_key = os.getenv("BLOCKCHAIN_INSURER_PRIVATE_KEY", "").strip()
    if bool(contract_address) != bool(oracle_private_key):
        raise ValueError(
            "BLOCKCHAIN_CONTRACT_ADDRESS and BLOCKCHAIN_ORACLE_PRIVATE_KEY must be set together"
        )
    if insurer_private_key and not contract_address:
        raise ValueError(
            "BLOCKCHAIN_CONTRACT_ADDRESS is required when BLOCKCHAIN_INSURER_PRIVATE_KEY is set"
        )
    default_policy_expiry_days = int(os.getenv("BLOCKCHAIN_DEFAULT_POLICY_EXPIRY_DAYS", "30"))
    if default_policy_expiry_days <= 0:
        raise ValueError("BLOCKCHAIN_DEFAULT_POLICY_EXPIRY_DAYS must be positive")
    deploy_block = int(os.getenv("BLOCKCHAIN_DEPLOY_BLOCK", "0"))
    if deploy_block < 0:
        raise ValueError("BLOCKCHAIN_DEPLOY_BLOCK must be non-negative")
    google_maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    nominatim_fallback_text = os.getenv("GEOCODING_FALLBACK_NOMINATIM", "true").strip().lower()
    if nominatim_fallback_text not in {"true", "false"}:
        raise ValueError("GEOCODING_FALLBACK_NOMINATIM must be true or false")
    abi_path = Path(os.getenv("BLOCKCHAIN_ABI_PATH", str(DEFAULT_ABI_PATH)))
    if not abi_path.is_absolute():
        abi_path = BACKEND_DIR.parent / abi_path
    integrity_contract_address = os.getenv("DATA_INTEGRITY_CONTRACT_ADDRESS", "")
    anchorer_private_key = os.getenv("BACKEND_ANCHORER_PRIVATE_KEY", "")
    if bool(integrity_contract_address) != bool(anchorer_private_key):
        raise ValueError(
            "DATA_INTEGRITY_CONTRACT_ADDRESS and BACKEND_ANCHORER_PRIVATE_KEY must be set together"
        )
    if blockchain_enabled and not (
        (contract_address and oracle_private_key)
        or (integrity_contract_address and anchorer_private_key)
    ):
        raise ValueError(
            "Blockchain contract address and oracle private key, or Data Integrity contract and "
            "anchorer private key, are required when enabled"
        )
    integrity_abi_path = Path(
        os.getenv("DATA_INTEGRITY_ABI_PATH", str(DEFAULT_INTEGRITY_ABI_PATH))
    )
    if not integrity_abi_path.is_absolute():
        integrity_abi_path = BACKEND_DIR.parent / integrity_abi_path
    confirmations = int(os.getenv("BLOCKCHAIN_CONFIRMATIONS", "1"))
    if confirmations <= 0:
        raise ValueError("BLOCKCHAIN_CONFIRMATIONS must be positive")
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
    max_sample_gap_seconds = int(
        os.getenv("MAX_SAMPLE_GAP_SECONDS", str(sensor_gap_minutes * 60))
    )
    if max_sample_gap_seconds <= 0:
        raise ValueError("MAX_SAMPLE_GAP_SECONDS must be positive")
    payout_evidence_text = os.getenv("PAYOUT_REQUIRES_ANCHORED_EVIDENCE", "true").lower()
    if payout_evidence_text not in {"true", "false"}:
        raise ValueError("PAYOUT_REQUIRES_ANCHORED_EVIDENCE must be true or false")
    integrity_batch_max_records = int(os.getenv("INTEGRITY_BATCH_MAX_RECORDS", "100"))
    if not 1 <= integrity_batch_max_records <= 100:
        raise ValueError("INTEGRITY_BATCH_MAX_RECORDS must be in [1, 100]")
    integrity_batch_max_age_minutes = int(os.getenv("INTEGRITY_BATCH_MAX_AGE_MINUTES", "5"))
    if integrity_batch_max_age_minutes <= 0:
        raise ValueError("INTEGRITY_BATCH_MAX_AGE_MINUTES must be positive")
    device_provisioning_mode = os.getenv(
        "DEVICE_PROVISIONING_MODE",
        "manual" if app_env == "production" else "local",
    ).strip().lower()
    return Settings(
        database_url=_mysql_url(),
        app_env=app_env,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        cors_origins=cors_origins,
        sensor_gap_minutes=sensor_gap_minutes,
        admin_username=admin_username,
        admin_password=admin_password,
        jwt_secret_key=jwt_secret_key,
        jwt_access_token_expire_minutes=jwt_access_token_expire_minutes,
        jwt_refresh_token_expire_days=jwt_refresh_token_expire_days,
        refresh_cookie_name=os.getenv("REFRESH_COOKIE_NAME", "coldchain_refresh").strip(),
        refresh_cookie_path=os.getenv("REFRESH_COOKIE_PATH", "/api/v1/auth").strip(),
        refresh_cookie_secure=refresh_cookie_secure,
        refresh_cookie_samesite=refresh_cookie_samesite,
        refresh_cookie_domain=refresh_cookie_domain,
        trusted_proxies=trusted_proxies,
        max_request_body_bytes=max_request_body_bytes,
        signed_rate_limit_per_minute=signed_rate_limit_per_minute,
        max_sample_gap_seconds=max_sample_gap_seconds,
        integrity_batch_max_records=integrity_batch_max_records,
        integrity_batch_max_age_minutes=integrity_batch_max_age_minutes,
        payout_requires_anchored_evidence=payout_evidence_text == "true",
        blockchain_enabled=blockchain_enabled,
        blockchain_network=os.getenv("BLOCKCHAIN_NETWORK", "localhost"),
        blockchain_rpc_url=os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545"),
        blockchain_chain_id=int(os.getenv("BLOCKCHAIN_CHAIN_ID", "31337")),
        blockchain_contract_address=contract_address,
        blockchain_oracle_private_key=oracle_private_key,
        blockchain_insurer_private_key=insurer_private_key,
        blockchain_default_policy_expiry_days=default_policy_expiry_days,
        blockchain_deploy_block=deploy_block,
        blockchain_abi_path=abi_path,
        data_integrity_contract_address=integrity_contract_address,
        blockchain_anchorer_private_key=anchorer_private_key,
        data_integrity_abi_path=integrity_abi_path,
        blockchain_confirmations=confirmations,
        blockchain_receipt_timeout_seconds=receipt_timeout,
        google_maps_api_key=google_maps_api_key,
        geocoding_fallback_nominatim=nominatim_fallback_text == "true",
        public_api_base_url=os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/"),
        device_provisioning_mode=device_provisioning_mode,
        device_config_path=Path(os.getenv(
            "DEVICE_CONFIG_PATH",
            "device/cold_chain_device/config.h",
        ).strip()),
    )
