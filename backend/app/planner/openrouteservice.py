"""Request and normalize OpenRouteService walking circuits."""

from itertools import accumulate, pairwise
from math import asin, ceil, cos, radians, sin, sqrt

import httpx
from pydantic import BaseModel, Field, FiniteFloat

from .models import (
    ElevationPreference, ElevationSample, Latitude, LineString, Longitude,
    Position, PreviewRequest, RoutedCircuit, Surface, SurfaceCoverage,
)

DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
SNAP_RADIUS_M = 120
CLOSURE_TOLERANCE_M = 25
SEEDS = (42, 1337, 2027)
PAVED = {1, 3, 4, 5, 6, 7, 14}
UNPAVED = {2, 8, 9, 10, 11, 12, 15, 16, 17, 18}
ASCENT_TARGET = {
    ElevationPreference.FLAT: 4,
    ElevationPreference.ROLLING: 14,
    ElevationPreference.HILLY: 28,
}


class RoutingError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class ORSGeometry(BaseModel):
    type: str
    coordinates: list[tuple[Longitude, Latitude, FiniteFloat] | Position]


class ORSSummary(BaseModel):
    distance: FiniteFloat
    ascent: FiniteFloat | None = None


class ORSSurfaceSegment(BaseModel):
    value: int
    distance: FiniteFloat


class ORSSurface(BaseModel):
    summary: list[ORSSurfaceSegment] = Field(default_factory=list)


class ORSExtras(BaseModel):
    surface: ORSSurface | None = None


class ORSProperties(BaseModel):
    summary: ORSSummary
    ascent: FiniteFloat | None = None
    extras: ORSExtras | None = None


class ORSFeature(BaseModel):
    geometry: ORSGeometry
    properties: ORSProperties


