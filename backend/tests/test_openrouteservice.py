import json
from collections.abc import Callable

import httpx
import pytest

from app.main import app, ors_client

pytestmark = pytest.mark.anyio

ORIGIN = [-8.6441, 42.4331]
PREFERENCES = {
    "origin": {"longitude": ORIGIN[0], "latitude": ORIGIN[1]},
    "distance_km": 10,
    "elevation": "rolling",
    "surface": "asphalt",
    "pace_seconds_per_km": 360,
}
EAST = [ORIGIN, [-8.620, 42.436], [-8.619, 42.451], [-8.645, 42.457], ORIGIN]
NORTH = [ORIGIN, [-8.650, 42.444], [-8.645, 42.472], [-8.614, 42.462], ORIGIN]


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as session:
        yield session


@pytest.fixture
def provider():
    def install(handler: Callable[[httpx.Request], httpx.Response]) -> None:
        async def fake_client():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as session:
                yield session

        app.dependency_overrides[ors_client] = fake_client

    yield install
    app.dependency_overrides.pop(ors_client, None)


def ors_response(points, *, distance=10000, elevation=True, paved=8000):
    return httpx.Response(200, json={
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[*point, 20 + index * 15] if elevation else point for index, point in enumerate(points)],
            },
            "properties": {
                "summary": {"distance": distance, "ascent": 140 if elevation else None},
                "extras": {"surface": {"summary": [{"value": 3, "distance": paved}, {"value": 11, "distance": 1200}]}},
            },
        }],
    })


async def test_generated_circuits_follow_provider_geometry_and_exclude_ferries(client, provider):
    requests = []
    answers = iter([ors_response(EAST), ors_response(EAST[::-1]), ors_response(NORTH, paved=3800)])

    def handler(request):
        payload = json.loads(request.content)
        requests.append(payload)
        assert request.url.path == "/v2/directions/foot-walking/geojson"
        assert payload["coordinates"] == [ORIGIN]
        assert payload["options"]["avoid_features"] == ["ferries"]
        assert payload["options"]["round_trip"]["length"] == 10000
        assert payload["radiuses"] == [120]
        return next(answers)

    provider(handler)
    response = await client.post("/api/routes", json=PREFERENCES)
    assert response.status_code == 200
    assert len({request["options"]["round_trip"]["seed"] for request in requests}) == 3
    body = response.json()
    assert body["source"] == "openrouteservice"
    first, second = body["routes"]
    assert first["geometry"]["coordinates"] == EAST
    assert second["geometry"]["coordinates"] == NORTH
    assert first["estimated_seconds"] == 3600
    assert first["ascent_m"] == 140
    assert first["surface"] == {"paved_pct": 80, "unpaved_pct": 12, "unknown_pct": 8}
    distances = [point["distance_km"] for point in first["elevation_profile"]]
    assert distances == sorted(distances)
    assert distances[0] == 0
    assert distances[-1] == pytest.approx(10)


async def test_never_joins_open_or_far_away_routes_to_the_origin(client, provider):
    shifted = [[lon + .01, lat] for lon, lat in EAST]
    answers = iter([
        ors_response([*EAST[:-1], [-8.632, 42.438]]),
        ors_response(shifted),
        ors_response(EAST, distance=15000),
    ])
    provider(lambda _: next(answers))
    response = await client.post("/api/routes", json=PREFERENCES)
    assert response.json() == {"source": "openrouteservice", "routes": []}


async def test_water_origin_without_nearby_network_returns_empty(client, provider):
    calls = 0

    def handler(_):
        nonlocal calls
        calls += 1
        return httpx.Response(404, json={"error": {"code": 2010, "message": "Could not find routable point"}})

    provider(handler)
    response = await client.post("/api/routes", json=PREFERENCES)
    assert response.status_code == 200
    assert response.json()["routes"] == []
    assert calls == 1


async def test_unknown_elevation_and_partial_provider_failure(client, provider):
    answers = iter([ors_response(EAST, elevation=False), httpx.Response(429)])
    provider(lambda _: next(answers))
    response = await client.post("/api/routes", json=PREFERENCES)
    route, = response.json()["routes"]
    assert route["ascent_m"] is None
    assert route["elevation_profile"] == []


@pytest.mark.parametrize(("provider_status", "app_status"), [(403, 503), (429, 429), (500, 502)])
async def test_provider_errors_are_reported_without_any_synthetic_fallback(client, provider, provider_status, app_status):
    provider(lambda _: httpx.Response(provider_status, text="Upstream response"))
    response = await client.post("/api/routes", json=PREFERENCES)
    assert response.status_code == app_status
    assert "Upstream response" not in response.text
    assert "routes" not in response.json()


async def test_api_key_is_required(client, monkeypatch):
    monkeypatch.delenv("ORS_API_KEY", raising=False)
    response = await client.post("/api/routes", json=PREFERENCES)
    assert response.status_code == 503
    assert "ORS_API_KEY" in response.json()["detail"]
