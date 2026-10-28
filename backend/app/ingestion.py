"""Ingestion pipeline: Elexon BMRS -> SQLite.

The pipeline is idempotent. Re-running it replaces rows on their natural keys,
so a partial or repeated pull cannot duplicate data. Every run is recorded in
``ingest_runs`` so the UI can show how fresh the warehouse is.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from . import config, db
from .elexon import ElexonClient, ElexonError

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    status: str
    actual_rows: int
    forecast_rows: int
    message: str
    started_at: datetime
    finished_at: datetime


def _forecast_publish_window() -> tuple[datetime, datetime]:
    """Publish window that can contain a forecast for the delivery window."""
    from .analytics import gate_closure, london_midnight

    published_from = london_midnight(config.WINDOW_START) - timedelta(
        days=config.FORECAST_HISTORY_PAD_DAYS
    )
    # Gate closure of the final delivery day is the last moment a day-ahead
    # forecast can be selected, so nothing published after it can be used.
    published_to = gate_closure(config.WINDOW_END) + timedelta(hours=1)
    return published_from, published_to


async def run_ingest() -> IngestResult:
    db.init_db()
    started = datetime.now(config.UTC)
    with db.connect() as conn:
        run_id = conn.execute(
            "INSERT INTO ingest_runs (started_at, status) VALUES (?, 'running')",
            (db.iso_utc(started),),
        ).lastrowid

    actual_rows = 0
    forecast_rows = 0
    status = "success"
    message = "OK"

    try:
        published_from, published_to = _forecast_publish_window()
        async with ElexonClient() as client:
            actuals = await client.fetch_wind_actuals(
                config.WINDOW_START, config.WINDOW_END
            )
            forecasts = await client.fetch_wind_forecasts(
                published_from, published_to
            )

        with db.connect() as conn:
            conn.executemany(
                """
                INSERT INTO actuals (
                    start_time, settlement_date, settlement_period,
                    generation_mw, publish_time
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(start_time) DO UPDATE SET
                    settlement_date = excluded.settlement_date,
                    settlement_period = excluded.settlement_period,
                    generation_mw = excluded.generation_mw,
                    publish_time = excluded.publish_time
                """,
                [
                    (
                        row["startTime"],
                        row["settlementDate"],
                        row["settlementPeriod"],
                        float(row["generation"]),
                        row["publishTime"],
                    )
                    for row in actuals
                ],
            )
            conn.executemany(
                """
                INSERT INTO forecasts (start_time, publish_time, generation_mw)
                VALUES (?, ?, ?)
                ON CONFLICT(start_time, publish_time) DO UPDATE SET
                    generation_mw = excluded.generation_mw
                """,
                [
                    (
                        row["startTime"],
                        row["publishTime"],
                        float(row["generation"]),
                    )
                    for row in forecasts
                ],
            )
        actual_rows = len(actuals)
        forecast_rows = len(forecasts)
    except ElexonError as exc:
        status = "failed"
        message = str(exc)
        logger.exception("Elexon ingestion failed")
    except Exception as exc:  # pragma: no cover - defensive
        status = "failed"
        message = f"{type(exc).__name__}: {exc}"
        logger.exception("Unexpected ingestion failure")

    finished = datetime.now(config.UTC)
    with db.connect() as conn:
        conn.execute(
            """
            UPDATE ingest_runs
               SET finished_at = ?, status = ?, actual_rows = ?,
                   forecast_rows = ?, message = ?
             WHERE id = ?
            """,
            (
                db.iso_utc(finished),
                status,
                actual_rows,
                forecast_rows,
                message,
                run_id,
            ),
        )

    return IngestResult(
        status=status,
        actual_rows=actual_rows,
        forecast_rows=forecast_rows,
        message=message,
        started_at=started,
        finished_at=finished,
    )
