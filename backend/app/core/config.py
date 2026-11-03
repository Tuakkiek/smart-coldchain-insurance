"""Runtime settings loaded from backend/.env and environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: tuple[str, ...] = ()


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
    default_database = (BACKEND_DIR / "coldchain.db").as_posix()
    return Settings(
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{default_database}"),
        app_env=os.getenv("APP_ENV", "development"),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        ),
    )
