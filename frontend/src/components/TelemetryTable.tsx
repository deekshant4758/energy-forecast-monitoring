import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { SeriesPoint } from "../lib/types";
import { hours, mw, signedMw, signedPct, shortDay } from "../lib/format";

const PAGE_SIZE = 120;

function StatusCell({ status }: { status: SeriesPoint["status"] }) {
  const tone =
    status === "CLEARED"
      ? "bg-secondary-container text-on-secondary-container border-secondary/20"
      : status === "NO FORECAST"
        ? "bg-error-container text-on-error-container border-error/20"
        : "bg-surface-container text-on-surface-variant border-outline-variant";
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.05em] ${tone}`}
    >
      {status}
    </span>
  );
}

export function TelemetryTable({
  series,
  granularityMinutes,
}: {
  series: SeriesPoint[];
  granularityMinutes: number;
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return series;
    return series.filter((row) => {
      const haystack = `sp${row.sp} ${row.label} ${row.local_time} ${row.delivery_day} ${row.status}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [series, query]);

  useEffect(() => {
    setPage(0);
  }, [query, series]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter settlement period or time…"
            className="w-[260px] rounded border border-outline-variant bg-surface py-[5px] pl-7 pr-2 text-[11px] text-on-surface placeholder:text-on-surface-faint focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="tnum text-[10.5px] text-on-surface-variant">
            {filtered.length === 0
              ? "no rows"
              : `${current * PAGE_SIZE + 1}–${Math.min(
                  (current + 1) * PAGE_SIZE,
                  filtered.length,
                )} of ${filtered.length}`}
          </span>
          <div className="flex overflow-hidden rounded border border-outline-variant">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={current === 0}
              className="border-r border-outline-variant px-1.5 py-[3px] text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={current >= pageCount - 1}
              className="px-1.5 py-[3px] text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-outline-variant">
              {[
                "SP",
                "Settlement time",
                "Actual gen (MW)",
                "Selected fcst (MW)",
                "Error Δ (MW)",
                "% error",
                "Publish timestamp",
                "Lead (h)",
                "Desk status",
              ].map((heading, index) => (
                <th
                  key={heading}
                  scope="col"
                  className={`label whitespace-nowrap px-2.5 py-2 ${
                    index >= 2 && index <= 7 ? "text-right" : ""
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.start}
                className="data-row text-[11.5px] hover:bg-surface-container/60"
              >
                <td className="tnum px-2.5 py-[5px] font-semibold text-on-surface">
                  SP{String(row.sp).padStart(2, "0")}
                </td>
                <td className="tnum whitespace-nowrap px-2.5 py-[5px] text-on-surface-variant">
                  {shortDay(row.delivery_day)} {row.local_time}
                  <span className="ml-1 text-on-surface-faint">
                    /{granularityMinutes}m
                  </span>
                </td>
                <td className="tnum px-2.5 py-[5px] text-right font-medium">
                  {mw(row.actual)}
                </td>
                <td className="tnum px-2.5 py-[5px] text-right font-medium text-primary">
                  {mw(row.forecast)}
                </td>
                <td
                  className={`tnum px-2.5 py-[5px] text-right font-medium ${
                    row.error === null
                      ? "text-on-surface-faint"
                      : row.error > 0
                        ? "text-error"
                        : "text-secondary"
                  }`}
                >
                  {signedMw(row.error)}
                </td>
                <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                  {row.error_pct === null ? "—" : signedPct(row.error_pct, 1)}
                </td>
                <td className="tnum whitespace-nowrap px-2.5 py-[5px] text-right text-on-surface-variant">
                  {row.publish_label ?? "—"}
                </td>
                <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                  {hours(row.lead_hours)}
                </td>
                <td className="px-2.5 py-[5px]">
                  <StatusCell status={row.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-[12px] text-on-surface-variant"
                >
                  No settlement periods match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
