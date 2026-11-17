"""Authentication service for single-admin Login/JWT and rate limiting."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import ipaddress
import base64
import hashlib
import hmac
import logging
import secrets
import threading
import time
from typing import Any
from uuid import uuid4

from fastapi import Request
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import Settings, validate_admin_bootstrap
from app.models import AdminAccount, RefreshToken


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
    if (
        not isinstance(sub, str)
        or not isinstance(expected_username, str)
        or not secrets.compare_digest(sub.encode("utf-8"), expected_username.encode("utf-8"))
    ):
        logger.warning("JWT subject mismatch")
        raise AuthError(
            401,
            "UNAUTHORIZED",
            "Xác thực không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


PASSWORD_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 with a fresh 128-bit salt; never store plaintext."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS, base64.b64encode(salt).decode("ascii"), base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split("$")
        iterations = int(rounds)
        if algorithm != "pbkdf2_sha256" or not PASSWORD_ITERATIONS <= iterations <= 2_000_000:
            return False
        salt_bytes = base64.b64decode(salt, validate=True)
        digest_bytes = base64.b64decode(expected, validate=True)
        if len(salt_bytes) != 16 or len(digest_bytes) != 32:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, iterations)
        return secrets.compare_digest(actual, digest_bytes)
    except (ValueError, TypeError):
        return False


def initialize_admin(session: Session, settings: Settings) -> AdminAccount:
    """Seed id=1 once, tolerate concurrent starts, never reset an existing account."""
    account = session.get(AdminAccount, 1)
    if account is not None:
        return account
    validate_admin_bootstrap(settings.admin_username, settings.admin_password)
    account = AdminAccount(id=1, username=settings.admin_username.strip(), password_hash=hash_password(settings.admin_password))
    session.add(account)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        account = session.get(AdminAccount, 1)
        if account is None:
            raise
    return account


def auth_account(session: Session, settings: Settings) -> AdminAccount:
    try:
        return initialize_admin(session, settings)
    except ValueError:
        raise AuthError(503, "ADMIN_NOT_INITIALIZED", "Chưa khởi tạo tài khoản Admin. Cấu hình thông tin khởi tạo ở Backend và chạy upgrade-db.") from None
    except SQLAlchemyError:
        # No environment-credential fallback when MySQL/schema is unavailable.
        raise AuthError(503, "AUTH_STORAGE_UNAVAILABLE", "Không thể truy cập tài khoản Admin trong database. Kiểm tra kết nối MySQL và migration.") from None


def authenticate_admin(username: str, password: str, account: AdminAccount) -> bool:
    if not isinstance(username, str) or not isinstance(password, str):
        return False
    username_match = secrets.compare_digest(username.encode("utf-8"), account.username.encode("utf-8"))
    password_match = verify_password(password, account.password_hash)
    return bool(account.is_active) and username_match and password_match


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _refresh_token_hash(token: str, secret_key: str) -> str:
    return hmac.new(
        secret_key.encode("utf-8"), token.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _account_snapshot_hash(account: AdminAccount, secret_key: str) -> str:
    snapshot = "\0".join(
        (str(account.id), account.username, account.password_hash, str(account.security_version))
    )
    return hmac.new(
        secret_key.encode("utf-8"), snapshot.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _new_refresh_token(
    account: AdminAccount,
    settings: Settings,
    now: datetime,
    family_id: str | None = None,
    expires_at: datetime | None = None,
) -> tuple[str, RefreshToken]:
    plaintext = secrets.token_urlsafe(48)
    row = RefreshToken(
        id=str(uuid4()),
        family_id=family_id or str(uuid4()),
        admin_account_id=account.id,
        token_hash=_refresh_token_hash(plaintext, settings.jwt_secret_key),
        account_snapshot_hash=_account_snapshot_hash(account, settings.jwt_secret_key),
        expires_at=expires_at
        or now + timedelta(days=settings.jwt_refresh_token_expire_days),
        created_at=now,
    )
    return plaintext, row


def issue_refresh_token(
    session: Session,
    account: AdminAccount,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    """Create the first opaque token in a refresh family and persist only its HMAC."""
    issued_at = _as_utc(now or datetime.now(timezone.utc))
    plaintext, row = _new_refresh_token(account, settings, issued_at)
    session.add(row)
    session.commit()
    return plaintext, _as_utc(row.expires_at)


def _refresh_error(code: str, message: str) -> AuthError:
    return AuthError(401, code, message)


def _find_refresh_token(
    session: Session, token: str, settings: Settings
) -> RefreshToken | None:
    if not isinstance(token, str) or not 1 <= len(token) <= 256:
        return None
    token_hash = _refresh_token_hash(token, settings.jwt_secret_key)
    return session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )


def _revoke_family(
    session: Session, family_id: str, now: datetime, reason: str
) -> None:
    rows = session.scalars(
        select(RefreshToken)
        .where(RefreshToken.family_id == family_id)
        .with_for_update()
    ).all()
    for row in rows:
        if row.revoked_at is None:
            row.revoked_at = now
            row.revoke_reason = reason


def rotate_refresh_token(
    session: Session,
    token: str,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[str, datetime, AdminAccount]:
    """Consume one refresh token exactly once and issue its replacement."""
    rotated_at = _as_utc(now or datetime.now(timezone.utc))
    current = _find_refresh_token(session, token, settings)
    if current is None:
        raise _refresh_error("REFRESH_TOKEN_INVALID", "Refresh token không hợp lệ")

    if current.used_at is not None:
        _revoke_family(session, current.family_id, rotated_at, "reuse_detected")
        session.commit()
        raise _refresh_error(
            "REFRESH_TOKEN_REUSED", "Refresh token đã được sử dụng; phiên đã bị thu hồi"
        )
    if current.revoked_at is not None:
        if current.revoke_reason == "expired":
            raise _refresh_error("REFRESH_TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn")
        if current.revoke_reason == "account_changed":
            raise _refresh_error("SESSION_INVALID", "Phiên đăng nhập không còn hợp lệ")
        raise _refresh_error("REFRESH_TOKEN_REVOKED", "Phiên đăng nhập đã bị thu hồi")
    if _as_utc(current.expires_at) <= rotated_at:
        current.revoked_at = rotated_at
        current.revoke_reason = "expired"
        session.commit()
        raise _refresh_error("REFRESH_TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn")

    account = session.get(AdminAccount, current.admin_account_id)
    valid_account = (
        account is not None
        and account.is_active
        and secrets.compare_digest(
            current.account_snapshot_hash,
            _account_snapshot_hash(account, settings.jwt_secret_key),
        )
    )
    if not valid_account:
        _revoke_family(session, current.family_id, rotated_at, "account_changed")
        session.commit()
        raise _refresh_error("SESSION_INVALID", "Phiên đăng nhập không còn hợp lệ")

    plaintext, replacement = _new_refresh_token(
        account,
        settings,
        rotated_at,
        family_id=current.family_id,
        expires_at=_as_utc(current.expires_at),
    )
    session.add(replacement)
    # The replacement must exist before the self-referencing FK is assigned.
    session.flush()
    current.used_at = rotated_at
    current.replaced_by_id = replacement.id
    session.commit()
    return plaintext, _as_utc(replacement.expires_at), account


def revoke_refresh_token(
    session: Session,
    token: str | None,
    settings: Settings,
    now: datetime | None = None,
) -> None:
    """Revoke the server-side token family. Unknown/missing tokens keep logout idempotent."""
    if not token:
        return
    revoked_at = _as_utc(now or datetime.now(timezone.utc))
    current = _find_refresh_token(session, token, settings)
    if current is None:
        return
    _revoke_family(session, current.family_id, revoked_at, "logout")
    session.commit()
