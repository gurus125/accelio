/**
 * Simple time-series for the /analytics "Trends" section (Phase 11
 * section 22) — messages sent, replies, and returns, bucketed by day for
 * short ranges and by week once a range is long enough that daily bars
 * stop being readable (see `date-range.ts`'s `bucket` field). No charting
 * library dependency — the page renders these as plain inline-SVG bars.
 */

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/paginate";
import type { AnalyticsDateRange } from "./date-range";
import { getReactivationSummary } from "./reactivation-query";
import { addDaysToDateKey, businessDateKey, parseDateKey } from "@/lib/dates";

export interface TrendPoint {
  /** Local day (bucket=day) or local Monday-of-week (bucket=week) in the
   * business time zone, "YYYY-MM-DD". */
  bucketStart: string;
  value: number;
}

export interface AnalyticsTrends {
  messagesSent: TrendPoint[];
  replies: TrendPoint[];
  returns: TrendPoint[];
}

/** The bucket an instant falls in: its local calendar day in the business
 * zone, or the Monday of that local week. */
function bucketKey(iso: string, bucket: "day" | "week", timeZone: string): string {
  const dayKey = businessDateKey(new Date(iso), timeZone);
  if (bucket === "day") return dayKey;
  const { year, month, day } = parseDateKey(dayKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDaysToDateKey(dayKey, weekday === 0 ? -6 : 1 - weekday);
}

function buildBuckets(range: AnalyticsDateRange): string[] {
  const step = range.bucket === "day" ? 1 : 7;
  const buckets: string[] = [];
  // endIso is exclusive local midnight; the last included day is the one before.
  const lastDay = businessDateKey(new Date(new Date(range.endIso).getTime() - 1), range.timeZone);
  for (let key = bucketKey(range.startIso, range.bucket, range.timeZone); key <= lastDay; key = addDaysToDateKey(key, step)) {
    buckets.push(key);
  }
  return buckets;
}

function toTrend(buckets: string[], counts: Map<string, number>): TrendPoint[] {
  return buckets.map((bucketStart) => ({ bucketStart, value: counts.get(bucketStart) ?? 0 }));
}

export async function getAnalyticsTrends(businessId: string, range: AnalyticsDateRange): Promise<AnalyticsTrends> {
  const supabase = createClient();

  const [sentRows, replyRows, reactivation] = await Promise.all([
    fetchAllPages<{ sent_at: string }>((from, to) =>
      supabase
        .from("messages")
        .select("sent_at")
        .eq("business_id", businessId)
        .in("status", ["sent", "delivered", "read"])
        .gte("sent_at", range.startIso)
        .lt("sent_at", range.endIso)
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<{ received_at: string }>((from, to) =>
      supabase
        .from("customer_messages")
        .select("received_at")
        .eq("business_id", businessId)
        .gte("received_at", range.startIso)
        .lt("received_at", range.endIso)
        .order("id")
        .range(from, to)
    ),
    getReactivationSummary(businessId, range),
  ]);

  const buckets = buildBuckets(range);

  const sentCounts = new Map<string, number>();
  for (const row of sentRows) {
    const key = bucketKey(row.sent_at, range.bucket, range.timeZone);
    sentCounts.set(key, (sentCounts.get(key) ?? 0) + 1);
  }

  const replyCounts = new Map<string, number>();
  for (const row of replyRows) {
    const key = bucketKey(row.received_at, range.bucket, range.timeZone);
    replyCounts.set(key, (replyCounts.get(key) ?? 0) + 1);
  }

  const returnCounts = new Map<string, number>();
  for (const record of reactivation.records) {
    if (!record.returnAt) continue;
    const key = bucketKey(record.returnAt, range.bucket, range.timeZone);
    returnCounts.set(key, (returnCounts.get(key) ?? 0) + 1);
  }

  return {
    messagesSent: toTrend(buckets, sentCounts),
    replies: toTrend(buckets, replyCounts),
    returns: toTrend(buckets, returnCounts),
  };
}
