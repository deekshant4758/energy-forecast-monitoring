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
 *
 * The wall clock is converted through the London offset rather than by adding
 * 24 hours to `now`, because adding a day keeps the same London clock time and
 * would never move past a 12:00 that has already gone.
 */
const LONDON_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function londonParts(date: Date) {
  const parts = LONDON_PARTS.formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
}

/** Milliseconds London wall clock is ahead of UTC at a given instant. */
function londonOffsetMs(date: Date): number {
  const parts = londonParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/** The instant whose London wall clock reads 12:00 on the given calendar day. */
function gateClosureFor(year: number, month: number, day: number): Date {
  const noonAsUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  // Offset at the candidate instant, then correct once for a DST boundary.
  const firstGuess = new Date(noonAsUtc - londonOffsetMs(new Date(noonAsUtc)));
  return new Date(noonAsUtc - londonOffsetMs(firstGuess));
}

export function nextGateClosure(now: Date): { at: Date; label: string } {
  const today = londonParts(now);
  let at = gateClosureFor(today.year, today.month, today.day);
  if (at.getTime() <= now.getTime()) {
    // Advance one calendar day in UTC arithmetic, then re-read the calendar.
    const tomorrow = new Date(
      Date.UTC(today.year, today.month - 1, today.day + 1),
    );
    at = gateClosureFor(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
    );
  }
  return { at, label: `12:00 ${londonZoneAbbreviation(at)}` };
}

export function countdown(target: Date, now: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
