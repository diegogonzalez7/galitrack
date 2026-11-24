"""Illustrative shapes and profiles with no relationship to the trail network."""

from dataclasses import dataclass
from math import cos, degrees, radians

from .models import DemoRoute, ElevationPreference, ElevationSample, LineString, PreviewRequest, Surface

EARTH_RADIUS_KM = 6371.0088
ASCENT_PER_KM = {
    ElevationPreference.FLAT: 5,
    ElevationPreference.ROLLING: 14,
    ElevationPreference.HILLY: 27,
}


@dataclass(frozen=True)
class RouteFixture:
    id: str
    name: str
    distance_factor: float
    ascent_factor: float
    offsets: tuple[tuple[float, float], ...]
    profile: tuple[int, ...]


FIXTURES = (
    RouteFixture(
        id="demo-west",
        name="Circular do Val",
        distance_factor=1,
        ascent_factor=1,
        offsets=(
            (0, 0), (-.21, .09), (-.33, .28), (-.55, .34), (-.64, .48),
            (-.94, .45), (-1.10, .26), (-1.04, .10), (-1.16, -.10),
            (-.98, -.25), (-.79, -.19), (-.62, -.31), (-.36, -.21),
            (-.26, -.05), (0, 0),
        ),
        profile=(16, 22, 26, 43, 39, 68, 74, 53, 61, 43, 27, 32, 16),
    ),
    RouteFixture(
        id="demo-east",
        name="Volta do Monte",
        distance_factor=1.18,
        ascent_factor=1.38,
        offsets=(
            (0, 0), (.14, -.03), (.29, -.20), (.50, -.24), (.68, -.41),
            (.95, -.36), (1.07, -.51), (1.27, -.46), (1.39, -.22),
            (1.21, -.11), (1.08, .09), (.82, .06), (.71, .25),
            (.48, .18), (.32, .28), (.15, .14), (0, 0),
        ),
        profile=(14, 31, 24, 43, 51, 75, 84, 56, 67, 41, 50, 27, 14),
    ),
)
ALTERNATE_SURFACE = {
    Surface.ASPHALT: Surface.MIXED,
    Surface.MIXED: Surface.TRAIL,
    Surface.TRAIL: Surface.MIXED,
}


def make_demo_routes(request: PreviewRequest) -> list[DemoRoute]:
    origin = request.origin
    routes = []
    for index, fixture in enumerate(FIXTURES):
        distance = round(request.distance_km * fixture.distance_factor, 2)
        perimeter = sum(
            ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5
            for (x1, y1), (x2, y2) in zip(fixture.offsets, fixture.offsets[1:])
        )
        scale = distance / perimeter
        coordinates = [
            (
                round(origin.longitude + degrees(east * scale / (EARTH_RADIUS_KM * cos(radians(origin.latitude)))), 6),
                round(origin.latitude + degrees(north * scale / EARTH_RADIUS_KM), 6),
            )
            for east, north in fixture.offsets
        ]
        # Retain the precise origin, including when it has more than six decimals.
        coordinates[0] = coordinates[-1] = (origin.longitude, origin.latitude)
        ascent = round(distance * ASCENT_PER_KM[request.elevation] * fixture.ascent_factor)
        fixture_ascent = sum(max(0, b - a) for a, b in zip(fixture.profile, fixture.profile[1:]))
        profile = [
            ElevationSample(
                distance_km=round(distance * sample / (len(fixture.profile) - 1), 3),
                elevation_m=round(40 + (height - fixture.profile[0]) * ascent / fixture_ascent, 1),
            )
            for sample, height in enumerate(fixture.profile)
        ]
        routes.append(
            DemoRoute(
                id=fixture.id,
                name=fixture.name,
                distance_km=distance,
                ascent_m=ascent,
                estimated_seconds=round(distance * request.pace_seconds_per_km),
                surface=request.surface if index == 0 else ALTERNATE_SURFACE[request.surface],
                geometry=LineString(coordinates=coordinates),
                elevation_profile=profile,
            )
        )
    return routes
