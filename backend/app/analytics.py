"""Forecast selection and accuracy analytics.

This module is pure computation: no I/O, no database, no HTTP. That keeps the
business rules easy to review and easy to unit-test.

The two questions the desk has to answer
----------------------------------------
1. *What did we know when we had to bid?* A forecast is only usable for a
   settlement period if it existed early enough. For every period we pick the
   most recent WINDFOR publication that satisfies both of these:

   * it was published before day-ahead gate closure (12:00 Europe/London on
     the day before delivery), and
   * it was published at least ``horizon`` hours before the period starts.

   The later of the two cut-offs wins, so the rule degrades gracefully when a
   horizon is longer than the day-ahead lead time.

2. *How wrong has that forecast been?* Given the selected series we quantify
   error (MAE, RMSE, bias), coverage, the realised shortfall distribution and
   how all of that changes with lead time and block length.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from statistics import mean
from typing import Iterable, Mapping, Sequence

from . import config

HALF_HOUR = timedelta(minutes=30)

# WINDFOR publishes one target value per hour while FUELHH reports every half
# hour. An hourly value describes the hour that begins at its ``startTime``, so
# both settlement periods inside that hour are served by the same forecast row
# (step-hold, no interpolation). This is modelled explicitly rather than hidden
# in the join, because it is the reason half-hourly coverage differs from
# hourly coverage.
FORECAST_GRID = timedelta(hours=1)


# --------------------------------------------------------------------------- #
# Time model
# --------------------------------------------------------------------------- #
def gate_closure(delivery_day: date) -> datetime:
    """Day-ahead gate closure for a delivery day, as an aware UTC datetime.

    Gate closure is 12:00 Europe/London on the previous calendar day, so the
    returned instant moves by an hour across the BST boundary.
    """
    local = datetime.combine(
        delivery_day - timedelta(days=1),
        time(config.GATE_CLOSURE_HOUR, config.GATE_CLOSURE_MINUTE),
        tzinfo=config.LONDON,
    )
    return local.astimezone(config.UTC)


def london_midnight(day: date) -> datetime:
    return datetime.combine(day, time(0, 0), tzinfo=config.LONDON).astimezone(
        config.UTC
    )


@dataclass(frozen=True)
class Period:
    """One half-hourly settlement period in the delivery window."""

    start: datetime
    delivery_day: date
    sp: int

    @property
    def label(self) -> str:
        local = self.start.astimezone(config.LONDON)
        return local.strftime("%d/%m %H:%M")


def settlement_periods(start_day: date, end_day: date) -> list[Period]:
    """Every half-hourly settlement period between two delivery days."""
    periods: list[Period] = []
    day = start_day
    while day <= end_day:
        midnight_local = datetime.combine(day, time(0, 0), tzinfo=config.LONDON)
        for index in range(48):
            local = midnight_local + index * HALF_HOUR
            periods.append(
                Period(
                    start=local.astimezone(config.UTC),
                    delivery_day=day,
                    sp=index + 1,
                )
            )
        day += timedelta(days=1)
    return periods


def settlement_period_for(start: datetime) -> int:
    local = start.astimezone(config.LONDON)
    return (local.hour * 60 + local.minute) // 30 + 1


# --------------------------------------------------------------------------- #
# Forecast book
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Publication:
    publish: datetime
    generation: float


class ForecastBook:
    """Lookup of every publication that covers a given settlement period."""

    def __init__(self, rows: Iterable[tuple[datetime, datetime, float]]) -> None:
        book: dict[datetime, list[Publication]] = {}
        for start, publish, generation in rows:
            book.setdefault(start, []).append(Publication(publish, generation))
        for publications in book.values():
            publications.sort(key=lambda p: p.publish)
        self._book = book

    def pick(self, start: datetime, cutoff: datetime) -> Publication | None:
        """Most recent publication for ``start`` that existed by ``cutoff``."""
        publications = self._book.get(start)
        if not publications:
            return None
        chosen: Publication | None = None
        for publication in publications:  # ascending by publish time
            if publication.publish <= cutoff:
                chosen = publication
            else:
                break
        return chosen

    def publications_for(self, start: datetime) -> int:
        return len(self._book.get(start, ()))

    def __len__(self) -> int:  # pragma: no cover - convenience
        return len(self._book)


# --------------------------------------------------------------------------- #
# Selection
# --------------------------------------------------------------------------- #
@dataclass
class Row:
    """A settlement period joined to its selected forecast and its actual."""

    period: Period
    actual: float | None
    forecast: float | None
    publish: datetime | None
    lead_hours: float | None
    status: str

    @property
    def matched(self) -> bool:
        return self.actual is not None and self.forecast is not None

    @property
    def error(self) -> float | None:
        if not self.matched:
            return None
        return self.forecast - self.actual  # type: ignore[operator]

    @property
    def error_pct(self) -> float | None:
        if not self.matched or not self.actual:
            return None
        return (self.forecast - self.actual) / self.actual * 100  # type: ignore[operator]


def selection_cutoff(period: Period, horizon_hours: int) -> datetime:
    """Latest publish time that may be used for this period."""
    day_ahead = gate_closure(period.delivery_day)
    lead_based = period.start - timedelta(hours=horizon_hours)
    return min(day_ahead, lead_based)


def forecast_key(period: Period) -> datetime:
    """Target timestamp on the WINDFOR hourly grid that covers this period."""
    return period.start.replace(minute=0, second=0, microsecond=0)


def build_rows(
    periods: Sequence[Period],
    actuals: Mapping[datetime, float],
    book: ForecastBook,
    horizon_hours: int,
    block: int = 1,
) -> list[Row]:
    """Join actuals and the eligible forecast for every period.

    ``block`` aggregates consecutive periods (2 => half-hourly pairs). Block
    statistics matter for the desk because power is traded in blocks, and
    forecast error shrinks as the block gets longer.
    """
    raw: list[Row] = []
    for period in periods:
        cutoff = selection_cutoff(period, horizon_hours)
        publication = book.pick(forecast_key(period), cutoff)
        actual = actuals.get(period.start)
        forecast = publication.generation if publication else None
        publish = publication.publish if publication else None
        lead = (
            (period.start - publish).total_seconds() / 3600.0 if publish else None
        )
        if forecast is None:
            status = "NO FORECAST"
        elif actual is None:
            status = "NO ACTUAL"
        else:
            status = "CLEARED"
        raw.append(Row(period, actual, forecast, publish, lead, status))

    if block <= 1:
        return raw

    blocked: list[Row] = []
    for offset in range(0, len(raw), block):
        group = raw[offset : offset + block]
        first = group[0].period
        actuals_in = [r.actual for r in group if r.actual is not None]
        forecasts_in = [r.forecast for r in group if r.forecast is not None]
        leads = [r.lead_hours for r in group if r.lead_hours is not None]
        actual = mean(actuals_in) if actuals_in else None
        forecast = mean(forecasts_in) if forecasts_in else None
        publish = min(
            (r.publish for r in group if r.publish is not None), default=None
        )
        lead = min(leads) if leads else None
        if forecast is None:
            status = "NO FORECAST"
        elif actual is None:
            status = "NO ACTUAL"
        else:
            status = "CLEARED"
        blocked.append(Row(first, actual, forecast, publish, lead, status))
    return blocked


# --------------------------------------------------------------------------- #
# Statistics helpers
# --------------------------------------------------------------------------- #
def percentile(values: Sequence[float], q: float) -> float | None:
    """Linear-interpolated percentile. ``q`` is in [0, 100]."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * (q / 100.0)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[int(position)]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def summarise(rows: Sequence[Row]) -> dict[str, object]:
    """Headline accuracy statistics for a set of joined periods."""
    matched = [r for r in rows if r.matched]
    missing_forecast = sum(1 for r in rows if r.forecast is None)
    missing_actual = sum(1 for r in rows if r.forecast is not None and r.actual is None)
    expected = len(rows)

    if not matched:
        return {
            "periods": expected,
            "matched": 0,
            "missing_forecast": missing_forecast,
            "missing_actual": missing_actual,
            "coverage_pct": round((0 / expected) * 100, 1) if expected else 0.0,
            "mean_actual": None,
            "mean_forecast": None,
            "mae": None,
            "rmse": None,
            "bias": None,
            "bias_pct": None,
            "mae_pct": None,
            "mean_lead_hours": None,
            "p90_shortfall": None,
            "max_abs_error": None,
            "mae_centred": None,
            "error_std": None,
        }

    errors = [r.error for r in matched]  # type: ignore[misc]
    abs_errors = [abs(e) for e in errors]
    mean_actual = mean(r.actual for r in matched)  # type: ignore[misc]
    mean_forecast = mean(r.forecast for r in matched)  # type: ignore[misc]
    leads = [r.lead_hours for r in matched if r.lead_hours is not None]
    # Shortfall convention: positive means wind came in BELOW the forecast, so
    # the desk is short thermal cover. It is the negative of the signed error.
    shortfalls = [r.forecast - r.actual for r in matched]  # type: ignore[misc]

    centred = [e - mean(errors) for e in errors]

    return {
        "periods": expected,
        "matched": len(matched),
        "missing_forecast": missing_forecast,
        "missing_actual": missing_actual,
        "coverage_pct": round(len(matched) / expected * 100, 1) if expected else 0.0,
        "mean_actual": _round(mean_actual),
        "mean_forecast": _round(mean_forecast),
        "mae": _round(mean(abs_errors)),
        "rmse": _round(math.sqrt(mean(e * e for e in errors))),
        "bias": _round(mean(errors)),
        "bias_pct": _round(mean(errors) / mean_actual * 100, 2) if mean_actual else None,
        "mae_pct": _round(mean(abs_errors) / mean_actual * 100, 2) if mean_actual else None,
        "mean_lead_hours": _round(mean(leads), 2) if leads else None,
        "p90_shortfall": _round(percentile(shortfalls, 90)),
        "max_abs_error": _round(max(abs_errors)),
        # Skill with the systematic offset removed: this is the number the desk
        # should compare across horizons, because it is not contaminated by the
        # scope gap between the metered actual and the forecast.
        "mae_centred": _round(mean(abs(c) for c in centred)),
        "error_std": _round(math.sqrt(mean(c * c for c in centred))),
    }


