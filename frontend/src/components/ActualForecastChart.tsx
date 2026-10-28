import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "../lib/types";
import { mw, signedMw, signedPct } from "../lib/format";

interface ChartPoint {
  index: number;
  start: string;
  label: string;
  actual: number | null;
  forecast: number | null;
  publish: string | null;
  lead: number | null;
  error: number | null;
  errorPct: number | null;
  status: string;
}

function tickLabel(iso: string, multiDay: boolean): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(date);
  return multiDay ? `${day} ${time}` : time;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="panel min-w-[210px] px-2.5 py-2 text-[11px] shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="font-semibold text-on-surface">{point.label}</span>
        <span className="text-[10px] uppercase tracking-wide text-on-surface-faint">
          {point.status}
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt className="text-on-surface-variant">Actual</dt>
        <dd className="tnum text-right font-semibold text-on-surface">
          {mw(point.actual)} MW
        </dd>
        <dt className="text-on-surface-variant">Selected forecast</dt>
        <dd className="tnum text-right font-semibold text-primary">
          {mw(point.forecast)} MW
        </dd>
        <dt className="text-on-surface-variant">Error (F − A)</dt>
        <dd className="tnum text-right">
          {signedMw(point.error)} MW{" "}
          <span className="text-on-surface-faint">
            {signedPct(point.errorPct)}
          </span>
        </dd>
        <dt className="text-on-surface-variant">Published</dt>
        <dd className="tnum text-right">
          {point.publish ? point.publish : "no eligible forecast"}
        </dd>
        <dt className="text-on-surface-variant">Lead time</dt>
        <dd className="tnum text-right">
          {point.lead === null ? "—" : `${point.lead.toFixed(1)}h`}
        </dd>
      </dl>
    </div>
  );
}

export function ActualForecastChart({ series }: { series: SeriesPoint[] }) {
  const multiDay = useMemo(() => {
    const days = new Set(series.map((point) => point.delivery_day));
    return days.size > 1;
  }, [series]);

  const data = useMemo<ChartPoint[]>(
    () =>
      series.map((point, index) => ({
        index,
        start: point.start,
        label: point.label,
        actual: point.actual,
        forecast: point.forecast,
        publish: point.publish_label,
        lead: point.lead_hours,
        error: point.error,
        errorPct: point.error_pct,
        status:
          point.status === "CLEARED"
            ? `SP${String(point.sp).padStart(2, "0")}`
            : point.status,
      })),
    [series],
  );

  // Shade contiguous runs with no eligible forecast so the desk can see where
  // it would have been flying blind.
  const gaps = useMemo(() => {
    const ranges: { from: number; to: number }[] = [];
    let start: number | null = null;
    data.forEach((point, index) => {
      if (point.forecast === null) {
        if (start === null) start = index;
      } else if (start !== null) {
        ranges.push({ from: start, to: index - 1 });
        start = null;
      }
    });
    if (start !== null) ranges.push({ from: start, to: data.length - 1 });
    return ranges;
  }, [data]);

  const tickCount = Math.min(9, Math.max(4, Math.floor(data.length / 8)));

  return (
    <div className="h-[336px] w-full px-1 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 14, bottom: 4, left: 4 }}
        >
          <defs>
            <linearGradient id="actual-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="2 3" />

          {gaps.map((gap) => (
            <ReferenceArea
              key={`gap-${gap.from}`}
              x1={gap.from}
              x2={gap.to}
              fill="#b91c1c"
              fillOpacity={0.06}
              stroke="none"
            />
          ))}

          <XAxis
            dataKey="start"
            tickFormatter={(value: string) => tickLabel(value, multiDay)}
            minTickGap={42}
            tickCount={tickCount}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            tick={{ fontSize: 10, fill: "#64748b" }}
            height={26}
          />
          <YAxis
            width={62}
            tickFormatter={(value: number) => mw(value)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#64748b" }}
            domain={[0, "auto"]}
            label={{
              value: "MW",
              angle: -90,
              position: "insideLeft",
              offset: 14,
              style: { fontSize: 10, fill: "#94a3b8", letterSpacing: "0.08em" },
            }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />

          <Area
            type="monotone"
            dataKey="actual"
            stroke="none"
            fill="url(#actual-fill)"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual generation"
            stroke="#0f172a"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Selected forecast"
            stroke="#1d4ed8"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ horizon }: { horizon: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1 pl-3">
      <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-on-surface-variant">
        <span className="h-[2px] w-5 bg-on-surface" />
        Actual generation (MW)
      </span>
      <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-on-surface-variant">
        <span className="h-[2px] w-5 bg-primary" />
        Selected forecast (≥ {horizon}h lead)
      </span>
      <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-on-surface-variant">
        <span className="h-2.5 w-3 rounded-sm bg-error/15" />
        Unusable period gaps
      </span>
    </div>
  );
}
