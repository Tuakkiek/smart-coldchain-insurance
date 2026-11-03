"""Runtime settings loaded from backend/.env and environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL


BACKEND_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str | URL
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: tuple[str, ...] = ()


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
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
    )
