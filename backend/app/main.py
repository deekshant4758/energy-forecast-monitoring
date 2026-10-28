"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, db, ingestion, service
from .schemas import AccuracyResponse, DeskResponse, IngestionResponse

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    db.init_db()
    try:
        service.snapshot()
        logger.info("Read model warmed from %s", config.DB_PATH)
    except Exception:  # pragma: no cover - empty warehouse is a valid state
        logger.exception("Could not warm the read model at startup")
    yield


app = FastAPI(
    title="Wind Forecast Trading Desk API",
    version="1.0.0",
    description=(
        "Day-ahead wind generation forecast selection and forecast-accuracy "
        "analytics for the GB national transmission system, built on Elexon "
        "BMRS FUELHH and WINDFOR."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["ops"])
def health() -> dict[str, object]:
    counts = db.table_counts()
    return {
        "status": "ok" if counts["actuals"] else "empty",
        "database": str(config.DB_PATH),
        **counts,
    }


@app.get("/api/meta", tags=["reference"])
def get_meta() -> dict[str, object]:
    return service.meta()


@app.get("/api/desk", response_model=DeskResponse, tags=["desk"])
def get_desk(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    horizon: int | None = Query(None, ge=0, le=72),
    resolution: str | None = Query(None),
) -> dict[str, object]:
    try:
        return service.desk(date_from, date_to, horizon, resolution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/accuracy", response_model=AccuracyResponse, tags=["desk"])
def get_accuracy(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    horizon: int | None = Query(None, ge=0, le=72),
) -> dict[str, object]:
    try:
        return service.accuracy(date_from, date_to, horizon)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/ingestion", response_model=IngestionResponse, tags=["ops"])
def get_ingestion() -> dict[str, object]:
    return service.ingestion_status()


@app.post("/api/ingest/refresh", tags=["ops"])
async def post_refresh() -> dict[str, object]:
    result = await ingestion.run_ingest()
    service.invalidate()
    if result.status != "success":
        raise HTTPException(status_code=502, detail=result.message)
    return {
        "status": result.status,
        "actual_rows": result.actual_rows,
        "forecast_rows": result.forecast_rows,
        "started_at": result.started_at.isoformat(),
        "finished_at": result.finished_at.isoformat(),
    }


# A single-container host (Deplexo) runs this API and serves the built desk UI
# from the same origin, so / is the bundle and /api is the API with nothing in
# between. The API-only compose service has no bundle and keeps nginx in front.
if config.FRONTEND_DIST.is_dir():
    app.mount(
        "/", StaticFiles(directory=str(config.FRONTEND_DIST), html=True), name="ui"
    )
    logger.info("Serving the desk UI from %s", config.FRONTEND_DIST)
