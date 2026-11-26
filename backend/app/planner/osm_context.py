"""Measure mapped traffic lights and approximate town centres along circuits."""

from collections import defaultdict
from dataclasses import dataclass
from logging import getLogger
from math import ceil, cos, floor, hypot, radians

import httpx
from pydantic import BaseModel, ValidationError

from .models import GenerateRoutesRequest, Latitude, Longitude, Position, RoutedCircuit

logger = getLogger(__name__)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
METRES_PER_DEGREE = 111_195
SIGNAL_RADIUS = 20
CENTER_RADII = {"city": 850, "town": 450}
NODE_LIMIT = 12_000


class OSMNode(BaseModel):
    id: int
    lat: Latitude
    lon: Longitude
    tags: dict[str, str]


class OverpassResult(BaseModel):
    elements: list[OSMNode]
    remark: str | None = None


@dataclass
class RouteContext:
    longitude_scale: float
    signals: dict[tuple[int, int], list[tuple[int, Position]]]
    centers: list[tuple[Position, int]]

    def project(self, point: Position) -> Position:
        return point[0] * self.longitude_scale, point[1] * METRES_PER_DEGREE

    def count_signals(self, path: list[Position]) -> int:
        seen: set[int] = set()
        for a, b in zip(path, path[1:]):
            min_x, max_x = sorted((a[0], b[0]))
            min_y, max_y = sorted((a[1], b[1]))
            for x in range(floor((min_x - SIGNAL_RADIUS) / 50), floor((max_x + SIGNAL_RADIUS) / 50) + 1):
                for y in range(floor((min_y - SIGNAL_RADIUS) / 50), floor((max_y + SIGNAL_RADIUS) / 50) + 1):
                    for node_id, node in self.signals.get((x, y), ()):
                        if node_id not in seen and near_segment(node, a, b):
                            seen.add(node_id)
        return len(seen)

    def center_share(self, path: list[Position]) -> int:
        inner = total = 0.0
        for (x, y), (nx, ny) in zip(path, path[1:]):
            length = hypot(nx - x, ny - y)
            if not length:
                continue
            total += length
            samples = ceil(length / 70)
            for index in range(samples):
                fraction = (index + .5) / samples
                mx, my = x + (nx - x) * fraction, y + (ny - y) * fraction
                if any((mx - cx) ** 2 + (my - cy) ** 2 <= radius ** 2 for (cx, cy), radius in self.centers):
                    inner += length / samples
        return min(100, round(inner / total * 100)) if total else 0


def near_segment(point: Position, start: Position, end: Position) -> bool:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length_squared = dx ** 2 + dy ** 2
    fx, fy = point[0] - start[0], point[1] - start[1]
    fraction = min(1, max(0, (fx * dx + fy * dy) / length_squared)) if length_squared else 0
    return (fx - dx * fraction) ** 2 + (fy - dy * fraction) ** 2 <= SIGNAL_RADIUS ** 2


def build_context(nodes: list[OSMNode], latitude: float) -> RouteContext:
    signals: dict[tuple[int, int], list[tuple[int, Position]]] = defaultdict(list)
    context = RouteContext(METRES_PER_DEGREE * cos(radians(latitude)), signals, [])
    for node in nodes:
        x, y = context.project((node.lon, node.lat))
        if node.tags.get("highway") == "traffic_signals":
            signals[(floor(x / 50), floor(y / 50))].append((node.id, (x, y)))
        if radius := CENTER_RADII.get(node.tags.get("place", "")):
            context.centers.append(((x, y), radius))
    return context


async def add_osm_context(routes: list[RoutedCircuit], request: GenerateRoutesRequest) -> bool:
    positions = [point for route in routes for point in route.geometry.coordinates]
    longitude, latitude = zip(*positions)
    west, south, east, north = min(longitude), min(latitude), max(longitude), max(latitude)
    longitude_scale = METRES_PER_DEGREE * cos(radians(request.origin.latitude))

    def bounds(metres: int) -> str:
        lat = metres / METRES_PER_DEGREE
        lon = metres / longitude_scale
        return f"{south - lat:.6f},{west - lon:.6f},{north + lat:.6f},{east + lon:.6f}"

    selectors = []
    if request.avoid_traffic_signals:
        selectors.append(f'node["highway"="traffic_signals"]({bounds(30)});')
    if request.avoid_city_center:
        selectors.append(f'node["place"~"^(city|town)$"]({bounds(900)});')
    query = f'[out:json][timeout:5];({"".join(selectors)});out body {NODE_LIMIT};'
    try:
        # This client is separate from the authenticated ORS client.
        async with httpx.AsyncClient(timeout=httpx.Timeout(7, connect=3)) as client:
            response = await client.post(OVERPASS_URL, data={"data": query})
            response.raise_for_status()
            result = OverpassResult.model_validate_json(response.content)
            if result.remark or len(result.elements) >= NODE_LIMIT:
                return False
    except (httpx.HTTPError, ValidationError):
        logger.info("OpenStreetMap context unavailable")
        return False

    context = build_context(result.elements, request.origin.latitude)
    for route in routes:
        path = [context.project(point) for point in route.geometry.coordinates]
        if request.avoid_traffic_signals:
            route.traffic_signals = context.count_signals(path)
        if request.avoid_city_center:
            route.urban_center_pct = context.center_share(path)
    return True
