/**
 * Date-range resolution for /analytics and the dashboard summary. Kept
 * framework-free (no Next.js request types) so it's easy to unit test.
 *
 * Timestamp convention (Phase 11 spec section 28): the app already stores
 * every timestamp in UTC (Postgres `timestamptz`, see Phase 4's schema
 * comment). This module follows the same convention rather than inventing
 * a new one — all range boundaries are computed in UTC calendar days, with
 * an EXCLUSIVE upper bound everywhere. Using "start inclusive, end
 * exclusive" consistently (instead of mixing <= and < in different places)
 * is what avoids the classic off-by-one on month/day boundaries the spec
 * warns about.
 *
 * Known limitation: the app doesn't yet store a per-business timezone
 * (only `city`, which isn't a reliable timezone source) — see the Phase 11
 * report. Until one exists, "last 7/30/90 days" means UTC calendar days,
 * not the business owner's local calendar days. For a business in India
 * this can shift the reported boundary by up to 5.5 hours.
 */

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
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Parses a "YYYY-MM-DD" query param as a UTC calendar day. Returns null
 * for anything malformed — callers fall back to the default range rather
 * than run a query against an invalid boundary. */
function parseUtcDateParam(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveAnalyticsDateRange(params: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): AnalyticsDateRange {
  const now = new Date();
  const todayEndExclusive = new Date(startOfUtcDay(now).getTime() + DAY_MS);

  if (params.range === "custom") {
    const from = parseUtcDateParam(params.from);
    const to = parseUtcDateParam(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const startIso = startOfUtcDay(from).toISOString();
      const endExclusive = new Date(startOfUtcDay(to).getTime() + DAY_MS);
      const spanDays = Math.round((endExclusive.getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
      return {
        key: "custom",
        startIso,
        endIso: endExclusive.toISOString(),
        bucket: spanDays > 45 ? "week" : "day",
      };
    }
    // Invalid/incomplete custom range (missing "from"/"to", or "to" before
    // "from") — fall through to the default 30-day range below rather than
    // run a query with a broken boundary.
  }

  const days = params.range === "7d" ? 7 : params.range === "90d" ? 90 : 30;
  const key: AnalyticsRangeKey = params.range === "7d" ? "7d" : params.range === "90d" ? "90d" : "30d";
  const startIso = new Date(todayEndExclusive.getTime() - days * DAY_MS).toISOString();

  return {
    key,
    startIso,
    endIso: todayEndExclusive.toISOString(),
    bucket: days > 45 ? "week" : "day",
  };
}

export const ANALYTICS_RANGE_OPTIONS: { key: AnalyticsRangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
];
