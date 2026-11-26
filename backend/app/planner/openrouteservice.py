"""Request and normalize OpenRouteService walking circuits."""

from itertools import accumulate, pairwise
from logging import getLogger
from math import asin, ceil, cos, radians, sin, sqrt

import httpx
from pydantic import BaseModel, Field, FiniteFloat

from .models import (
    ElevationPreference, ElevationSample, Latitude, LineString, Longitude,
    Origin, Position, PreviewRequest, RoutedCircuit, Surface, SurfaceCoverage,
)

logger = getLogger(__name__)

DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson"
SNAP_RADIUS_M = 120
CLOSURE_TOLERANCE_M = 25
SEEDS = (42, 1337, 2027)
ORS_ROUTE_NOT_FOUND = 2009
ORS_POINT_NOT_FOUND = 2010
ORS_UNKNOWN_ERROR = 2099

ElevatedPosition = tuple[Longitude, Latitude, FiniteFloat | None]
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
    coordinates: list[ElevatedPosition | Position]


class ORSSummary(BaseModel):
    distance: FiniteFloat = Field(gt=0)
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
    coordinates: list[ElevatedPosition | Position],
    positions: list[Position],
    distance_km: float,
) -> list[ElevationSample]:
    heights: list[float] = []
    for coordinate in coordinates:
        if len(coordinate) != 3 or coordinate[2] is None:
            return []
        heights.append(coordinate[2])
    cumulative = list(accumulate((distance_m(a, b) for a, b in pairwise(positions)), initial=0.0))
    if cumulative[-1] == 0:
        return []
    stride = max(1, ceil((len(cumulative) - 1) / 159))
    indices = [*range(0, len(cumulative) - 1, stride), len(cumulative) - 1]
    return [
        ElevationSample(
            distance_km=cumulative[index] * distance_km / cumulative[-1],
            elevation_m=heights[index],
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
    if not distance:
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


async def request_circuit(
    client: httpx.AsyncClient, origin: Origin, length_m: int, seed: int
) -> list[ORSFeature] | None:
    try:
        response = await client.post(DIRECTIONS_URL, json={
            "coordinates": [[origin.longitude, origin.latitude]],
            "elevation": True,
            "instructions": False,
            "extra_info": ["surface"],
            "radiuses": [SNAP_RADIUS_M],
            "options": {
                "avoid_features": ["ferries"],
                "round_trip": {"length": length_m, "points": 5, "seed": seed},
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
    except ValueError:
        payload = None

    if not response.is_success:
        error = payload.get("error") if isinstance(payload, dict) else None
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        if code == ORS_POINT_NOT_FOUND and response.status_code in (400, 404):
            return None
        if code == ORS_ROUTE_NOT_FOUND and response.status_code in (400, 404):
            return []
        # ORS 9.10 reports failure to snap an internally generated waypoint
        # as HTTP 500 / 2099. The next seed uses different waypoints.
        if (
            response.status_code == 500
            and code == ORS_UNKNOWN_ERROR
            and isinstance(message, str)
            and message.startswith("Could not find a valid point after ")
        ):
            return []

        status = f"HTTP {response.status_code}"
        if type(code) is int:
            status += f", código ORS {code}"
        logger.warning("OpenRouteService directions failed (%s)", status)
        raise RoutingError(502, f"OpenRouteService no pudo calcular el circuito ({status}).")

    try:
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise ValueError("Expected a GeoJSON FeatureCollection")
        features = payload.get("features")
        if not isinstance(features, list):
            raise ValueError("Expected a GeoJSON features array")
        return [ORSFeature.model_validate(feature) for feature in features]
    except ValueError as error:
        logger.warning("OpenRouteService returned an invalid directions response")
        raise RoutingError(502, "OpenRouteService devolvió una respuesta de ruta inválida.") from error


async def generate_circuits(client: httpx.AsyncClient, request: PreviewRequest) -> list[RoutedCircuit]:
    candidates: list[RoutedCircuit] = []
    target_km = request.distance_km
    length_m = round(target_km * 1000)
    tolerance = max(1, target_km * .35)
    for seed in SEEDS:
        try:
            features = await request_circuit(client, request.origin, length_m, seed)
        except RoutingError:
            if not candidates:
                raise
            break
        if features is None:
            break
        measured = [route for feature in features if (route := normalize(feature, request)) is not None]
        candidates.extend(route for route in measured if abs(route.distance_km - target_km) <= tolerance)
        if not candidates and measured:
            closest = min(measured, key=lambda route: abs(route.distance_km - target_km))
            # Adjust the provider's length hint while keeping the user's target fixed.
            length_m = min(30_000, max(1000, round(length_m * target_km / closest.distance_km)))

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
