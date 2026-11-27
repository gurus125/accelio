/**
 * Date-range resolution for /analytics and the dashboard summary. Kept
 * framework-free (no Next.js request types) so it's easy to unit test.
 *
 * Timestamp convention (Phase 11 spec section 28): every timestamp is
 * stored in UTC, with an EXCLUSIVE upper bound everywhere ("start
 * inclusive, end exclusive"), which avoids off-by-one errors on day/month
 * boundaries.
 *
 * Milestone 1: range boundaries are the business's LOCAL calendar days
 * (its `timezone`, default Asia/Kolkata) — "last 7 days" starts at local
 * midnight, not UTC midnight (which is 5:30am in India).
 */

import {
  DEFAULT_BUSINESS_TIMEZONE,
  addDaysToDateKey,
  businessDateKey,
  daysBetweenDateKeys,
  daysInMonth,
  zonedTimeToUtc,
  type DateKey,
} from "@/lib/dates";

export type AnalyticsRangeKey = "7d" | "30d" | "90d" | "custom";

export interface AnalyticsDateRange {
  key: AnalyticsRangeKey;
  /** Inclusive start of the range, UTC ISO timestamp. */
  startIso: string;
  /** EXCLUSIVE end of the range, UTC ISO timestamp. */
  endIso: string;
  /** Trend chart bucket size for this range (Phase 11 section 22: daily
   * for 7/30-day ranges, weekly once a range gets long enough that daily
   * bars would be unreadable). */
  bucket: "day" | "week";
  /** The business time zone the calendar days are in. */
  timeZone: string;
}

function isDateKeyParam(value: string | undefined | null): value is DateKey {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function resolveAnalyticsDateRange(
  params: {
    range?: string | null;
    from?: string | null;
    to?: string | null;
  },
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
  now: Date = new Date()
): AnalyticsDateRange {
  const todayKey = businessDateKey(now, timeZone);
  const localMidnight = (key: DateKey) => zonedTimeToUtc(key, "00:00", timeZone).toISOString();

  if (params.range === "custom") {
    const from = params.from;
    const to = params.to;
    if (isDateKeyParam(from) && isDateKeyParam(to) && from <= to) {
      const spanDays = daysBetweenDateKeys(from, to) + 1;
      return {
        key: "custom",
        startIso: localMidnight(from),
        endIso: localMidnight(addDaysToDateKey(to, 1)),
        bucket: spanDays > 45 ? "week" : "day",
        timeZone,
      };
    }
    // Invalid/incomplete custom range (missing "from"/"to", or "to" before
    // "from") — fall through to the default 30-day range below rather than
    // run a query with a broken boundary.
  }

  const days = params.range === "7d" ? 7 : params.range === "90d" ? 90 : 30;
  const key: AnalyticsRangeKey = params.range === "7d" ? "7d" : params.range === "90d" ? "90d" : "30d";

  return {
    key,
    startIso: localMidnight(addDaysToDateKey(todayKey, 1 - days)),
    endIso: localMidnight(addDaysToDateKey(todayKey, 1)),
    bucket: days > 45 ? "week" : "day",
    timeZone,
  };
}

export const ANALYTICS_RANGE_OPTIONS: { key: AnalyticsRangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
];
