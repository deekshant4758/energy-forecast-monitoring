import {
  Database,
  GaugeCircle,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { mw, pct } from "../lib/format";
import type { IngestionResponse, MetaResponse } from "../lib/types";

export type ViewKey = "desk" | "accuracy" | "ingestion";

const NAV: {
  section: string;
  items: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    section: "Decision support",
    items: [
      { key: "desk", label: "Desk overview", icon: LayoutDashboard },
      { key: "accuracy", label: "Forecast accuracy", icon: ShieldCheck },
    ],
  },
  {
    section: "Pipeline",
    items: [{ key: "ingestion", label: "Data ingestion", icon: Database }],
  },
];

export function Sidebar({
  view,
  onSelect,
  meta,
  ingestion,
}: {
  view: ViewKey;
  onSelect: (view: ViewKey) => void;
  meta: MetaResponse | null;
  ingestion: IngestionResponse | null;
}) {
  const coverage = ingestion?.actual_coverage_pct;

  return (
    <aside className="hidden w-[218px] shrink-0 flex-col justify-between border-r border-outline-variant bg-surface md:flex">
      <nav className="flex flex-col gap-5 px-2.5 py-3">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="label px-2 pb-1.5">{group.section}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.key === view;
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.key)}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded border-l-2 px-2 py-[7px] text-left text-[12.5px] transition-colors ${
                        active
                          ? "border-primary bg-primary-container font-semibold text-on-primary-container"
                          : "border-transparent text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <Icon size={15} strokeWidth={2} />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-outline-variant px-3 py-2.5">
        <div className="flex items-center justify-between py-0.5">
          <span className="label">Actual periods</span>
          <span className="tnum text-[11px] font-semibold">
            {mw(meta?.coverage.periods_with_actual ?? null)}
          </span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="label">Coverage</span>
          <span className="tnum text-[11px] font-semibold text-secondary">
            {pct(coverage)}
          </span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="label">Publications</span>
          <span className="tnum text-[11px] font-semibold">
            {mw(ingestion?.counts.forecast_publications ?? null)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-on-surface-faint">
          <GaugeCircle size={12} />
          <span>
            Decision window {meta?.window.from.slice(0, 7) ?? "2026-01"} · DA
          </span>
        </div>
      </div>
    </aside>
  );
}
