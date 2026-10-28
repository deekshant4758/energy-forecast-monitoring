import { useEffect, useState } from "react";
import { Activity, Radio } from "lucide-react";
import { Pill } from "./primitives";
import {
  countdown,
  londonTimeNow,
  londonZoneAbbreviation,
  nextGateClosure,
} from "../lib/format";
import type { MetaResponse } from "../lib/types";

export function TopBar({ meta }: { meta: MetaResponse | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const gate = nextGateClosure(now);
  const connected = (meta?.coverage.periods_with_actual ?? 0) > 0;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-outline-variant bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-white">
          <Activity size={17} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-[14px] font-semibold tracking-tight">
            Wind Forecast Desk
          </h1>
          <p className="truncate text-[10.5px] text-on-surface-variant">
            National wind generation · Day-ahead decision support
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <Pill tone={connected ? "success" : "danger"} dot>
          BMRS feed {connected ? "operational" : "empty"}
        </Pill>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden text-right leading-tight sm:block">
          <div className="label">London</div>
          <div className="tnum text-[12px] font-semibold">
            {londonTimeNow(now)}{" "}
            <span className="font-normal text-on-surface-faint">
              {londonZoneAbbreviation(now)}
            </span>
          </div>
        </div>
        <div className="h-8 w-px bg-outline-variant" />
        <div className="text-right leading-tight">
          <div className="label">Gate closure</div>
          <div className="tnum text-[12px] font-semibold text-primary">
            {countdown(gate.at, now)}
          </div>
        </div>
        <span
          className="hidden h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant sm:flex"
          title="Elexon BMRS HTTP feed"
        >
          <Radio size={15} />
        </span>
      </div>
    </header>
  );
}
