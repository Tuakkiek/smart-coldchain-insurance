"""Create ten fixed ESP32 key pairs once, keeping private keys in a local file."""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, DeviceKey
from app.services.device_registry import DEFAULT_KEY_ID, DEVICE_IDS


class ProvisioningError(Exception):
    """An expected provisioning failure safe to expose through the API."""

    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message
        super().__init__(message)


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

    def update(
        self, device_id: str, key_id: str, private_key_pem: str, *, shipment_id: str | None = None,
    ) -> None:
        try:
            if self.config_path.exists():
                original = self.config_path.read_bytes()
            else:
                if not self.template_path.is_file():
                    raise ProvisioningError(
                        500,
                        "CONFIG_TEMPLATE_NOT_FOUND",
                        f"Firmware config template not found: {self.template_path}",
                    )
                original = None

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
        if shipment_id is not None:
            content = self._replace_define(content, "SHIPMENT_ID", shipment_id)

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

        try:
            self._atomic_write(self.config_path, content.encode("utf-8"), 0o600)
        except OSError as exc:
            raise ProvisioningError(
                500,
                "CONFIG_WRITE_FAILED",
                f"Cannot write firmware config: {self.config_path}",
            ) from exc


def load_device_keys(path: Path) -> dict[str, ec.EllipticCurvePrivateKey]:
    """Read the existing registry. Never regenerate a damaged or missing file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["version"] != 1 or data["key_id"] != DEFAULT_KEY_ID:
            raise ValueError
        if set(data["devices"]) != set(DEVICE_IDS):
            raise ValueError
        keys = {}
        for device_id, pem in data["devices"].items():
            key = serialization.load_pem_private_key(pem.encode("ascii"), password=None)
            if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
                raise ValueError
            keys[device_id] = key
        if len({key.private_numbers().private_value for key in keys.values()}) != len(DEVICE_IDS):
            raise ValueError
        return keys
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        raise ProvisioningError(
            500, "DEVICE_KEYS_INVALID",
            "Cannot read the ten local P-256 keys; restore the original ESP32 key file",
        ) from exc


def _create_key_file(path: Path) -> None:
    """Publish a complete file atomically without overwriting an existing one."""
    keys = {
        device_id: ec.generate_private_key(ec.SECP256R1()).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ).decode("ascii")
        for device_id in DEVICE_IDS
    }
    content = json.dumps({"version": 1, "key_id": DEFAULT_KEY_ID, "devices": keys}, indent=2) + "\n"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=".esp32-keys-", suffix=".tmp")
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp_path, 0o600)
        try:
            # A concurrent startup may win. Reuse its file and keys in that case.
            os.link(temp_path, path)
        except FileExistsError:
            pass
    finally:
        temp_path.unlink(missing_ok=True)


def initialize_fixed_devices(session: Session, key_path: Path) -> None:
    """Reuse local keys and insert missing public keys in one DB transaction."""
    key_path = key_path.expanduser().resolve()
    try:
        if not key_path.exists():
            existing = session.scalar(select(DeviceKey.device_id).where(
                DeviceKey.device_id.in_(DEVICE_IDS),
            ).limit(1))
            if existing is not None:
                raise ProvisioningError(
                    500, "DEVICE_KEYS_MISSING",
                    "ESP32 public keys already exist; restore the original local key file instead of generating new keys",
                )
            _create_key_file(key_path)
        keys = load_device_keys(key_path)
        devices = {device.id: device for device in session.scalars(select(Device).where(Device.id.in_(DEVICE_IDS)))}
        stored_keys = {key.device_id: key for key in session.scalars(select(DeviceKey).where(
            DeviceKey.device_id.in_(DEVICE_IDS), DeviceKey.key_id == DEFAULT_KEY_ID,
        ))}
        public_keys = {}
        for device_id in DEVICE_IDS:
            public_pem = keys[device_id].public_key().public_bytes(
                serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
            ).decode("ascii")
            public_keys[device_id] = public_pem
            existing_key = stored_keys.get(device_id)
            if existing_key is not None and existing_key.public_key_pem != public_pem:
                raise ProvisioningError(
                    409, "DEVICE_KEY_MISMATCH",
                    f"Local key for {device_id} does not match its database public key",
                )
            if device_id not in devices:
                session.add(Device(id=device_id, device_name=device_id, status="active", last_sequence_number=0))
        session.flush()
        for device_id in DEVICE_IDS:
            if device_id not in stored_keys:
                session.add(DeviceKey(
                    device_id=device_id, key_id=DEFAULT_KEY_ID,
                    public_key_pem=public_keys[device_id], status="active",
                ))
        session.commit()
    except Exception:
        session.rollback()
        # Keep the key file if MySQL fails: the next startup must reuse it.
        raise
