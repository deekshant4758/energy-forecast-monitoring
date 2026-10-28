"""Read model: loads the warehouse, applies the analytics, shapes API payloads.

The dataset is small (one month of half-hourly wind data plus roughly 25k
forecast rows), so it is cached in process memory and invalidated whenever a
new ingestion run succeeds. That keeps every request well under a millisecond
of compute and avoids a round trip per settlement period.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import date, datetime

from . import analytics, config, db


@dataclass
class Snapshot:
    actuals: dict[datetime, float]
    book: analytics.ForecastBook
    loaded_at: datetime
    rows: int


_lock = threading.Lock()
_snapshot: Snapshot | None = None

RESOLUTIONS: dict[str, int] = {"30m": 1, "2h": 4, "4h": 8}


def invalidate() -> None:
    global _snapshot
    with _lock:
        _snapshot = None


def snapshot() -> Snapshot:
    global _snapshot
    with _lock:
        if _snapshot is not None:
            return _snapshot
        db.init_db()
        with db.connect() as conn:
            actual_rows = conn.execute(
                "SELECT start_time, generation_mw FROM actuals"
            ).fetchall()
            forecast_rows = conn.execute(
                "SELECT start_time, publish_time, generation_mw FROM forecasts"
            ).fetchall()
        actuals = {
            db.parse_iso(row["start_time"]): float(row["generation_mw"])
            for row in actual_rows
        }
        book = analytics.ForecastBook(
            (
                db.parse_iso(row["start_time"]),
                db.parse_iso(row["publish_time"]),
                float(row["generation_mw"]),
            )
            for row in forecast_rows
        )
        _snapshot = Snapshot(
            actuals=actuals,
            book=book,
            loaded_at=datetime.now(config.UTC),
            rows=len(actual_rows) + len(forecast_rows),
        )
        return _snapshot


# --------------------------------------------------------------------------- #
# Request parsing helpers
# --------------------------------------------------------------------------- #
def clamp_window(start: date | None, end: date | None) -> tuple[date, date]:
    start_day = max(start or config.WINDOW_START, config.WINDOW_START)
    end_day = min(end or config.WINDOW_END, config.WINDOW_END)
    if end_day < start_day:
        raise ValueError("`to` must be on or after `from`")
    return start_day, end_day


def clamp_horizon(horizon: int | None) -> int:
    if horizon is None:
        return config.DEFAULT_HORIZON
    if horizon < 0 or horizon > 72:
        raise ValueError("`horizon` must be between 0 and 72 hours")
    return horizon


def block_for(resolution: str | None) -> int:
    key = (resolution or "30m").lower()
    if key not in RESOLUTIONS:
        raise ValueError(f"`resolution` must be one of {sorted(RESOLUTIONS)}")
    return RESOLUTIONS[key]


def _row_payload(row: analytics.Row) -> dict[str, object]:
    local = row.period.start.astimezone(config.LONDON)
    return {
        "start": row.period.start.isoformat().replace("+00:00", "Z"),
        "label": row.period.label,
        "delivery_day": row.period.delivery_day.isoformat(),
        "sp": row.period.sp,
        "local_time": local.strftime("%H:%M"),
        "actual": None if row.actual is None else round(row.actual, 1),
        "forecast": None if row.forecast is None else round(row.forecast, 1),
        "publish": (
            None
            if row.publish is None
            else row.publish.isoformat().replace("+00:00", "Z")
        ),
        "publish_label": (
            None
            if row.publish is None
            else row.publish.astimezone(config.LONDON).strftime("%d/%m %H:%M")
        ),
        "lead_hours": None if row.lead_hours is None else round(row.lead_hours, 1),
        "error": None if row.error is None else round(row.error, 1),
        "error_pct": None if row.error_pct is None else round(row.error_pct, 2),
        "status": row.status,
    }


# --------------------------------------------------------------------------- #
# Endpoints' payloads
# --------------------------------------------------------------------------- #
def meta() -> dict[str, object]:
    snap = snapshot()
    coverage = {
        "actuals": {
            "start": min(snap.actuals).isoformat().replace("+00:00", "Z")
            if snap.actuals
            else None,
            "end": max(snap.actuals).isoformat().replace("+00:00", "Z")
            if snap.actuals
            else None,
        },
        "periods_with_actual": len(snap.actuals),
    }
    with db.connect() as conn:
        run = conn.execute(
            "SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return {
        "window": {
            "from": config.WINDOW_START.isoformat(),
            "to": config.WINDOW_END.isoformat(),
            "delivery_days": (config.WINDOW_END - config.WINDOW_START).days + 1,
        },
        "horizons": list(config.HORIZONS),
        "default_horizon": config.DEFAULT_HORIZON,
        "resolutions": list(RESOLUTIONS),
        "gate_closure": {
            "hour": config.GATE_CLOSURE_HOUR,
            "minute": config.GATE_CLOSURE_MINUTE,
            "timezone": "Europe/London",
            "description": (
                "Day-ahead gate closure: 12:00 Europe/London on the day before delivery"
            ),
        },
        "sources": [
            {
                "dataset": "FUELHH",
                "description": "Half-hourly actual wind generation (national)",
                "endpoint": f"{config.ELEXON_BASE_URL}/datasets/FUELHH",
            },
            {
                "dataset": "WINDFOR",
                "description": "National wind generation forecast with publish time",
                "endpoint": f"{config.ELEXON_BASE_URL}/datasets/WINDFOR",
            },
        ],
        "coverage": coverage,
        "rows_in_memory": snap.rows,
        "loaded_at": snap.loaded_at.isoformat().replace("+00:00", "Z"),
        "last_ingest": _ingest_payload(run) if run else None,
    }


def _ingest_payload(run) -> dict[str, object]:
    return {
        "id": run["id"],
        "started_at": run["started_at"],
        "finished_at": run["finished_at"],
        "status": run["status"],
        "actual_rows": run["actual_rows"],
        "forecast_rows": run["forecast_rows"],
        "message": run["message"],
    }


def desk(
    start: date | None,
    end: date | None,
    horizon: int | None,
    resolution: str | None,
) -> dict[str, object]:
    start_day, end_day = clamp_window(start, end)
    horizon_hours = clamp_horizon(horizon)
    block = block_for(resolution)
    snap = snapshot()

    periods = analytics.settlement_periods(start_day, end_day)
    rows = analytics.build_rows(
        periods, snap.actuals, snap.book, horizon_hours, block
    )
    stats = analytics.summarise(rows)

    # Headline horizon comparison so the desk sees the cost of lead time.
    horizon_rows = []
    for candidate in config.HORIZONS:
        candidate_rows = analytics.build_rows(
            periods, snap.actuals, snap.book, candidate, block
        )
        summary = analytics.summarise(candidate_rows)
        horizon_rows.append({"horizon": candidate, **summary})

    # Procurement guidance: how much thermal cover to hold on top of what the
    # selected forecast implies, so that 9 delivery days in 10 are covered.
    band = analytics.quantiles(rows)
    cover = {
        "selected_forecast_mean": stats["mean_forecast"],
        "p90_shortfall": band["p90"],
        "p50_shortfall": band["p50"],
        "recommended_cover_mw": (
            None if band["p90"] is None else round(max(band["p90"], 0.0), 1)
        ),
        "band": band,
    }

    return {
        "window": {"from": start_day.isoformat(), "to": end_day.isoformat()},
        "horizon": horizon_hours,
        "resolution": (resolution or "30m").lower(),
        "granularity_minutes": 30 * block,
        "gate_closure_rule": (
            "publish <= min(12:00 London on D-1, period start - horizon)"
        ),
        "kpis": stats,
        "series": [_row_payload(row) for row in rows],
        "daily": analytics.by_day(rows),
        "horizons": horizon_rows,
        "cover": cover,
    }


def accuracy(
    start: date | None, end: date | None, horizon: int | None
) -> dict[str, object]:
    start_day, end_day = clamp_window(start, end)
    horizon_hours = clamp_horizon(horizon)
    snap = snapshot()
    periods = analytics.settlement_periods(start_day, end_day)

    selected = analytics.build_rows(
        periods, snap.actuals, snap.book, horizon_hours, 1
    )

    # Horizon x delivery-day matrix: MAE share drives intensity, bias sign drives
    # colour, so a reviewer can see where lead time hurts and in which direction.
    matrix: list[dict[str, object]] = []
    for candidate in config.HORIZONS:
        candidate_rows = analytics.build_rows(
            periods, snap.actuals, snap.book, candidate, 1
        )
        daily = analytics.by_day(candidate_rows)
        matrix.append(
            {
                "horizon": candidate,
                "overall": analytics.summarise(candidate_rows),
                "cells": [
                    {
                        "delivery_day": day["delivery_day"],
                        "mae": day["mae"],
                        "bias": day["bias"],
                        "mae_pct": day["mae_pct"],
                        "bias_pct": day["bias_pct"],
                        "coverage_pct": day["coverage_pct"],
                    }
                    for day in daily
                ],
            }
        )

    return {
        "window": {"from": start_day.isoformat(), "to": end_day.isoformat()},
        "horizon": horizon_hours,
        "selected": analytics.summarise(selected),
        "horizons": [
            {"horizon": entry["horizon"], **entry["overall"]} for entry in matrix
        ],
        "matrix": matrix,
        "by_day": analytics.by_day(selected),
        "by_settlement_period": analytics.by_settlement_period(selected),
        "distribution": analytics.error_histogram(selected),
        "quantiles": analytics.quantiles(selected),
        "bias_by_level": analytics.bias_by_level(selected),
        "notes": _method_notes(matrix),
    }


def _method_notes(matrix: list[dict[str, object]]) -> list[dict[str, str]]:
    """Methodology caveats the desk must read before acting on the numbers."""
    notes = [
        {
            "title": "Resolution mismatch is modelled, not hidden",
            "body": (
                "WINDFOR publishes one target value per hour while FUELHH reports "
                "every half hour. Each hourly value is applied to the two "
                "settlement periods inside that hour (step-hold), so half-hourly "
                "coverage is reported against the hourly grid rather than being "
                "silently halved."
            ),
            "severity": "info",
        },
        {
            "title": "Positive bias grows with output",
            "body": (
                "Raw error is dominated by a systematic positive offset that widens "
                "as generation rises. That is the signature of a boundary "
                "difference between the metered transmission signal and the "
                "forecast, not of forecast skill. Treat 'centred MAE' as the "
                "comparable skill metric until the client confirms the "
                "forecast's scope."
            ),
            "severity": "warning",
        },
    ]
    for entry in matrix:
        if entry["horizon"] == 48:
            coverage = entry["overall"]["coverage_pct"]  # type: ignore[index]
            if coverage < 90:
                notes.append(
                    {
                        "title": "48h lead is not satisfiable",
                        "body": (
                            f"Only {coverage}% of periods have a forecast published "
                            "at least 48 hours before delivery. WINDFOR's "
                            "publication horizon is roughly 48h, so a 48h "
                            "constraint leaves almost no usable signal. Plan "
                            "around the 0-36h band."
                        ),
                        "severity": "warning",
                    }
                )
    return notes


def ingestion_status() -> dict[str, object]:
    db.init_db()
    counts = db.table_counts()
    with db.connect() as conn:
        runs = conn.execute(
            "SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 10"
        ).fetchall()
        first_actual = conn.execute(
            "SELECT MIN(start_time) AS first FROM actuals"
        ).fetchone()["first"]
        last_actual = conn.execute(
            "SELECT MAX(start_time) AS last FROM actuals"
        ).fetchone()["last"]
        first_forecast = conn.execute(
            "SELECT MIN(publish_time) AS first FROM forecasts"
        ).fetchone()["first"]
        last_forecast = conn.execute(
            "SELECT MAX(publish_time) AS last FROM forecasts"
        ).fetchone()["last"]
        publications = conn.execute(
            """
            SELECT publish_time, COUNT(*) AS periods,
                   MIN(start_time) AS covers_from,
                   MAX(start_time) AS covers_to
              FROM forecasts
             GROUP BY publish_time
             ORDER BY publish_time DESC
             LIMIT 8
            """
        ).fetchall()

    expected_periods = (
        (config.WINDOW_END - config.WINDOW_START).days + 1
    ) * 48
    snap = snapshot()
    coverage_pct = (
        round(len(snap.actuals) / expected_periods * 100, 1)
        if expected_periods
        else 0.0
    )

    return {
        "counts": counts,
        "expected_actuals": expected_periods,
        "actual_coverage_pct": coverage_pct,
        "actual_span": {"first": first_actual, "last": last_actual},
        "forecast_span": {"first": first_forecast, "last": last_forecast},
        "runs": [_ingest_payload(run) for run in runs],
        "recent_publications": [dict(row) for row in publications],
        "sources": [
            {
                "dataset": "FUELHH",
                "description": "Actual wind generation, national, half-hourly",
                "status": "connected" if counts["actuals"] else "empty",
            },
            {
                "dataset": "WINDFOR",
                "description": "Wind generation forecast, with publish time",
                "status": "connected" if counts["forecasts"] else "empty",
            },
        ],
    }
