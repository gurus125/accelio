/**
 * Business-timezone date helpers. Timestamps are STORED in UTC, but every
 * piece of business logic that depends on "today", a date, or an hour
 * (daily caps, business hours, recurring reminders, imported visit dates,
 * day-end reports) must be evaluated in the business's own time zone —
 * never the server's local time (Vercel runs in UTC; a laptop may not).
 *
 * Pure and dependency-free: uses only Intl, so it behaves identically no
 * matter what TZ the process runs in. `npm test` runs the suite under
 * several TZs to prove that.
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";

/** A calendar date with no time zone attached, as "YYYY-MM-DD". */
export type DateKey = string;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** True when `tz` is an IANA zone this runtime understands. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The business's zone, falling back to Asia/Kolkata when unset/invalid. */
export function getBusinessTimeZone(business: { timezone?: string | null } | null | undefined): string {
  const tz = business?.timezone;
  return isValidTimeZone(tz) ? tz : DEFAULT_BUSINESS_TIMEZONE;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of `instant` as seen in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toDateKey(year: number, month: number, day: number): DateKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** The calendar date of `instant` in `timeZone`, e.g. "2026-11-26". */
export function businessDateKey(instant: Date, timeZone: string): DateKey {
  const p = getZonedParts(instant, timeZone);
  return toDateKey(p.year, p.month, p.day);
}

/** Minutes since local midnight of `instant` in `timeZone`. */
export function minutesSinceLocalMidnight(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (IST = +330). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which the wall clock in `timeZone` reads
 * `dateKey` `hh:mm`. Handles DST by re-checking the offset once. */
export function zonedTimeToUtc(dateKey: DateKey, time: string, timeZone: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hh || 0, mm || 0);
  let guess = wallAsUtc - timeZoneOffsetMinutes(new Date(wallAsUtc), timeZone) * 60000;
  const corrected = wallAsUtc - timeZoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** UTC instant of local midnight at the start of `instant`'s business day. */
export function startOfBusinessDay(instant: Date, timeZone: string): Date {
  return zonedTimeToUtc(businessDateKey(instant, timeZone), "00:00", timeZone);
}

/** Pure calendar arithmetic on a DateKey (no time zone involved). */
export function addDaysToDateKey(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenDateKeys(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** Days in a month (month 1-12), pure calendar math. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
