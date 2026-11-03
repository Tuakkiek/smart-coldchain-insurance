"""Deterministic straight-line location for the Phase 2 telemetry endpoint.

Phase 3 can refine route behaviour without changing the REST schema. These are
simulated coordinates and must never be presented as device GPS.
"""

from __future__ import annotations

from app.models import Shipment

SAMPLES_TO_DESTINATION = 20


def location_for_sample(shipment: Shipment, sample_number: int) -> tuple[float, float, float]:
    progress_pct = min(max(sample_number, 0) / SAMPLES_TO_DESTINATION * 100.0, 100.0)
    fraction = progress_pct / 100.0
    latitude = shipment.origin_latitude + (
        shipment.destination_latitude - shipment.origin_latitude
    ) * fraction
    longitude = shipment.origin_longitude + (
        shipment.destination_longitude - shipment.origin_longitude
    ) * fraction
    return latitude, longitude, progress_pct
