"""Local-only ESP32 key provisioning during Admin device registration.

The private key exists only in memory until this service writes it to the one
configured firmware file.  It is never stored in MySQL and never returned by
an API response.
"""

from __future__ import annotations

import os
import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Device, DeviceKey
from app.services import signed_ingestion


DEFAULT_KEY_ID = "key-v1"


class ProvisioningError(Exception):
    """An expected provisioning failure safe to expose through the API."""

    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message
        super().__init__(message)


@dataclass(frozen=True)
class ConfigSnapshot:
    content: bytes | None
    mode: int | None


class FirmwareConfigWriter:
    """Update only device identity and key declarations in a fixed config.h."""

    _PRIVATE_KEY_PATTERN = re.compile(
        r'(static\s+const\s+char\s+DEVICE_PRIVATE_KEY_PEM\s*\[\s*\]\s*=\s*'
        r'R"(?P<delimiter>[A-Za-z0-9_]{0,16})\()'
        r'(.*?)'
        r'(\)(?P=delimiter)"\s*;)',
        re.DOTALL,
    )

    def __init__(self, config_path: Path):
        # The path comes from trusted server configuration, never from a request.
        self.config_path = config_path.expanduser().resolve(strict=False)
        self.template_path = self.config_path.with_name("config.example.h")

    @staticmethod
    def _replace_define(content: str, name: str, value: str) -> str:
        pattern = re.compile(
            rf'^(?P<prefix>\s*#\s*define\s+{re.escape(name)}\s+)'
            rf'"[^"\r\n]*"(?P<suffix>[^\r\n]*)(?=\r?$)',
            re.MULTILINE,
        )
        updated, count = pattern.subn(
            lambda match: f'{match.group("prefix")}"{value}"{match.group("suffix")}',
            content,
        )
        if count != 1:
            raise ProvisioningError(
                500,
                "CONFIG_FORMAT_INVALID",
                f"Expected exactly one {name} declaration in firmware config",
            )
        return updated

    @staticmethod
    def _atomic_write(path: Path, content: bytes, mode: int | None) -> None:
        temp_path: Path | None = None
        try:
            file_descriptor, raw_temp_path = tempfile.mkstemp(
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
            )
            temp_path = Path(raw_temp_path)
            with os.fdopen(file_descriptor, "wb") as temp_file:
                temp_file.write(content)
                temp_file.flush()
                os.fsync(temp_file.fileno())
            if mode is not None:
                os.chmod(temp_path, mode)
            os.replace(temp_path, path)
            temp_path = None
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    def update(self, device_id: str, key_id: str, private_key_pem: str) -> ConfigSnapshot:
        try:
            if self.config_path.exists():
                original = self.config_path.read_bytes()
                mode = self.config_path.stat().st_mode
            else:
                if not self.template_path.is_file():
                    raise ProvisioningError(
                        500,
                        "CONFIG_TEMPLATE_NOT_FOUND",
                        f"Firmware config template not found: {self.template_path}",
                    )
                original = None
                mode = self.template_path.stat().st_mode

            source = original if original is not None else self.template_path.read_bytes()
            content = source.decode("utf-8")
        except ProvisioningError:
            raise
        except (OSError, UnicodeError) as exc:
            raise ProvisioningError(
                500,
                "CONFIG_READ_FAILED",
                f"Cannot read firmware config: {self.config_path}",
            ) from exc

        content = self._replace_define(content, "DEVICE_ID", device_id)
        content = self._replace_define(content, "KEY_ID", key_id)

        newline = "\r\n" if "\r\n" in content else "\n"
        normalized_pem = private_key_pem.replace("\r\n", "\n").rstrip("\n")
        normalized_pem = normalized_pem.replace("\n", newline) + newline
        content, private_key_count = self._PRIVATE_KEY_PATTERN.subn(
            lambda match: f"{match.group(1)}{normalized_pem}{match.group(4)}",
            content,
        )
        if private_key_count != 1:
            raise ProvisioningError(
                500,
                "CONFIG_FORMAT_INVALID",
                "Expected exactly one DEVICE_PRIVATE_KEY_PEM declaration in firmware config",
            )

        # Refuse malformed templates instead of appending duplicate C++ declarations.
        if len(re.findall(r"(?m)^\s*#\s*define\s+DEVICE_ID\b", content)) != 1:
            raise ProvisioningError(500, "CONFIG_FORMAT_INVALID", "Duplicate DEVICE_ID declaration")
        if len(re.findall(r"(?m)^\s*#\s*define\s+KEY_ID\b", content)) != 1:
            raise ProvisioningError(500, "CONFIG_FORMAT_INVALID", "Duplicate KEY_ID declaration")
        if len(re.findall(r"\bDEVICE_PRIVATE_KEY_PEM\s*\[", content)) != 1:
            raise ProvisioningError(
                500,
                "CONFIG_FORMAT_INVALID",
                "Duplicate DEVICE_PRIVATE_KEY_PEM declaration",
            )

        snapshot = ConfigSnapshot(content=original, mode=mode)
        try:
            self._atomic_write(self.config_path, content.encode("utf-8"), mode)
        except OSError as exc:
            raise ProvisioningError(
                500,
                "CONFIG_WRITE_FAILED",
                f"Cannot write firmware config: {self.config_path}",
            ) from exc
        return snapshot

    def restore(self, snapshot: ConfigSnapshot) -> None:
        """Restore config.h after a database commit failure."""
        if snapshot.content is None:
            self.config_path.unlink(missing_ok=True)
            return
        self._atomic_write(self.config_path, snapshot.content, snapshot.mode)


