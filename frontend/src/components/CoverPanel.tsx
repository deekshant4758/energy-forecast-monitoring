import { ShieldAlert } from "lucide-react";
import type { CoverGuidance } from "../lib/types";
import { mw, signedMw } from "../lib/format";

/**
 * The desk buys thermal power to cover whatever wind does not deliver. This
 * strip turns the realised shortfall distribution into a cover number: hold
 * enough thermal capacity that nine delivery days in ten are covered.
 *
 * Shortfall convention throughout is `forecast - actual`, so a positive number
 * means wind under-delivered against what the desk planned with.
 */
export function CoverPanel({ cover }: { cover: CoverGuidance }) {
  const band = cover.band;
  const worst = Math.max(
    Math.abs(band.p05 ?? 0),
    Math.abs(band.p95 ?? 0),
    Math.abs(band.p90 ?? 0),
    1,
  );
  const position = (value: number | null) =>
    value === null ? 50 : 50 + (value / worst) * 45;

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded bg-tertiary-container text-on-tertiary-container">
            <ShieldAlert size={14} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-on-surface">
              Thermal cover implied by forecast error
            </p>
            <p className="text-[10.5px] text-on-surface-variant">
              Realised shortfall (forecast − actual) over the selected window.
              Hold this much non-wind capacity above the plan to be covered nine
              days in ten.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <div className="text-right">
            <div className="label">Median shortfall</div>
            <div className="tnum text-[16px] font-semibold">
              {signedMw(cover.p50_shortfall)}{" "}
              <span className="text-[10px] font-normal text-on-surface-faint">
                MW
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="label">Wind at risk (P90)</div>
            <div className="tnum text-[16px] font-semibold text-tertiary">
              {mw(cover.p90_shortfall)}{" "}
              <span className="text-[10px] font-normal text-on-surface-faint">
                MW
              </span>
            </div>
          </div>
          <div className="rounded border border-tertiary/25 bg-tertiary-container px-2.5 py-1 text-right">
            <div className="label text-on-tertiary-container">
              Recommended cover
            </div>
            <div className="tnum text-[16px] font-semibold text-on-tertiary-container">
              {mw(cover.recommended_cover_mw)}{" "}
              <span className="text-[10px] font-normal">MW</span>
            </div>
          </div>
        </div>
      </div>

      {/* Distribution ribbon: p05 .. p95 of the realised shortfall. */}
      <div className="mt-3">
        <div className="relative h-8 rounded bg-surface-container">
          <div className="absolute inset-y-0 left-1/2 w-px bg-outline" />
          {[
            { key: "p05", label: "P05", tone: "bg-secondary/50" },
            { key: "p10", label: "P10", tone: "bg-secondary/40" },
            { key: "p50", label: "P50", tone: "bg-primary" },
            { key: "p90", label: "P90", tone: "bg-tertiary" },
            { key: "p95", label: "P95", tone: "bg-error" },
          ].map((marker) => {
            const value = band[marker.key as keyof typeof band];
            if (value === null || value === undefined) return null;
            return (
              <div
                key={marker.key}
                className="absolute top-0 flex h-full flex-col items-center justify-center"
                style={{ left: `${position(value)}%`, transform: "translateX(-50%)" }}
                title={`${marker.label}: ${signedMw(value)} MW`}
              >
                <span className={`h-3 w-[2px] ${marker.tone}`} />
                <span className="tnum text-[8.5px] text-on-surface-variant">
                  {marker.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[9.5px] text-on-surface-faint">
          <span>Wind delivers above forecast</span>
          <span className="text-on-surface-variant">0</span>
          <span>Wind delivers below forecast — desk is short</span>
        </div>
      </div>
    </div>
  );
}