def distance_m(a: Position, b: Position) -> float:
    lon_a, lat_a = map(radians, a)
    lon_b, lat_b = map(radians, b)
    haversine = sin((lat_b - lat_a) / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin((lon_b - lon_a) / 2) ** 2
    return 12_742_017.6 * asin(sqrt(min(1, haversine)))


def surface_coverage(properties: ORSProperties) -> SurfaceCoverage:
    surface = properties.extras.surface if properties.extras else None
    segments = surface.summary if surface else []
    paved = sum(max(0, segment.distance) for segment in segments if segment.value in PAVED)
    unpaved = sum(max(0, segment.distance) for segment in segments if segment.value in UNPAVED)
    total = max(properties.summary.distance, paved + unpaved)
    paved_pct = round(paved / total * 100)
    unpaved_pct = min(100 - paved_pct, round(unpaved / total * 100))
    return SurfaceCoverage(paved_pct=paved_pct, unpaved_pct=unpaved_pct, unknown_pct=100 - paved_pct - unpaved_pct)


def elevation_profile(
    coordinates: list[tuple[Longitude, Latitude, FiniteFloat] | Position],
    positions: list[Position],
    distance_km: float,
) -> list[ElevationSample]:
    if any(len(coordinate) != 3 for coordinate in coordinates):
        return []
    cumulative = list(accumulate((distance_m(a, b) for a, b in pairwise(positions)), initial=0.0))
    if cumulative[-1] == 0:
        return []
    stride = max(1, ceil((len(cumulative) - 1) / 159))
    indices = [*range(0, len(cumulative) - 1, stride), len(cumulative) - 1]
    return [
        ElevationSample(
            distance_km=cumulative[index] * distance_km / cumulative[-1],
            elevation_m=coordinates[index][-1],
        )
        for index in indices
    ]


def normalize(route: ORSFeature, request: PreviewRequest) -> RoutedCircuit | None:
    points = route.geometry.coordinates
    if route.geometry.type != "LineString" or len(points) < 4:
        return None
    positions = [(point[0], point[1]) for point in points]
    origin = (request.origin.longitude, request.origin.latitude)
    if distance_m(origin, positions[0]) > SNAP_RADIUS_M or distance_m(positions[0], positions[-1]) > CLOSURE_TOLERANCE_M:
        return None

    properties = route.properties
    distance = round(properties.summary.distance / 1000, 3)
    if abs(distance - request.distance_km) > max(1, request.distance_km * .35):
        return None
    ascent = properties.summary.ascent if properties.summary.ascent is not None else properties.ascent
    return RoutedCircuit(
        id="candidate",
        name="Circuito",
        distance_km=distance,
        ascent_m=None if ascent is None else round(max(0, ascent)),
        estimated_seconds=round(distance * request.pace_seconds_per_km),
        geometry=LineString(coordinates=positions),
        elevation_profile=elevation_profile(points, positions, distance),
        surface=surface_coverage(properties),
    )


def score(route: RoutedCircuit, request: PreviewRequest) -> float:
    distance_error = abs(route.distance_km - request.distance_km) / request.distance_km
    target = ASCENT_TARGET[request.elevation]
    slope_error = (
        0.5 if route.ascent_m is None
        else min(1, abs(route.ascent_m / route.distance_km - target) / max(15, target))
    )
    paved = route.surface.paved_pct
    unpaved = route.surface.unpaved_pct
    surface_match = {
        Surface.ASPHALT: paved,
        Surface.TRAIL: unpaved,
        Surface.MIXED: 2 * min(paved, unpaved),
    }
    return distance_error + .25 * slope_error + .2 * (1 - surface_match[request.surface] / 100)


def segments(route: RoutedCircuit) -> set[tuple[Position, Position]]:
    rounded = [(round(lon, 5), round(lat, 5)) for lon, lat in route.geometry.coordinates]
    return {(min(a, b), max(a, b)) for a, b in pairwise(rounded) if a != b}


async def request_circuit(client: httpx.AsyncClient, request: PreviewRequest, seed: int) -> list[ORSFeature] | None:
    try:
        response = await client.post(DIRECTIONS_URL, json={
            "coordinates": [[request.origin.longitude, request.origin.latitude]],
            "elevation": True,
            "instructions": False,
            "extra_info": ["surface"],
            "radiuses": [SNAP_RADIUS_M],
            "options": {
                "avoid_features": ["ferries"],
                "round_trip": {"length": request.distance_km * 1000, "points": 5, "seed": seed},
            },
        })
    except httpx.TimeoutException as error:
        raise RoutingError(504, "OpenRouteService tardó demasiado. Inténtalo de nuevo.") from error
    except httpx.RequestError as error:
        raise RoutingError(502, "No se pudo conectar con OpenRouteService. Inténtalo de nuevo.") from error

    if response.status_code in (401, 403):
        raise RoutingError(503, "OpenRouteService rechazó la clave. Revisa ORS_API_KEY en el servidor.")
    if response.status_code == 429:
        raise RoutingError(429, "OpenRouteService ha alcanzado su límite de peticiones. Inténtalo más tarde.")

    try:
        payload = response.json()
        if response.status_code in (400, 404):
            code = payload.get("error", {}).get("code")
            if code == 2010:  # No routable point at the origin.
                return None
            if code == 2009:
                return []
        response.raise_for_status()
        if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
            raise ValueError("Expected a GeoJSON FeatureCollection")
        return [ORSFeature.model_validate(feature) for feature in payload["features"]]
    except (httpx.HTTPStatusError, ValueError, AttributeError) as error:
        raise RoutingError(502, "OpenRouteService no pudo calcular el circuito. Inténtalo de nuevo.") from error


async def generate_circuits(client: httpx.AsyncClient, request: PreviewRequest) -> list[RoutedCircuit]:
    candidates: list[RoutedCircuit] = []
    for seed in SEEDS:
        try:
            features = await request_circuit(client, request, seed)
        except RoutingError:
            if not candidates:
                raise
            break
        if features is None:
            break
        for feature in features:
            if (route := normalize(feature, request)) is not None:
                candidates.append(route)

    routes = []
    chosen_segments: list[set[tuple[Position, Position]]] = []
    for candidate in sorted(candidates, key=lambda route: score(route, request)):
        edges = segments(candidate)
        if not edges or any(len(edges & chosen) / len(edges | chosen) >= .8 for chosen in chosen_segments):
            continue
        chosen_segments.append(edges)
        index = len(chosen_segments)
        routes.append(candidate.model_copy(update={"id": f"ors-{index}", "name": f"Circuito {index}"}))
        if len(routes) == 2:
            break
    return routes