def by_day(rows: Sequence[Row]) -> list[dict[str, object]]:
    buckets: dict[date, list[Row]] = {}
    for row in rows:
        buckets.setdefault(row.period.delivery_day, []).append(row)
    return [
        {"delivery_day": day.isoformat(), **summarise(group)}
        for day, group in sorted(buckets.items())
    ]


def by_settlement_period(rows: Sequence[Row]) -> list[dict[str, object]]:
    buckets: dict[int, list[Row]] = {}
    for row in rows:
        buckets.setdefault(row.period.sp, []).append(row)
    result: list[dict[str, object]] = []
    for sp in sorted(buckets):
        stats = summarise(buckets[sp])
        result.append(
            {
                "sp": sp,
                "label": f"SP{sp:02d}",
                "mae": stats["mae"],
                "bias": stats["bias"],
                "mae_pct": stats["mae_pct"],
                "bias_pct": stats["bias_pct"],
                "mean_actual": stats["mean_actual"],
                "periods": stats["matched"],
            }
        )
    return result


def error_histogram(rows: Sequence[Row], bins: int = 21) -> list[dict[str, object]]:
    """Distribution of signed forecast error in MW."""
    errors = [r.error for r in rows if r.error is not None]  # type: ignore[misc]
    if not errors:
        return []
    low, high = min(errors), max(errors)
    if low == high:
        low -= 1
        high += 1
    width = (high - low) / bins
    counts = [0] * bins
    for error in errors:
        index = min(int((error - low) / width), bins - 1)
        counts[index] += 1
    peak = max(counts) or 1
    return [
        {
            "from": _round(low + index * width),
            "to": _round(low + (index + 1) * width),
            "count": counts[index],
            "share": round(counts[index] / len(errors) * 100, 1),
            "height_pct": round(counts[index] / peak * 100, 1),
        }
        for index in range(bins)
    ]


