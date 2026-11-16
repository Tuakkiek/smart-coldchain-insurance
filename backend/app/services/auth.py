"""Authentication service for single-admin Login/JWT and rate limiting."""

from __future__ import annotations

from datetime import datetime, timezone
import ipaddress
import logging
import secrets
import threading
import time
from typing import Any

from fastapi import Request
import jwt

from app.core.config import Settings


logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Domain exception for authentication and authorization errors."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers or {}
        super().__init__(message)


class LoginRateLimiter:
    """In-memory sliding window rate limiter per client IP for login attempts.

    LIMITATION NOTE:
    This rate limiter stores attempt timestamps in process memory.
    1. State resets when the backend process restarts.
    2. In multi-worker / multi-process environments, each worker maintains its
       own in-memory bucket unless a distributed cache (such as Redis) is configured.
    For single-instance deployments (such as Render Web Services), this provides
    effective brute-force mitigation without adding external infrastructure.
    """

    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check_and_record(self, client_ip: str, now: float | None = None) -> tuple[bool, int]:
        """Check if request is allowed and record the attempt.

        Returns:
            (allowed: bool, retry_after: int)
        """
        current_time = time.time() if now is None else now
        cutoff = current_time - self.window_seconds

        with self._lock:
            timestamps = self._attempts.get(client_ip, [])
            timestamps = [t for t in timestamps if t > cutoff]
            if len(timestamps) >= self.max_attempts:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + self.window_seconds - current_time) + 1)
                self._attempts[client_ip] = timestamps
                return False, retry_after

            timestamps.append(current_time)
            self._attempts[client_ip] = timestamps
            return True, 0

    def reset(self) -> None:
        """Clear all rate limit state (useful in tests)."""
        with self._lock:
            self._attempts.clear()


def is_ip_in_trusted(ip_str: str, trusted_proxies: tuple[str, ...]) -> bool:
    """Check if an IP string is in the trusted proxies list (supports exact match & CIDR)."""
    if not trusted_proxies:
        return False
    ip_str = ip_str.strip()
    if not ip_str:
        return False
    if ip_str in trusted_proxies:
        return True

    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    for trusted in trusted_proxies:
        trusted = trusted.strip()
        if not trusted:
            continue
        try:
            if "/" in trusted:
                if ip_obj in ipaddress.ip_network(trusted, strict=False):
                    return True
            else:
                if ip_obj == ipaddress.ip_address(trusted):
                    return True
        except ValueError:
            if ip_str == trusted:
                return True
    return False


def resolve_client_ip(request: Request, trusted_proxies: tuple[str, ...]) -> str:
    """Resolve the genuine client IP address.

    Security model:
    - If the direct peer (request.client.host) is NOT in trusted_proxies, any X-Forwarded-For
      header is strictly IGNORED to prevent client IP spoofing to evade rate limits.
    - If the direct peer IS trusted, X-Forwarded-For is evaluated from right to left to locate
      the first untrusted IP (the real client).
    """
    direct_ip = request.client.host if request.client else "127.0.0.1"
    if not is_ip_in_trusted(direct_ip, trusted_proxies):
        return direct_ip

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return direct_ip

    raw_ips = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
    if not raw_ips:
        return direct_ip

    for candidate in reversed(raw_ips):
        if not is_ip_in_trusted(candidate, trusted_proxies):
            return candidate
    return raw_ips[0]


def create_access_token(
    username: str,
    secret_key: str,
    expire_minutes: int = 30,
    clock: Any = None,
) -> str:
    """Generate a signed HS256 JWT access token with required sub, iat, exp claims."""
    now = clock.now() if clock is not None else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now_ts = int(now.timestamp())
    exp_ts = now_ts + (expire_minutes * 60)

    payload = {
        "sub": username,
        "iat": now_ts,
        "exp": exp_ts,
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")


def decode_and_verify_token(
    token: str,
    secret_key: str,
    expected_username: str,
    clock: Any = None,
) -> dict[str, Any]:
    """Decode and verify an HS256 JWT access token.

    Enforces:
    - Fixed server-side HS256 algorithm (client-selected algorithms rejected).
    - Signature verification.
    - Presence of 'sub', 'iat', 'exp' claims.
    - Expiration check against current time.
    - Subject must match configured single admin username exactly.
    """
    options = {
        "require": ["sub", "iat", "exp"],
        "verify_signature": True,
        "verify_exp": clock is None,
        "verify_iat": clock is None,
    }

    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=["HS256"],
            options=options,
        )
        if clock is not None:
            now = clock.now()
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)
            now_ts = int(now.timestamp())
            exp_ts = payload.get("exp")
            if not isinstance(exp_ts, (int, float)) or exp_ts < now_ts:
                raise jwt.ExpiredSignatureError("Signature has expired")
            iat_ts = payload.get("iat")
            if not isinstance(iat_ts, (int, float)) or iat_ts > now_ts + 60:
                raise jwt.InvalidIssuedAtError("Issued at time is in the future")
    except jwt.PyJWTError as exc:
        logger.warning("JWT verification failed: %s", type(exc).__name__)
        raise AuthError(
            401,
            "UNAUTHORIZED",
            "Xác thực không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub = payload.get("sub")
    if not isinstance(sub, str) or not secrets.compare_digest(sub, expected_username):
        logger.warning("JWT subject mismatch")
        raise AuthError(
            401,
            "UNAUTHORIZED",
            "Xác thực không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def authenticate_admin(username: str, password: str, settings: Settings) -> bool:
    """Constant-time check of admin credentials against configured environment settings."""
    username_match = secrets.compare_digest(username, settings.admin_username)
    password_match = secrets.compare_digest(password, settings.admin_password)
    return username_match and password_match
