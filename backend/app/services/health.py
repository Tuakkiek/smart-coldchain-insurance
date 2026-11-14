"""Dependency checks for liveness and readiness endpoints."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine
from web3 import Web3


ComponentStatus = str


def database_status(engine: Engine) -> ComponentStatus:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "unavailable"


def blockchain_status(settings) -> ComponentStatus:
    if not settings.blockchain_enabled:
        return "unavailable"
    try:
        web3 = Web3(Web3.HTTPProvider(settings.blockchain_rpc_url, request_kwargs={"timeout": 2}))
        if not web3.is_connected():
            return "unavailable"
        return "ok" if web3.eth.chain_id == settings.blockchain_chain_id else "degraded"
    except Exception:
        return "unavailable"


def service_health(engine: Engine, settings) -> dict[str, ComponentStatus]:
    database = database_status(engine)
    blockchain = blockchain_status(settings)
    degraded = database != "ok" or (settings.blockchain_enabled and blockchain != "ok")
    return {
        "status": "degraded" if degraded else "ok",
        "database": database,
        "blockchain": blockchain,
    }
