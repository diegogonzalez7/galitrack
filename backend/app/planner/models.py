from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Longitude = Annotated[float, Field(ge=-180, le=180)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Position = tuple[Longitude, Latitude]


class ElevationPreference(StrEnum):
    FLAT = "flat"
    ROLLING = "rolling"
    HILLY = "hilly"


class Surface(StrEnum):
    ASPHALT = "asphalt"
    MIXED = "mixed"
    TRAIL = "trail"


class Origin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    longitude: float = Field(ge=-9.55, le=-6.55)
    latitude: float = Field(ge=41.75, le=43.85)


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: Origin
    distance_km: float = Field(ge=2, le=30)
    elevation: ElevationPreference
    surface: Surface
    pace_seconds_per_km: int = Field(ge=120, le=1200)


class LineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[Position] = Field(min_length=2)


class ElevationSample(BaseModel):
    distance_km: float = Field(ge=0)
    elevation_m: float


class DemoRoute(BaseModel):
    id: str
    name: str
    surface: Surface
    distance_km: float = Field(gt=0)
    ascent_m: int = Field(ge=0)
    estimated_seconds: int = Field(gt=0)
    geometry: LineString
    elevation_profile: list[ElevationSample] = Field(min_length=2)


class PreviewResponse(BaseModel):
    source: Literal["demo"] = "demo"
    routes: list[DemoRoute]


class SurfaceCoverage(BaseModel):
    paved_pct: int = Field(ge=0, le=100)
    unpaved_pct: int = Field(ge=0, le=100)
    unknown_pct: int = Field(ge=0, le=100)


class RoutedCircuit(BaseModel):
    id: str
    name: str
    distance_km: float = Field(gt=0)
    ascent_m: int | None = Field(ge=0)
    estimated_seconds: int = Field(gt=0)
    geometry: LineString
    elevation_profile: list[ElevationSample]
    surface: SurfaceCoverage


class RoutesResponse(BaseModel):
    source: Literal["openrouteservice"] = "openrouteservice"
    routes: list[RoutedCircuit]
