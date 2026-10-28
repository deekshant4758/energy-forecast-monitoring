"""SQLite persistence layer.

The dataset is deliberately small (a single month of half-hourly wind data plus
every forecast publication that covered it), so SQLite keeps the deployment
self-contained: no external database is needed for the pilot, and the image can
ship with a pre-seeded file.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS actuals (
    start_time        TEXT PRIMARY KEY,   -- ISO-8601 UTC, e.g. 2026-01-01T00:30:00Z
    settlement_date   TEXT NOT NULL,
    settlement_period INTEGER NOT NULL,
    generation_mw     REAL NOT NULL,
    publish_time      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forecasts (
    start_time    TEXT NOT NULL,
    publish_time  TEXT NOT NULL,
    generation_mw REAL NOT NULL,
    PRIMARY KEY (start_time, publish_time)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_start ON forecasts (start_time);
CREATE INDEX IF NOT EXISTS idx_forecasts_publish ON forecasts (publish_time);

CREATE TABLE IF NOT EXISTS ingest_runs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at        TEXT NOT NULL,
    finished_at       TEXT,
    status            TEXT NOT NULL,      -- running | success | failed
    actual_rows       INTEGER DEFAULT 0,
    forecast_rows     INTEGER DEFAULT 0,
    message           TEXT
);
"""


def iso_utc(moment: datetime) -> str:
    return moment.astimezone(config.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=config.UTC)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def table_counts() -> dict[str, int]:
    """Row counts used by the ingestion status view."""
    init_db()
    with connect() as conn:
        actuals = conn.execute("SELECT COUNT(*) FROM actuals").fetchone()[0]
        forecasts = conn.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0]
        publications = conn.execute(
            "SELECT COUNT(DISTINCT publish_time) FROM forecasts"
        ).fetchone()[0]
    return {
        "actuals": int(actuals),
        "forecasts": int(forecasts),
        "forecast_publications": int(publications),
    }
