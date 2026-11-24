import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.anyio

PREFERENCES = {
    "origin": {"longitude": -8.5441234, "latitude": 42.8805123},
    "distance_km": 10,
    "elevation": "rolling",
    "surface": "mixed",
    "pace_seconds_per_km": 330,
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as session:
        yield session


async def test_health_and_openapi(client):
    assert (await client.get("/api/health")).json() == {"status": "ok"}
    schema = (await client.get("/api/openapi.json")).json()
    assert "/api/routes/preview" in schema["paths"]


async def test_preview_returns_closed_geojson_and_profiles(client):
    response = await client.post("/api/routes/preview", json=PREFERENCES)
    assert response.status_code == 200
    result = response.json()
    assert result["source"] == "demo"
    first, second = result["routes"]
    assert first["distance_km"] == 10
    assert first["ascent_m"] == 140
    assert first["surface"] == "mixed"
    assert first["estimated_seconds"] == 3300
    assert second["id"] != first["id"]
    for route in (first, second):
        geometry = route["geometry"]
        assert geometry["type"] == "LineString"
        assert geometry["coordinates"][0] == geometry["coordinates"][-1] == [-8.5441234, 42.8805123]
        profile = route["elevation_profile"]
        distances = [point["distance_km"] for point in profile]
        assert distances == sorted(set(distances))
        assert distances[0] == 0
        assert distances[-1] == route["distance_km"]
        assert profile[0]["elevation_m"] == profile[-1]["elevation_m"]


async def test_preferences_change_the_demo(client):
    response = await client.post(
        "/api/routes/preview",
        json={**PREFERENCES, "distance_km": 8.5, "surface": "trail", "elevation": "flat", "pace_seconds_per_km": 360},
    )
    route = response.json()["routes"][0]
    assert route["surface"] == "trail"
    assert route["distance_km"] == 8.5
    assert route["ascent_m"] == 42
    assert route["estimated_seconds"] == 3060


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("origin", {"longitude": 42.8, "latitude": -8.5}),
        ("distance_km", 31),
        ("elevation", "unknown"),
        ("surface", "unknown"),
        ("pace_seconds_per_km", 119),
        ("pace_seconds_per_km", 330.5),
    ],
)
async def test_invalid_preferences_return_validation_error(client, field, value):
    response = await client.post("/api/routes/preview", json={**PREFERENCES, field: value})
    assert response.status_code == 422
    assert field in response.json()["detail"][0]["loc"]
