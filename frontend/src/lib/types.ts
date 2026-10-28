/** Types mirror backend/app/schemas.py. Keep them in sync. */

export interface Metrics {
  periods: number;
  matched: number;
  missing_forecast: number;
  missing_actual: number;
  coverage_pct: number;
  mean_actual: number | null;
  mean_forecast: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  bias_pct: number | null;
  mae_pct: number | null;
  mean_lead_hours: number | null;
  p90_shortfall: number | null;
  max_abs_error: number | null;
  mae_centred: number | null;
  error_std: number | null;
}

export interface SeriesPoint {
  start: string;
  label: string;
  delivery_day: string;
  sp: number;
  local_time: string;
  actual: number | null;
  forecast: number | null;
  publish: string | null;
  publish_label: string | null;
  lead_hours: number | null;
  error: number | null;
  error_pct: number | null;
  status: "CLEARED" | "NO FORECAST" | "NO ACTUAL";
}

export interface DailyStat {
  delivery_day: string;
  periods: number;
  matched: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  bias_pct: number | null;
  mae_pct: number | null;
  coverage_pct: number;
  mean_actual: number | null;
  mean_forecast: number | null;
}

export interface HorizonStat {
  horizon: number;
  periods: number;
  matched: number;
  coverage_pct: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  bias_pct: number | null;
  mae_pct: number | null;
  mean_lead_hours: number | null;
  p90_shortfall: number | null;
  mae_centred: number | null;
  error_std: number | null;
}

export interface CoverBand {
  p05: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
}

export interface CoverGuidance {
  selected_forecast_mean: number | null;
  p90_shortfall: number | null;
  p50_shortfall: number | null;
  recommended_cover_mw: number | null;
  band: CoverBand;
}

export interface DeskResponse {
  window: { from: string; to: string };
  horizon: number;
  resolution: string;
  granularity_minutes: number;
  gate_closure_rule: string;
  kpis: Metrics;
  series: SeriesPoint[];
  daily: DailyStat[];
  horizons: HorizonStat[];
  cover: CoverGuidance;
}

export interface MatrixCell {
  delivery_day: string;
  mae: number | null;
  bias: number | null;
  mae_pct: number | null;
  bias_pct: number | null;
  coverage_pct: number;
}

export interface HorizonMatrix {
  horizon: number;
  overall: Metrics;
  cells: MatrixCell[];
}

export interface SettlementPeriodStat {
  sp: number;
  label: string;
  mae: number | null;
  bias: number | null;
  mae_pct: number | null;
  bias_pct: number | null;
  mean_actual: number | null;
  periods: number;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  share: number;
  height_pct: number;
}

export interface BiasLevelBucket {
  from: number;
  to: number;
  periods: number;
  mean_forecast: number | null;
  mean_actual: number | null;
  bias: number | null;
  bias_pct: number | null;
  actual_to_forecast_ratio: number | null;
}

export interface MethodNote {
  title: string;
  body: string;
  severity: "info" | "warning";
}

export interface AccuracyResponse {
  window: { from: string; to: string };
  horizon: number;
  selected: Metrics;
  horizons: HorizonStat[];
  matrix: HorizonMatrix[];
  by_day: DailyStat[];
  by_settlement_period: SettlementPeriodStat[];
  distribution: HistogramBin[];
  quantiles: CoverBand;
  bias_by_level: BiasLevelBucket[];
  notes: MethodNote[];
}

export interface IngestRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  actual_rows: number;
  forecast_rows: number;
  message: string | null;
}

export interface IngestionResponse {
  counts: {
    actuals: number;
    forecasts: number;
    forecast_publications: number;
  };
  expected_actuals: number;
  actual_coverage_pct: number;
  actual_span: { first: string | null; last: string | null };
  forecast_span: { first: string | null; last: string | null };
  runs: IngestRun[];
  recent_publications: {
    publish_time: string;
    periods: number;
    covers_from: string;
    covers_to: string;
  }[];
  sources: { dataset: string; description: string; status: string }[];
}

export interface MetaResponse {
  window: { from: string; to: string; delivery_days: number };
  horizons: number[];
  default_horizon: number;
  resolutions: string[];
  gate_closure: {
    hour: number;
    minute: number;
    timezone: string;
    description: string;
  };
  sources: { dataset: string; description: string; endpoint: string }[];
  coverage: {
    actuals: { start: string | null; end: string | null };
    periods_with_actual: number;
  };
  rows_in_memory: number;
  loaded_at: string;
  last_ingest: IngestRun | null;
}
