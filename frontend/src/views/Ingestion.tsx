import { useState } from "react";
import { CheckCircle2, Database, RefreshCw, XCircle } from "lucide-react";
import { Panel, Pill, Spinner } from "../components/primitives";
import { api } from "../lib/api";
import type { IngestionResponse, MetaResponse } from "../lib/types";
import { londonStamp, mw, pct } from "../lib/format";

export function Ingestion({
  ingestion,
  meta,
  onRefreshed,
}: {
  ingestion: IngestionResponse;
  meta: MetaResponse | null;
  onRefreshed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const response = await api.refresh();
      setResult(
        `Pulled ${mw(response.actual_rows)} actual rows and ${mw(
          response.forecast_rows,
        )} forecast rows from Elexon.`,
      );
      onRefreshed();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded bg-primary-container text-on-primary-container">
            <Database size={15} />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold">Elexon BMRS ingestion</h2>
            <p className="text-[11px] text-on-surface-variant">
              Two upstream datasets feed the desk. Every run is idempotent and
              recorded so the warehouse freshness is auditable.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-[6px] text-[11px] font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
        >
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          {busy ? "Pulling from Elexon…" : "Refresh from Elexon"}
        </button>
      </div>

      {busy && <Spinner label="Streaming FUELHH and WINDFOR" />}
      {result && (
        <div className="panel mt-3 border-secondary/30 bg-secondary-container/50 px-3 py-2 text-[11.5px] text-on-secondary-container">
          {result}
        </div>
      )}
      {failure && (
        <div className="panel mt-3 border-error/30 bg-error-container/60 px-3 py-2 text-[11.5px] text-on-error-container">
          {failure}
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {ingestion.sources.map((source) => (
          <div key={source.dataset} className="panel px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="tnum text-[13px] font-semibold">
                {source.dataset}
              </span>
              <Pill tone={source.status === "connected" ? "success" : "danger"} dot>
                {source.status}
              </Pill>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
              {source.description}
            </p>
          </div>
        ))}
        <div className="panel px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Warehouse</span>
            <Pill tone={ingestion.actual_coverage_pct > 99 ? "success" : "warning"} dot>
              {pct(ingestion.actual_coverage_pct)} of window
            </Pill>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
            SQLite, seeded at build time. {mw(ingestion.counts.actuals)} actual
            periods, {mw(ingestion.counts.forecasts)} forecast rows across{" "}
            {mw(ingestion.counts.forecast_publications)} publications.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel
          title="Coverage"
          subtitle="What is actually in the warehouse against what the window expects."
          bodyClassName="p-0"
        >
          <dl className="divide-y divide-outline-variant text-[11.5px]">
            {[
              {
                label: "Actual generation span",
                value: `${londonStamp(ingestion.actual_span.first)} → ${londonStamp(
                  ingestion.actual_span.last,
                )}`,
              },
              {
                label: "Forecast publication span",
                value: `${londonStamp(ingestion.forecast_span.first)} → ${londonStamp(
                  ingestion.forecast_span.last,
                )}`,
              },
              {
                label: "Settlement periods stored",
                value: `${mw(ingestion.counts.actuals)} / ${mw(
                  ingestion.expected_actuals,
                )}`,
              },
              {
                label: "Decision window",
                value: meta
                  ? `${meta.window.from} → ${meta.window.to} (${meta.window.delivery_days} days)`
                  : "—",
              },
              {
                label: "Gate closure rule",
                value: meta?.gate_closure.description ?? "—",
              },
            ].map((entry) => (
              <div
                key={entry.label}
                className="flex items-start justify-between gap-3 px-3 py-[7px]"
              >
                <dt className="text-on-surface-variant">{entry.label}</dt>
                <dd className="tnum text-right font-medium">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          title="Recent WINDFOR publications"
          subtitle="Each publication carries ~73 hourly targets spanning 72 hours."
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-outline-variant">
                  {["Publish time", "Targets", "Covers from", "Covers to"].map(
                    (heading, index) => (
                      <th
                        key={heading}
                        scope="col"
                        className={`label whitespace-nowrap px-2.5 py-2 ${
                          index > 0 ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {ingestion.recent_publications.map((publication) => (
                  <tr key={publication.publish_time} className="data-row">
                    <td className="tnum whitespace-nowrap px-2.5 py-[5px] font-medium">
                      {londonStamp(publication.publish_time)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {publication.periods}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {londonStamp(publication.covers_from)}
                    </td>
                    <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                      {londonStamp(publication.covers_to)}
                    </td>
                  </tr>
                ))}
                {ingestion.recent_publications.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-on-surface-variant">
                      Warehouse is empty. Run a refresh to pull from Elexon.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-3"
        title="Ingestion runs"
        subtitle="Last ten runs, newest first."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-outline-variant">
                {[
                  "Run",
                  "Started",
                  "Finished",
                  "Status",
                  "Actual rows",
                  "Forecast rows",
                  "Message",
                ].map((heading, index) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`label whitespace-nowrap px-2.5 py-2 ${
                      index > 0 && index < 6 ? "text-right" : ""
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingestion.runs.map((run) => (
                <tr key={run.id} className="data-row">
                  <td className="tnum px-2.5 py-[5px] font-medium">#{run.id}</td>
                  <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                    {londonStamp(run.started_at)}
                  </td>
                  <td className="tnum px-2.5 py-[5px] text-right text-on-surface-variant">
                    {londonStamp(run.finished_at)}
                  </td>
                  <td className="px-2.5 py-[5px]">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
                        run.status === "success" ? "text-secondary" : "text-error"
                      }`}
                    >
                      {run.status === "success" ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <XCircle size={11} />
                      )}
                      {run.status}
                    </span>
                  </td>
                  <td className="tnum px-2.5 py-[5px] text-right">
                    {mw(run.actual_rows)}
                  </td>
                  <td className="tnum px-2.5 py-[5px] text-right">
                    {mw(run.forecast_rows)}
                  </td>
                  <td className="max-w-[320px] truncate px-2.5 py-[5px] text-on-surface-variant">
                    {run.message ?? "—"}
                  </td>
                </tr>
              ))}
              {ingestion.runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">
                    No ingestion runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
