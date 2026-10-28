import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Info } from "lucide-react";
import { Panel, Pill } from "../components/primitives";
import {
  HorizonControls,
  WindowControls,
  type WindowRange,
} from "../components/DeskControls";
import type { AccuracyResponse, MetaResponse } from "../lib/types";
import {
  hours,
  mw,
  pct,
  signedMw,
  signedPct,
  weekdayDay,
} from "../lib/format";

/** Red for over-forecast (short risk), green for under-forecast (surplus). */
function heatStyle(value: number | null, ceiling: number) {
  if (value === null || Number.isNaN(value)) {
    return { backgroundColor: "#f8fafc", color: "#94a3b8" };
  }
  const intensity = Math.min(1, Math.abs(value) / (ceiling || 1));
  const alpha = 0.1 + intensity * 0.72;
  const rgb = value > 0 ? "185, 28, 28" : "4, 120, 87";
  return {
    backgroundColor: `rgba(${rgb}, ${alpha.toFixed(3)})`,
    color: intensity > 0.55 ? "#ffffff" : "#0f172a",
  };
}

export function Accuracy({
  accuracy,
  meta,
  range,
  horizon,
  onRange,
  onHorizon,
}: {
  accuracy: AccuracyResponse;
  meta: MetaResponse | null;
  range: WindowRange;
  horizon: number;
  onRange: (range: WindowRange) => void;
  onHorizon: (horizon: number) => void;
}) {
  const { matrix, selected } = accuracy;

  const ceiling = useMemo(() => {
    const values = matrix
      .flatMap((row) => row.cells.map((cell) => Math.abs(cell.bias_pct ?? 0)))
      .filter((value) => value > 0);
    return values.length ? Math.max(...values) : 1;
  }, [matrix]);

  const days = matrix[0]?.cells.map((cell) => cell.delivery_day) ?? [];

  const diurnal = useMemo(
    () =>
      accuracy.by_settlement_period.map((entry) => ({
        label: String(entry.sp).padStart(2, "0"),
        mae: entry.mae ?? 0,
        bias: entry.bias ?? 0,
      })),
    [accuracy.by_settlement_period],
  );

  const distribution = useMemo(
    () =>
      accuracy.distribution.map((bin) => ({
        label: `${Math.round(bin.from)}…${Math.round(bin.to)}`,
        midpoint: (bin.from + bin.to) / 2,
        count: bin.count,
        share: bin.share,
      })),
    [accuracy.distribution],
  );

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
          horizons={accuracy.horizons}
          onChange={onHorizon}
          options={meta?.horizons ?? [0, 4, 12, 24, 36, 48]}
        />
      </div>

      <div className="p-3">
        <div className="panel grid grid-cols-2 divide-outline-variant md:grid-cols-4 [&>div]:border-b [&>div]:border-outline-variant md:[&>div]:border-b-0">
          <div className="px-3 py-2.5">
            <div className="label">Selected horizon</div>
            <div className="tnum text-[21px] font-semibold leading-none">
              {accuracy.horizon}h
            </div>
            <div className="mt-1 text-[10px] text-on-surface-variant">
              Realised lead {hours(selected.mean_lead_hours)} · coverage{" "}
              {pct(selected.coverage_pct)}
            </div>
          </div>
          <div className="border-l border-outline-variant px-3 py-2.5">
            <div className="label">MAE</div>
            <div className="tnum text-[21px] font-semibold leading-none">
              {mw(selected.mae)}{" "}
              <span className="text-[10px] font-normal text-on-surface-faint">MW</span>
            </div>
            <div className="mt-1 text-[10px] text-on-surface-variant">
              {mw(selected.mae_centred)} MW once de-biased
            </div>
          </div>
          <div className="border-l border-outline-variant px-3 py-2.5">
            <div className="label">Bias (F − A)</div>
            <div
              className={`tnum text-[21px] font-semibold leading-none ${
                (selected.bias ?? 0) > 0 ? "text-error" : "text-secondary"
              }`}
            >
              {signedMw(selected.bias)}{" "}
              <span className="text-[10px] font-normal text-on-surface-faint">MW</span>
            </div>
            <div className="mt-1 text-[10px] text-on-surface-variant">
              {signedPct(selected.bias_pct, 2)} of mean actual
            </div>
          </div>
          <div className="border-l border-outline-variant px-3 py-2.5">
            <div className="label">Wind at risk (P90)</div>
            <div className="tnum text-[21px] font-semibold leading-none text-tertiary">
              {mw(selected.p90_shortfall)}{" "}
              <span className="text-[10px] font-normal text-on-surface-faint">MW</span>
            </div>
            <div className="mt-1 text-[10px] text-on-surface-variant">
              Shortfall at the 90th percentile
            </div>
          </div>
        </div>

        <Panel
          className="mt-3"
          title="Horizon ladder"
          subtitle="What an extra hour of lead time costs, and where coverage stops being available."
          actions={<Pill tone="primary">Same window</Pill>}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-outline-variant">
                  {[
                    "Horizon",
                    "Matched",
                    "Coverage",
                    "Mean lead",
                    "MAE",
                    "Centred MAE",
                    "RMSE",
                    "Bias",
                    "Bias %",
                    "P90 shortfall",
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
                {accuracy.horizons.map((row) => {
                  const active = row.horizon === horizon;
                  return (
                    <tr
                      key={row.horizon}
                      className={`data-row ${
                        active ? "bg-primary-container/40" : "hover:bg-surface-container/60"
                      }`}
                    >
                      <td className="whitespace-nowrap px-2.5 py-[6px] font-semibold">
                        {active && <span className="mr-1 text-primary">▸</span>}
                        {row.horizon}h
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right text-on-surface-variant">
                        {row.matched}/{row.periods}
                      </td>
                      <td
                        className={`tnum px-2.5 py-[6px] text-right ${
                          row.coverage_pct < 90 ? "text-tertiary" : ""
                        }`}
                      >
                        {pct(row.coverage_pct)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right text-on-surface-variant">
                        {hours(row.mean_lead_hours)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right font-medium">
                        {mw(row.mae)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right text-on-surface-variant">
                        {mw(row.mae_centred)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right text-on-surface-variant">
                        {mw(row.rmse)}
                      </td>
                      <td
                        className={`tnum px-2.5 py-[6px] text-right font-medium ${
                          (row.bias ?? 0) > 0 ? "text-error" : "text-secondary"
                        }`}
                      >
                        {signedMw(row.bias)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right text-on-surface-variant">
                        {signedPct(row.bias_pct, 1)}
                      </td>
                      <td className="tnum px-2.5 py-[6px] text-right">
                        {mw(row.p90_shortfall)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="mt-3"
          title="Error analysis matrix"
          subtitle="Signed bias % by forecast horizon against delivery day. Red is over-forecast (short risk), green is under-forecast."
          actions={<Pill tone={ceiling > 10 ? "danger" : "warning"} dot>{ceiling.toFixed(0)}% peak</Pill>}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto p-2">
            <table className="w-full border-separate border-spacing-[2px] text-[11px]">
              <thead>
                <tr>
                  <th className="label sticky left-0 z-10 bg-surface px-1.5 py-1 text-left">
                    Horizon
                  </th>
                  {days.map((day) => (
                    <th key={day} className="label px-1 py-1 text-center">
                      {day.slice(8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.horizon}>
                    <th
                      className={`sticky left-0 z-10 bg-surface px-1.5 py-1 text-left text-[10.5px] font-semibold ${
                        row.horizon === horizon ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {row.horizon}h
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.horizon}-${cell.delivery_day}`}
                        className="tnum rounded px-1 py-[5px] text-center"
                        style={heatStyle(cell.bias_pct, ceiling)}
                        title={`${weekdayDay(cell.delivery_day)} · ${row.horizon}h · bias ${signedMw(cell.bias)} MW (${signedPct(cell.bias_pct, 1)}) · MAE ${mw(cell.mae)} MW · coverage ${pct(cell.coverage_pct)}`}
                      >
                        {cell.bias_pct === null ? "—" : cell.bias_pct.toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-outline-variant px-3 py-1.5 text-[10.5px] text-on-surface-variant">
            Cell values are bias as a percentage of mean actual generation. Hover
            for MAE and coverage per cell.
          </p>
        </Panel>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Panel
            title="Diurnal error profile"
            subtitle="MAE and mean bias by settlement period across the window."
            bodyClassName="px-1 pb-2 pt-3"
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={diurnal} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="2 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} interval={3} height={22} />
                  <YAxis
                    width={54}
                    tickFormatter={(value: number) => mw(value)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      border: "1px solid #e2e8f0",
                      borderRadius: 4,
                    }}
                    formatter={(value: number, name: string) => [
                      `${mw(value)} MW`,
                      name === "mae" ? "MAE" : "Bias (F − A)",
                    ]}
                    labelFormatter={(label: string) => `SP${label}`}
                  />
                  <Bar
                    dataKey="mae"
                    fill="#cbd5e1"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bias"
                    stroke="#b45309"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="px-3 pt-1 text-[10px] text-on-surface-variant">
              Grey bars: MAE by SP. Amber line: signed bias by SP.
            </p>
          </Panel>

          <Panel
            title="Error distribution"
            subtitle="Count of settlement periods by signed forecast error (MW)."
            bodyClassName="px-1 pb-2 pt-3"
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="2 3" />
                  <XAxis
                    dataKey="label"
                    tick={false}
                    tickLine={false}
                    axisLine={{ stroke: "#cbd5e1" }}
                    height={18}
                  />
                  <YAxis
                    width={40}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      border: "1px solid #e2e8f0",
                      borderRadius: 4,
                    }}
                    formatter={(value: number) => [`${value} periods`, "Count"]}
                    labelFormatter={(label: string) => `${label} MW`}
                  />
                  <Bar
                    dataKey="count"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  >
                    {distribution.map((bin) => (
                      <Cell
                        key={bin.label}
                        fill={bin.midpoint > 0 ? "#e11d48" : "#2563eb"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="px-3 pt-1 text-[10px] text-on-surface-variant">
              Blue: wind delivered more than forecast. Red: wind delivered less.
            </p>
          </Panel>
        </div>

        <Panel
          className="mt-3"
          title="Bias by generation level"
          subtitle="If error were random the ratio would be flat. A falling ratio points at a boundary difference between the two datasets."
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-outline-variant">
                  {[
                    "Forecast band (MW)",
                    "Periods",
                    "Mean forecast",
                    "Mean actual",
                    "Bias",
                    "Bias %",
                    "Actual / forecast",
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
                {accuracy.bias_by_level.map((row) => (
                  <tr key={row.from} className="data-row hover:bg-surface-container/60">
                    <td className="tnum whitespace-nowrap px-2.5 py-[5px]">
                      {mw(row.from)} – {mw(row.to)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {row.periods}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-primary">
                      {mw(row.mean_forecast)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right">
                      {mw(row.mean_actual)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right font-medium text-error">
                      {signedMw(row.bias)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {signedPct(row.bias_pct, 1)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right">
                      {row.actual_to_forecast_ratio?.toFixed(3) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="mt-3"
          title="Method notes"
          subtitle="Read these before acting on the numbers."
          bodyClassName="divide-y divide-outline-variant"
        >
          {accuracy.notes.map((note) => (
            <div key={note.title} className="flex gap-2.5 px-3 py-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                  note.severity === "warning"
                    ? "bg-tertiary-container text-on-tertiary-container"
                    : "bg-primary-container text-on-primary-container"
                }`}
              >
                {note.severity === "warning" ? (
                  <AlertTriangle size={12} />
                ) : (
                  <Info size={12} />
                )}
              </span>
              <div>
                <p className="text-[12px] font-semibold text-on-surface">
                  {note.title}
                </p>
                <p className="text-[11px] leading-relaxed text-on-surface-variant">
                  {note.body}
                </p>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
