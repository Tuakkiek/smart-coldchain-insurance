"""Evaluate a shipment's temperature streak from persisted telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from app.models import Shipment, Telemetry


@dataclass(frozen=True)
class PolicyDecision:
    events: tuple[tuple[str, dict], ...]
    triggered: bool
    consecutive_samples: int


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def utc_iso(value: datetime) -> str:
    return utc(value).isoformat().replace("+00:00", "Z")


def out_of_range(shipment: Shipment, temperature_c: float) -> bool:
    return temperature_c < shipment.temp_min_c or temperature_c > shipment.temp_max_c


def evaluate(
    shipment: Shipment,
    prior_samples_desc: Iterable[Telemetry],
    temperature_c: float,
    received_at: datetime,
    gap_minutes: int,
    sequence_gap: tuple[int, int] | None = None,
) -> PolicyDecision:
    """A gap breaks a streak; recorded_at from the device is deliberately ignored."""
    received_at = utc(received_at)
    gap_limit = timedelta(minutes=gap_minutes)
    samples = iter(prior_samples_desc)
    previous = next(samples, None)
    events: list[tuple[str, dict]] = []
    gap = sequence_gap is not None or (previous is not None and received_at - utc(previous.received_at) > gap_limit)
    if gap:
        details = {"last_received_at": utc_iso(previous.received_at) if previous else None,
                   "gap_minutes": (received_at - utc(previous.received_at)).total_seconds() / 60 if previous else None}
        if sequence_gap is not None:
            details.update({"reason": "sequence_gap", "missing_from": sequence_gap[0],
                            "missing_to": sequence_gap[1]})
        events.append(("SENSOR_DATA_GAP", details))

    if not out_of_range(shipment, temperature_c):
        return PolicyDecision(tuple(events), False, 0)

    if shipment.insurance_status == "triggered" and previous and not gap and out_of_range(shipment, previous.temperature_c):
        return PolicyDecision(tuple(events), False, 0)

    started_at = received_at
    consecutive = 1
    if previous is not None and not gap and out_of_range(shipment, previous.temperature_c):
        started_at = utc(previous.received_at)
        consecutive += 1
        newer_at = started_at
        for sample in samples:
            sample_at = utc(sample.received_at)
            if newer_at - sample_at > gap_limit or not out_of_range(shipment, sample.temperature_c):
                break
            started_at = sample_at
            newer_at = sample_at
            consecutive += 1
    else:
        events.append(("TEMPERATURE_BREACH_STARTED", {
            "temperature_c": temperature_c,
            "temp_min_c": shipment.temp_min_c,
            "temp_max_c": shipment.temp_max_c,
        }))

    duration = received_at - started_at
    triggered = duration >= timedelta(minutes=shipment.violation_duration_minutes) and shipment.insurance_status != "triggered"
    if triggered:
        events.append(("INSURANCE_TRIGGERED", {
            "breach_started_at": utc_iso(started_at),
            "duration_minutes": duration.total_seconds() / 60,
            "consecutive_samples": consecutive,
        }))
    return PolicyDecision(tuple(events), triggered, consecutive)
