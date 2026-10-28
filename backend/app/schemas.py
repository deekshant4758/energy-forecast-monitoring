"""Pydantic response contracts for the public API.

The shapes here are what the React client consumes, and what a reviewer should
read to understand the analytics surface.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Metrics(BaseModel):
    periods: int = Field(description="Settlement periods in scope")
    matched: int = Field(description="Periods with both an actual and a forecast")
    missing_forecast: int
    missing_actual: int
    coverage_pct: float
    mean_actual: float | None
    mean_forecast: float | None
    mae: float | None = Field(description="Mean absolute error, MW")
    rmse: float | None = Field(description="Root mean squared error, MW")
    bias: float | None = Field(description="Mean(forecast - actual), MW")
    bias_pct: float | None
    mae_pct: float | None = Field(description="MAE as % of mean actual generation")
    mean_lead_hours: float | None
    p90_shortfall: float | None = Field(
        description="90th percentile of (actual - forecast) in MW"
    )
    max_abs_error: float | None
    mae_centred: float | None = Field(
        None, description="MAE after removing the mean bias, i.e. pure skill"
    )
    error_std: float | None = None


class SeriesPoint(BaseModel):
    start: str
    label: str
    delivery_day: str
    sp: int
    local_time: str
    actual: float | None
    forecast: float | None
    publish: str | None
    publish_label: str | None
    lead_hours: float | None
    error: float | None
    error_pct: float | None
    status: str


class DailyStat(BaseModel):
    delivery_day: str
    periods: int
    matched: int
    mae: float | None
    rmse: float | None
    bias: float | None
    bias_pct: float | None
    mae_pct: float | None
    coverage_pct: float
    mean_actual: float | None
    mean_forecast: float | None


class HorizonStat(BaseModel):
    horizon: int
    periods: int
    matched: int
    coverage_pct: float
    mae: float | None
    rmse: float | None
    bias: float | None
    bias_pct: float | None
    mae_pct: float | None
    mean_lead_hours: float | None
    p90_shortfall: float | None
    mae_centred: float | None = None
    error_std: float | None = None


class CoverBand(BaseModel):
    p05: float | None
    p10: float | None
    p50: float | None
    p90: float | None
    p95: float | None


class CoverGuidance(BaseModel):
    selected_forecast_mean: float | None
    p90_shortfall: float | None
    p50_shortfall: float | None
    recommended_cover_mw: float | None
    band: CoverBand


class DeskResponse(BaseModel):
    window: dict[str, str]
    horizon: int
    resolution: str
    granularity_minutes: int
    gate_closure_rule: str
    kpis: Metrics
    series: list[SeriesPoint]
    daily: list[DailyStat]
    horizons: list[HorizonStat]
    cover: CoverGuidance


class MatrixCell(BaseModel):
    delivery_day: str
    mae: float | None
    bias: float | None
    mae_pct: float | None
    bias_pct: float | None
    coverage_pct: float


class HorizonMatrix(BaseModel):
    horizon: int
    overall: Metrics
    cells: list[MatrixCell]


class BiasLevelBucket(BaseModel):
    from_: float = Field(alias="from")
    to: float
    periods: int
    mean_forecast: float | None
    mean_actual: float | None
    bias: float | None
    bias_pct: float | None
    actual_to_forecast_ratio: float | None

    model_config = {"populate_by_name": True}


class MethodNote(BaseModel):
    title: str
    body: str
    severity: str = "info"


class SettlementPeriodStat(BaseModel):
    sp: int
    label: str
    mae: float | None
    bias: float | None
    mae_pct: float | None
    bias_pct: float | None
    mean_actual: float | None
    periods: int


class HistogramBin(BaseModel):
    from_: float = Field(alias="from")
    to: float
    count: int
    share: float
    height_pct: float

    model_config = {"populate_by_name": True}


class AccuracyResponse(BaseModel):
    window: dict[str, str]
    horizon: int
    selected: Metrics
    horizons: list[HorizonStat]
    matrix: list[HorizonMatrix]
    by_day: list[DailyStat]
    by_settlement_period: list[SettlementPeriodStat]
    distribution: list[HistogramBin]
    quantiles: CoverBand
    bias_by_level: list[BiasLevelBucket]
    notes: list[MethodNote]


class IngestRun(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    status: str
    actual_rows: int
    forecast_rows: int
    message: str | None


class IngestionResponse(BaseModel):
    counts: dict[str, int]
    expected_actuals: int
    actual_coverage_pct: float
    actual_span: dict[str, str | None]
    forecast_span: dict[str, str | None]
    runs: list[IngestRun]
    recent_publications: list[dict[str, object]]
    sources: list[dict[str, str]]
