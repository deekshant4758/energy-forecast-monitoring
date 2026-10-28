"""Unit tests for the pure analytics core.

These are hermetic: synthetic settlement periods and synthetic publications, so
the business rules are pinned without depending on Elexon availability.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from app import analytics, config

UTC = config.UTC


def dt(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def one_day(day: date = date(2026, 1, 15)) -> list[analytics.Period]:
    return analytics.settlement_periods(day, day)


# --------------------------------------------------------------------------- #
# Time model
# --------------------------------------------------------------------------- #
def test_gate_closure_is_noon_on_the_previous_day_in_january():
    closure = analytics.gate_closure(date(2026, 1, 15))
    assert closure == dt("2026-01-14T12:00:00Z")


def test_gate_closure_follows_british_summer_time():
    # 12:00 BST is 11:00 UTC.
    closure = analytics.gate_closure(date(2026, 7, 15))
    assert closure == dt("2026-07-14T11:00:00Z")


def test_settlement_periods_cover_a_full_winter_day():
    periods = one_day()
    assert len(periods) == 48
    assert periods[0].sp == 1
    assert periods[-1].sp == 48
    assert periods[0].start == dt("2026-01-15T00:00:00Z")
    assert periods[-1].start == dt("2026-01-15T23:30:00Z")


# --------------------------------------------------------------------------- #
# Selection rules
# --------------------------------------------------------------------------- #
def test_cutoff_is_the_earlier_of_gate_closure_and_lead_requirement():
    period = analytics.Period(dt("2026-01-15T00:00:00Z"), date(2026, 1, 15), 1)
    # Gate closure (14/01 12:00) is earlier than start - 4h (14/01 20:00).
    assert analytics.selection_cutoff(period, 4) == dt("2026-01-14T12:00:00Z")
    # A 36h requirement reaches further back than gate closure.
    assert analytics.selection_cutoff(period, 36) == dt("2026-01-13T12:00:00Z")


def test_forecast_key_uses_the_hourly_grid():
    period = analytics.Period(dt("2026-01-15T00:30:00Z"), date(2026, 1, 15), 2)
    assert analytics.forecast_key(period) == dt("2026-01-15T00:00:00Z")


def test_pick_returns_the_latest_publication_allowed_by_the_cutoff():
    target = dt("2026-01-15T00:00:00Z")
    book = analytics.ForecastBook(
        [
            (target, dt("2026-01-13T00:00:00Z"), 5000.0),  # too early
            (target, dt("2026-01-14T11:30:00Z"), 8000.0),  # allowed
            (target, dt("2026-01-14T15:30:00Z"), 9000.0),  # after gate closure
        ]
    )
    chosen = book.pick(target, dt("2026-01-14T12:00:00Z"))
    assert chosen is not None
    assert chosen.generation == 8000.0
    assert chosen.publish == dt("2026-01-14T11:30:00Z")


def test_pick_returns_nothing_when_every_publication_is_too_late():
    target = dt("2026-01-15T00:00:00Z")
    book = analytics.ForecastBook([(target, dt("2026-01-14T15:30:00Z"), 9000.0)])
    assert book.pick(target, dt("2026-01-14T12:00:00Z")) is None


# --------------------------------------------------------------------------- #
# Joining
# --------------------------------------------------------------------------- #
def test_hourly_forecast_is_step_held_across_both_half_hours():
    periods = one_day()
    actuals = {p.start: 1000.0 for p in periods}
    book = analytics.ForecastBook(
        [(dt(f"2026-01-15T{h:02d}:00:00Z"), dt("2026-01-14T11:30:00Z"), 1200.0)
         for h in range(24)]
    )
    rows = analytics.build_rows(periods, actuals, book, 4, 1)
    assert all(row.forecast == 1200.0 for row in rows)
    assert all(row.status == "CLEARED" for row in rows)


def test_missing_forecast_is_reported_as_a_gap_not_dropped():
    periods = one_day()
    actuals = {p.start: 1000.0 for p in periods}
    book = analytics.ForecastBook(
        [(dt(f"2026-01-15T{h:02d}:00:00Z"), dt("2026-01-14T11:30:00Z"), 1000.0)
         for h in range(12)]  # only the first half of the day is covered
    )
    rows = analytics.build_rows(periods, actuals, book, 4, 1)
    gap_rows = [row for row in rows if row.status == "NO FORECAST"]
    assert len(gap_rows) == 24
    assert all(row.actual == 1000.0 for row in gap_rows)


def test_block_aggregation_averages_values_and_keeps_the_earliest_lead():
    periods = one_day()[:4]
    actuals = {periods[0].start: 1000.0, periods[1].start: 1400.0,
               periods[2].start: 600.0, periods[3].start: 1000.0}
    book = analytics.ForecastBook(
        [(dt(f"2026-01-15T0{h}:00:00Z"), dt("2026-01-14T11:30:00Z"), 1200.0)
         for h in range(3)]
    )
    rows = analytics.build_rows(periods, actuals, book, 4, 4)
    assert len(rows) == 1
    assert rows[0].actual == pytest.approx(1000.0)
    assert rows[0].forecast == pytest.approx(1200.0)
    assert rows[0].lead_hours == pytest.approx(12.5)


# --------------------------------------------------------------------------- #
# Statistics
# --------------------------------------------------------------------------- #
def test_percentile_interpolates_between_observations():
    values = [0.0, 10.0, 20.0, 30.0, 40.0]
    assert analytics.percentile(values, 50) == pytest.approx(20.0)
    assert analytics.percentile(values, 25) == pytest.approx(10.0)
    assert analytics.percentile(values, 90) == pytest.approx(36.0)
    assert analytics.percentile([], 90) is None


def _rows(actual: list[float], forecast: list[float]) -> list[analytics.Row]:
    periods = one_day()
    return [
        analytics.Row(periods[i], a, f, dt("2026-01-14T11:30:00Z"), 12.5, "CLEARED")
        for i, (a, f) in enumerate(zip(actual, forecast))
    ]


def test_metrics_compute_error_direction_and_magnitude():
    rows = _rows([1000.0, 2000.0], [1100.0, 1900.0])
    stats = analytics.summarise(rows)
    assert stats["mae"] == pytest.approx(100.0)
    assert stats["rmse"] == pytest.approx(100.0)
    assert stats["bias"] == pytest.approx(0.0)
    assert stats["matched"] == 2
    # Both periods in the fixture are matched, so nothing is missing.
    assert stats["coverage_pct"] == pytest.approx(100.0)


def test_bias_is_positive_when_the_forecast_runs_hot():
    rows = _rows([1000.0, 2000.0], [1500.0, 2500.0])
    stats = analytics.summarise(rows)
    assert stats["bias"] == pytest.approx(500.0)
    # A constant offset is systematic error, so skill after de-meaning is zero.
    assert stats["mae_centred"] == pytest.approx(0.0)


def test_summarise_reports_empty_windows_without_dividing_by_zero():
    stats = analytics.summarise([])
    assert stats["matched"] == 0
    assert stats["coverage_pct"] == 0.0
    assert stats["mae"] is None


def test_p90_shortfall_captures_the_wind_missing_the_forecast():
    rows = _rows([900.0, 950.0, 1000.0, 1050.0, 1100.0],
                 [1000.0, 1000.0, 1000.0, 1000.0, 1000.0])
    stats = analytics.summarise(rows)
    # shortfall = actual - forecast = -100, -50, 0, 50, 100
    assert stats["p90_shortfall"] == pytest.approx(80.0)


def test_bias_by_level_exposes_a_level_dependent_offset():
    rows = _rows(
        actual=[500.0, 1500.0, 4500.0, 5500.0],
        forecast=[1000.0, 2000.0, 5000.0, 6000.0],
    )
    buckets = analytics.bias_by_level(rows, step=2000.0)
    assert buckets
    # Every period in the fixture is over-forecast by the same 500 MW.
    assert all(bucket["bias"] == pytest.approx(500.0) for bucket in buckets)
    # No period may be counted twice across buckets.
    assert sum(bucket["periods"] for bucket in buckets) == len(rows)


def test_error_histogram_shares_sum_to_one_hundred():
    rows = _rows([1000.0, 1200.0, 1400.0, 1600.0], [1100.0, 1100.0, 1700.0, 1500.0])
    histogram = analytics.error_histogram(rows, bins=5)
    assert len(histogram) == 5
    assert sum(bin_["count"] for bin_ in histogram) == 4
    assert sum(bin_["share"] for bin_ in histogram) == pytest.approx(100.0, abs=0.2)
