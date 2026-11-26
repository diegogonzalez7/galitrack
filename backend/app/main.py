from collections.abc import AsyncIterator
from os import getenv
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from pydantic import BaseModel

from .planner.fixtures import make_demo_routes
from .planner.models import PreviewRequest, PreviewResponse, RoutesResponse
from .planner.openrouteservice import RoutingError, generate_circuits

app = FastAPI(
    title="Galitrack API",
    version="0.1.0",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
)
api = APIRouter(prefix="/api")


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@api.get("/health", tags=["system"])
def health() -> HealthResponse:
    return HealthResponse()


@api.post("/routes/preview", tags=["planner"])
def preview_routes(request: PreviewRequest) -> PreviewResponse:
    return PreviewResponse(routes=make_demo_routes(request))


async def ors_client() -> AsyncIterator[httpx.AsyncClient]:
    key = getenv("ORS_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Configura ORS_API_KEY en el servidor para generar rutas reales.")
    async with httpx.AsyncClient(headers={"Authorization": key}, timeout=httpx.Timeout(6, connect=3)) as client:
        yield client


@api.post("/routes", tags=["planner"])
async def generate_routes(
    request: PreviewRequest, client: Annotated[httpx.AsyncClient, Depends(ors_client)]
) -> RoutesResponse:
    try:
        return RoutesResponse(routes=await generate_circuits(client, request))
    except RoutingError as error:
        raise HTTPException(error.status, str(error)) from error


app.include_router(api)
