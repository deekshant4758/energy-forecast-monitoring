/** Presentation helpers. Missing analytics values render as an em dash. */

export const DASH = "—";

export function mw(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signedMw(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  return `${value.toFixed(digits)}%`;
}

export function signedPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function hours(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  return `${value.toFixed(digits)}h`;
}

/** 2026-01-07 -> 07 Jan */
export function shortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** 2026-01-07 -> Thu 08 Jan (weekday helps read a trading week at a glance) */
export function weekdayDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** ISO instant -> "07/01 14:30" in London time. */
export function londonStamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  })
    .format(new Date(iso))
    .replace(",", "");
}

export function londonTimeNow(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(now);
}

export function londonZoneAbbreviation(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).formatToParts(now);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
}

/**
 * Next day-ahead gate closure: 12:00 Europe/London, today if it is still
 * ahead, otherwise tomorrow.
 */
export function nextGateClosure(now: Date): { at: Date; label: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  for (let offset = 0; offset < 2; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    // Work out the instant whose London wall clock reads 12:00.
    const deltaMinutes = 12 * 60 - (hour * 60 + minute);
    if (deltaMinutes > 0) {
      return {
        at: new Date(now.getTime() + deltaMinutes * 60 * 1000),
        label: `12:00 ${londonZoneAbbreviation(now)}`,
      };
    }
  }
  return { at: new Date(now.getTime() + 12 * 60 * 60 * 1000), label: "12:00" };
}

export function countdown(target: Date, now: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `-${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
