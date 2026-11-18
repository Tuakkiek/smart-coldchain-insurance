"""The ten pre-provisioned ESP32 identities used by this application."""

DEVICE_IDS = tuple(f"ESP32-{number:02d}" for number in range(1, 11))
DEFAULT_KEY_ID = "key-v1"
