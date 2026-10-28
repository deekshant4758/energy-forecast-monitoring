import { CalendarRange, Info } from "lucide-react";
import { Pill, Segmented } from "./primitives";
import type { HorizonStat } from "../lib/types";
import { pct } from "../lib/format";

export interface WindowRange {
  from: string;
  to: string;
}

export const WINDOW_PRESETS: {
  key: string;
  label: string;
  from: string;
  to: string;
}[] = [
  { key: "w1", label: "Jan 1–7", from: "2026-01-01", to: "2026-01-07" },
  { key: "w2", label: "Jan 8–14", from: "2026-01-08", to: "2026-01-14" },
  { key: "w3", label: "Jan 15–21", from: "2026-01-15", to: "2026-01-21" },
  { key: "w4", label: "Jan 22–31", from: "2026-01-22", to: "2026-01-31" },
  { key: "all", label: "Full month", from: "2026-01-01", to: "2026-01-31" },
];

export function WindowControls({
  range,
  onChange,
  minDate,
  maxDate,
}: {
  range: WindowRange;
  onChange: (range: WindowRange) => void;
  minDate: string;
  maxDate: string;
}) {
  const activePreset = WINDOW_PRESETS.find(
    (preset) => preset.from === range.from && preset.to === range.to,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Jan 2026</span>
        <div className="flex flex-wrap gap-1">
          {WINDOW_PRESETS.map((preset) => {
            const active = activePreset?.key === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ from: preset.from, to: preset.to })}
                className={`rounded border px-2 py-[4px] text-[10px] font-semibold uppercase tracking-[0.05em] transition-colors ${
                  active
                    ? "border-primary bg-primary-container text-on-primary-container"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {preset.label}
                {preset.key === "w1" && (
                  <span
                    className={
                      active ? "ml-1 text-primary" : "ml-1 text-on-surface-faint"
                    }
                  >
                    default
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <CalendarRange size={13} className="text-on-surface-faint" />
        <span className="label">Range</span>
        <input
          type="date"
          aria-label="Window start"
          value={range.from}
          min={minDate}
          max={range.to}
          onChange={(event) =>
            onChange({ ...range, from: event.target.value || range.from })
          }
          className="tnum rounded border border-outline-variant bg-surface px-1.5 py-[3px] text-[11px] focus:border-primary focus:outline-none"
        />
        <span className="text-on-surface-faint">→</span>
        <input
          type="date"
          aria-label="Window end"
          value={range.to}
          min={range.from}
          max={maxDate}
          onChange={(event) =>
            onChange({ ...range, to: event.target.value || range.to })
          }
          className="tnum rounded border border-outline-variant bg-surface px-1.5 py-[3px] text-[11px] focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}

export function HorizonControls({
  horizon,
  horizons,
  onChange,
  options,
}: {
  horizon: number;
  horizons: HorizonStat[];
  onChange: (horizon: number) => void;
  options: number[];
}) {
  const selected = horizons.find((entry) => entry.horizon === horizon);
  // Below the day-ahead lead time the gate-closure rule binds first, so a
  // shorter horizon cannot change which publication is used.
  const nonBinding =
    selected?.mean_lead_hours !== null &&
    selected?.mean_lead_hours !== undefined &&
    selected.mean_lead_hours > horizon + 0.5;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline-variant bg-surface-container/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="label">Target forecast horizon</span>
        <Segmented
          ariaLabel="Target forecast horizon in hours"
          value={horizon}
          onChange={onChange}
          options={options.map((value) => ({
            value,
            label: `${value}h`,
            title: `Require forecasts published at least ${value} hours before delivery`,
          }))}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Pill tone={nonBinding ? "success" : "warning"} dot>
          {nonBinding ? "DA validated" : "Binding constraint"}
        </Pill>
        <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-on-surface-variant">
          <Info size={11} className="shrink-0 text-on-surface-faint" />
          <span>
            Eligible if published before day-ahead gate closure and at least{" "}
            {horizon}h before the settlement period.
            {selected && (
              <>
                {" "}
                Realised mean lead{" "}
                <strong className="tnum font-semibold text-on-surface">
                  {selected.mean_lead_hours?.toFixed(1) ?? "—"}h
                </strong>{" "}
                · coverage{" "}
                <strong className="tnum font-semibold text-on-surface">
                  {pct(selected.coverage_pct)}
                </strong>
                {nonBinding &&
                  " · gate closure binds first, so this matches shorter horizons."}
              </>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}
