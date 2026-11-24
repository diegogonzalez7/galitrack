from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from .planner.fixtures import make_demo_routes
from .planner.models import PreviewRequest, PreviewResponse

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


app.include_router(api)
