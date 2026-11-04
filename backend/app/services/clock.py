"""Replaceable UTC clock for telemetry evaluation and demo scenarios."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


@dataclass
class VirtualClock:
    current: datetime

    def now(self) -> datetime:
        return self.current


SYSTEM_CLOCK = SystemClock()
