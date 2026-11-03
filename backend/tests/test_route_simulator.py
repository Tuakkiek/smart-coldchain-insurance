"""Phase 3 route acceptance checks."""

from types import SimpleNamespace

import pytest

from app.services.route_simulator import location_for_sample


@pytest.mark.parametrize(
    ("sample_number", "expected"),
    [
        (0, (10.0, 106.0, 0.0)),
        (1, (10.1, 105.9, 5.0)),
        (10, (11.0, 105.0, 50.0)),
        (20, (12.0, 104.0, 100.0)),
        (21, (12.0, 104.0, 100.0)),
    ],
)
def test_route_progress_is_deterministic_and_stops_at_destination(sample_number, expected):
    shipment = SimpleNamespace(
        origin_latitude=10.0,
        origin_longitude=106.0,
        destination_latitude=12.0,
        destination_longitude=104.0,
    )
    assert location_for_sample(shipment, sample_number) == pytest.approx(expected)
