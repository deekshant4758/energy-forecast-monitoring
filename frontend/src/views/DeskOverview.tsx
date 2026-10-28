import { useMemo } from "react";
import { ArrowUpRight, Download, Radio } from "lucide-react";
import { ActualForecastChart, ChartLegend } from "../components/ActualForecastChart";
import { CoverPanel } from "../components/CoverPanel";
import { HorizonControls, WindowControls, type WindowRange } from "../components/DeskControls";
import { TelemetryTable } from "../components/TelemetryTable";
import { MetricCard, Panel, Pill, Segmented } from "../components/primitives";
import type { DeskResponse, MetaResponse } from "../lib/types";
import { hours, mw, pct, signedMw, signedPct, weekdayDay } from "../lib/format";

const RESOLUTIONS = [
  { value: "30m", label: "30m raw" },
  { value: "2h", label: "2h agg" },
  { value: "4h", label: "4h agg" },
];

export function DeskOverview({
  desk,
  meta,
  range,
  horizon,
  resolution,
  onRange,
  onHorizon,
  onResolution,
  onOpenAccuracy,
}: {
  desk: DeskResponse;
  meta: MetaResponse | null;
  range: WindowRange;
  horizon: number;
  resolution: string;
  onRange: (range: WindowRange) => void;
  onHorizon: (horizon: number) => void;
  onResolution: (resolution: string) => void;
  onOpenAccuracy: () => void;
}) {
  const { kpis, cover } = desk;

  const dailySpread = useMemo(() => {
    const values = desk.daily
      .map((day) => day.bias_pct)
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    return {
      worst: Math.max(...values, ...values.map((value) => Math.abs(value))),
      worstDay: desk.daily
        .filter((day) => day.bias_pct !== null)
        .sort((a, b) => Math.abs(b.bias_pct ?? 0) - Math.abs(a.bias_pct ?? 0))[0],
    };
  }, [desk.daily]);

  const exportCsv = () => {
    const header = [
      "start_utc",
      "delivery_day",
      "settlement_period",
      "local_time",
      "actual_mw",
      "forecast_mw",
      "publish_utc",
      "lead_hours",
      "error_mw",
      "error_pct",
      "status",
    ].join(",");
    const lines = desk.series.map((row) =>
      [
        row.start,
        row.delivery_day,
        row.sp,
        row.local_time,
        row.actual ?? "",
        row.forecast ?? "",
        row.publish ?? "",
        row.lead_hours ?? "",
        row.error ?? "",
        row.error_pct ?? "",
        row.status,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wind-desk_${desk.window.from}_${desk.window.to}_${desk.horizon}h_${desk.resolution}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const biasTone =
    kpis.bias === null
      ? "text-on-surface"
      : kpis.bias > 500
        ? "text-error"
        : kpis.bias < -500
          ? "text-secondary"
          : "text-tertiary";

  return (
    <div className="flex flex-col">
      <div className="border-b border-outline-variant bg-surface">
        <WindowControls
          range={range}
          onChange={onRange}
          minDate={meta?.window.from ?? "2026-01-01"}
          maxDate={meta?.window.to ?? "2026-01-31"}
        />
        <HorizonControls
          horizon={horizon}
          horizons={desk.horizons}
          onChange={onHorizon}
          options={meta?.horizons ?? [0, 4, 12, 24, 36, 48]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Segmented
            ariaLabel="Time resolution"
            value={resolution}
            onChange={onResolution}
            options={RESOLUTIONS}
          />
          <span className="text-[10.5px] text-on-surface-variant">
            {desk.series.length} blocks · {desk.granularity_minutes}m granularity
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Pill tone="success" dot>
            Live feed
          </Pill>
          <button
            type="button"
            onClick={onOpenAccuracy}
            className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-[4px] text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant hover:bg-surface-container"
          >
            Error analysis matrix
            <ArrowUpRight size={12} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-[4px] text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant hover:bg-surface-container"
          >
            <Download size={12} />
            CSV
          </button>
        </div>
      </div>

      <div className="p-3">
        <Panel
          title="UK National Transmission System — actual vs day-ahead wind curve"
          subtitle={
            <>
              Delivery horizon {desk.window.from} → {desk.window.to} · Europe/London
              · SP01–SP48 · Rule: {desk.gate_closure_rule}
            </>
          }
          actions={
            <Pill tone="primary" dot>
              Elexon FUELHH / WINDFOR
            </Pill>
          }
          bodyClassName="pt-1"
        >
          <ChartLegend horizon={desk.horizon} />
          <ActualForecastChart series={desk.series} />
        </Panel>

        <div className="panel mt-3 grid grid-cols-2 divide-outline-variant md:grid-cols-3 xl:grid-cols-6 [&>div]:border-b [&>div]:border-outline-variant xl:[&>div]:border-b-0">
          <MetricCard
            label="Mean actual"
            value={mw(kpis.mean_actual)}
            unit="MW"
            hint="Metered transmission"
            footnote={`${kpis.matched} periods`}
          />
          <MetricCard
            label="Mean forecast"
            value={mw(kpis.mean_forecast)}
            unit="MW"
            hint={`Lead ≥ ${desk.horizon}h`}
            footnote={hours(kpis.mean_lead_hours) + " realised lead"}
          />
          <MetricCard
            label="MAE (abs error)"
            value={mw(kpis.mae)}
            unit="MW"
            hint={`${pct(kpis.mae_pct, 2)} of mean actual`}
            footnote={`${mw(kpis.mae_centred)} MW once de-biased`}
          />
          <MetricCard
            label="RMSE"
            value={mw(kpis.rmse)}
            unit="MW"
            hint="Penalises tail spikes"
            footnote={`Max ${mw(kpis.max_abs_error)} MW`}
          />
          <MetricCard
            label="Net bias (F − A)"
            value={signedMw(kpis.bias)}
            unit="MW"
            valueClassName={biasTone}
            hint={
              kpis.bias !== null && kpis.bias > 0
                ? "Over-forecast → short thermal cover"
                : "Under-forecast → surplus cover"
            }
            badge={
              kpis.bias !== null && kpis.bias > 0 ? (
                <Pill tone="danger">Short risk</Pill>
              ) : (
                <Pill tone="success">Long</Pill>
              )
            }
            footnote={signedPct(kpis.bias_pct, 2) + " of mean actual"}
          />
          <MetricCard
            label="Forecast coverage"
            value={`${kpis.matched}/${kpis.periods}`}
            hint={pct(kpis.coverage_pct)}
            footnote={
              kpis.missing_forecast + kpis.missing_actual > 0
                ? `${kpis.missing_forecast + kpis.missing_actual} periods missing feed`
                : "No missing periods"
            }
            badge={
              <Pill tone={kpis.coverage_pct > 99 ? "success" : "warning"}>
                {kpis.coverage_pct > 99 ? "Complete" : "Partial"}
              </Pill>
            }
          />
        </div>

        <div className="panel mt-3">
          <CoverPanel cover={cover} />
        </div>

        <Panel
          className="mt-3"
          title="Half-hourly settlement telemetry stream"
          subtitle="Direct Elexon BMRS WINDFOR ingestion log with lead-time constraint validation."
          actions={
            <Pill tone="neutral" dot>
              <Radio size={10} /> Selected horizon {desk.horizon}h
            </Pill>
          }
          bodyClassName="p-0"
        >
          <TelemetryTable
            series={desk.series}
            granularityMinutes={desk.granularity_minutes}
          />
        </Panel>

        <Panel
          className="mt-3"
          title="Delivery-day roll-up"
          subtitle="Bias by delivery day across the selected window."
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-outline-variant">
                  {[
                    "Delivery day",
                    "Periods",
                    "Mean actual",
                    "Mean forecast",
                    "MAE",
                    "Bias (F − A)",
                    "Bias %",
                    "Coverage",
                  ].map((heading, index) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`label whitespace-nowrap px-2.5 py-2 ${
                        index > 0 ? "text-right" : ""
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {desk.daily.map((day) => (
                  <tr key={day.delivery_day} className="data-row hover:bg-surface-container/60">
                    <td className="whitespace-nowrap px-2.5 py-[5px] font-medium">
                      {weekdayDay(day.delivery_day)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {day.matched}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right">{mw(day.mean_actual)}</td>
                    <td className="tnum px-2.5 py-[5px] text-right text-primary">
                      {mw(day.mean_forecast)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right">{mw(day.mae)}</td>
                    <td
                      className={`tnum px-2.5 py-[5px] text-right font-medium ${
                        (day.bias ?? 0) > 0 ? "text-error" : "text-secondary"
                      }`}
                    >
                      {signedMw(day.bias)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {signedPct(day.bias_pct, 1)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {pct(day.coverage_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dailySpread?.worstDay && (
            <p className="border-t border-outline-variant px-3 py-1.5 text-[10.5px] text-on-surface-variant">
              Largest bias in window:{" "}
              <strong className="text-on-surface">
                {weekdayDay(dailySpread.worstDay.delivery_day)}
              </strong>{" "}
              at {signedPct(dailySpread.worstDay.bias_pct, 1)}.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