def bias_by_level(rows: Sequence[Row], step: float = 4000.0) -> list[dict[str, object]]:
    """Bias against generation level.

    If error were pure noise the bias would be flat across levels. A bias that
    grows with output points at a boundary problem between the two datasets
    rather than at forecast skill, which is exactly the diagnostic a desk needs
    before it recalibrates anything.
    """
    matched = [r for r in rows if r.matched]
    if not matched:
        return []

    # Bin on integer multiples of ``step`` so the top bucket never double counts.
    groups: dict[int, list[Row]] = {}
    for row in matched:
        index = int(max(row.forecast, 0.0) // step)  # type: ignore[arg-type]
        groups.setdefault(index, []).append(row)

    buckets: list[dict[str, object]] = []
    for index in sorted(groups):
        group = groups[index]
        errors = [r.error for r in group]  # type: ignore[misc]
        actuals_in = [r.actual for r in group]  # type: ignore[misc]
        forecasts_in = [r.forecast for r in group]  # type: ignore[misc]
        forecast_mean = mean(forecasts_in)
        buckets.append(
            {
                "from": index * step,
                "to": (index + 1) * step,
                "periods": len(group),
                "mean_forecast": _round(forecast_mean),
                "mean_actual": _round(mean(actuals_in)),
                "bias": _round(mean(errors)),
                "bias_pct": _round(mean(errors) / forecast_mean * 100, 2)
                if forecast_mean
                else None,
                "actual_to_forecast_ratio": _round(
                    mean(actuals_in) / forecast_mean, 3
                )
                if forecast_mean
                else None,
            }
        )
    return buckets


def quantiles(rows: Sequence[Row]) -> dict[str, float | None]:
    """Realised shortfall quantiles, used for the procurement cover band.

    Positive values mean the forecast over-stated wind, i.e. the desk is short.
    """
    shortfalls = [r.forecast - r.actual for r in rows if r.matched]  # type: ignore[misc]
    return {
        "p05": _round(percentile(shortfalls, 5)),
        "p10": _round(percentile(shortfalls, 10)),
        "p50": _round(percentile(shortfalls, 50)),
        "p90": _round(percentile(shortfalls, 90)),
        "p95": _round(percentile(shortfalls, 95)),
    }