class DeviceProvisioner:
    """Coordinate MySQL persistence and local config.h replacement."""

    def __init__(self, config_path: Path):
        self.config_writer = FirmwareConfigWriter(config_path)
        # A shared config.h represents one USB flashing target. Serializing the
        # full write/commit window also makes rollback safe for concurrent calls.
        self._lock = threading.Lock()

    def provision(self, session: Session, device_id: str, device_name: str):
        with self._lock:
            device = signed_ingestion.prepare_device(session, device_id, device_name)

            try:
                private_key = ec.generate_private_key(ec.SECP256R1())
                private_key_pem = private_key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption(),
                ).decode("ascii")
                public_key_pem = private_key.public_key().public_bytes(
                    serialization.Encoding.PEM,
                    serialization.PublicFormat.SubjectPublicKeyInfo,
                ).decode("ascii")
            except Exception as exc:
                session.rollback()
                raise ProvisioningError(
                    500,
                    "KEY_GENERATION_FAILED",
                    "Could not generate the device ECDSA P-256 key pair",
                ) from exc

            session.add(DeviceKey(
                device_id=device_id,
                key_id=DEFAULT_KEY_ID,
                public_key_pem=public_key_pem,
                status="active",
            ))
            try:
                # Flush first so database constraint/public-key failures happen
                # before the private key changes the firmware file.
                session.flush()
            except IntegrityError as exc:
                session.rollback()
                # A concurrent registration can win after prepare_device's
                # initial lookup. Other integrity failures must remain database
                # failures instead of being mislabeled as a duplicate request.
                if session.get(Device, device_id) is not None:
                    raise signed_ingestion.IngestionError(
                        409,
                        "DEVICE_EXISTS",
                        "Device already exists",
                    ) from exc
                raise

            try:
                snapshot = self.config_writer.update(
                    device_id,
                    DEFAULT_KEY_ID,
                    private_key_pem,
                )
            except Exception:
                session.rollback()
                raise

            try:
                session.commit()
            except Exception as commit_error:
                session.rollback()
                try:
                    self.config_writer.restore(snapshot)
                except OSError as restore_error:
                    raise ProvisioningError(
                        500,
                        "PROVISIONING_ROLLBACK_FAILED",
                        "Database save failed and firmware config could not be restored",
                    ) from restore_error
                raise commit_error

            return device, DEFAULT_KEY_ID
