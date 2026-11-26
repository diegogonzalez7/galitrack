from urllib.parse import parse_qs

import httpx
import pytest

from app.planner import osm_context
from app.planner.models import GenerateRoutesRequest, RoutedCircuit
from app.planner.osm_context import OSMNode, build_context


def test_signals_are_counted_near_segments_and_only_once():
    context = build_context([
        OSMNode(id=1, lon=-8.64, lat=42.4301, tags={"highway": "traffic_signals"}),
        OSMNode(id=2, lon=-8.64, lat=42.435, tags={"highway": "traffic_signals"}),
    ], 42.43)
    path = [context.project(point) for point in [(-8.645, 42.43), (-8.635, 42.43), (-8.645, 42.43)]]
    assert context.count_signals(path) == 1


def test_urban_share_estimates_length_instead_of_counting_vertices():
    context = build_context([
        OSMNode(id=1, lon=-8.64, lat=42.43, tags={"place": "town"}),
    ], 42.43)
    path = [context.project(point) for point in [(-8.64, 42.43), (-8.64, 42.431), (-8.64, 42.44)]]
    assert 36 <= context.center_share(path) <= 45


@pytest.mark.anyio
@pytest.mark.parametrize("anyio_backend", ["asyncio"])
async def test_context_query_uses_one_public_request_without_authorization(monkeypatch, anyio_backend):
    request = GenerateRoutesRequest(
        origin={"longitude": -8.645, "latitude": 42.43},
        distance_km=2, elevation="flat", surface="mixed", pace_seconds_per_km=330,
        avoid_city_center=True, avoid_traffic_signals=True,
    )
    route = RoutedCircuit(
        id="route", name="Circuito", distance_km=2, ascent_m=4, estimated_seconds=660,
        geometry={"coordinates": [(-8.645, 42.43), (-8.635, 42.43), (-8.645, 42.43)]},
        elevation_profile=[],
        surface={"paved_pct": 0, "unpaved_pct": 0, "unknown_pct": 100},
    )
    calls = []

    def handler(http_request):
        calls.append(http_request)
        assert http_request.url == httpx.URL(osm_context.OVERPASS_URL)
        assert "Authorization" not in http_request.headers
        query, = parse_qs(http_request.content.decode())["data"]
        assert 'node["highway"="traffic_signals"]' in query
        assert 'node["place"~"^(city|town)$"]' in query
        return httpx.Response(200, json={"elements": [
            {"id": 1, "lat": 42.4301, "lon": -8.64, "tags": {"highway": "traffic_signals"}},
            {"id": 2, "lat": 42.43, "lon": -8.64, "tags": {"place": "town"}},
        ]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(osm_context.httpx, "AsyncClient", lambda **_: client)
    assert await osm_context.add_osm_context([route], request)
    assert len(calls) == 1
    assert route.traffic_signals == 1
    assert route.urban_center_pct > 0
