/**
 * Simple time-series for the /analytics "Trends" section (Phase 11
 * section 22) — messages sent, replies, and returns, bucketed by day for
 * short ranges and by week once a range is long enough that daily bars
 * stop being readable (see `date-range.ts`'s `bucket` field). No charting
 * library dependency — the page renders these as plain inline-SVG bars.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { getReactivationSummary } from "./reactivation-query";

export interface TrendPoint {
  /** UTC day (bucket=day) or UTC Monday-of-week (bucket=week), "YYYY-MM-DD". */
  bucketStart: string;
  value: number;
}

export interface AnalyticsTrends {
  messagesSent: TrendPoint[];
  replies: TrendPoint[];
  returns: TrendPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function bucketKey(iso: string, bucket: "day" | "week"): string {
  const d = new Date(iso);
  if (bucket === "day") return d.toISOString().slice(0, 10);

  // Monday-start UTC week.
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
  return monday.toISOString().slice(0, 10);
}

function buildBuckets(range: AnalyticsDateRange): string[] {
  const step = range.bucket === "day" ? DAY_MS : WEEK_MS;
  const buckets: string[] = [];
  let cursorKey = bucketKey(range.startIso, range.bucket);
  let cursorTime = new Date(cursorKey).getTime();
  const endTime = new Date(range.endIso).getTime();

  while (cursorTime < endTime) {
    buckets.push(new Date(cursorTime).toISOString().slice(0, 10));
    cursorTime += step;
  }
  return buckets;
}

function toTrend(buckets: string[], counts: Map<string, number>): TrendPoint[] {
  return buckets.map((bucketStart) => ({ bucketStart, value: counts.get(bucketStart) ?? 0 }));
}

export async function getAnalyticsTrends(businessId: string, range: AnalyticsDateRange): Promise<AnalyticsTrends> {
  const supabase = createClient();

  const [messagesResult, repliesResult, reactivation] = await Promise.all([
    supabase
      .from("messages")
      .select("sent_at")
      .eq("business_id", businessId)
      .in("status", ["sent", "delivered", "read"])
      .gte("sent_at", range.startIso)
      .lt("sent_at", range.endIso),
    supabase
      .from("customer_messages")
      .select("received_at")
      .eq("business_id", businessId)
      .gte("received_at", range.startIso)
      .lt("received_at", range.endIso),
    getReactivationSummary(businessId, range),
  ]);

  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (repliesResult.error) throw new Error(repliesResult.error.message);

  const buckets = buildBuckets(range);

  const sentCounts = new Map<string, number>();
  for (const row of (messagesResult.data ?? []) as { sent_at: string }[]) {
    const key = bucketKey(row.sent_at, range.bucket);
    sentCounts.set(key, (sentCounts.get(key) ?? 0) + 1);
  }

  const replyCounts = new Map<string, number>();
  for (const row of (repliesResult.data ?? []) as { received_at: string }[]) {
    const key = bucketKey(row.received_at, range.bucket);
    replyCounts.set(key, (replyCounts.get(key) ?? 0) + 1);
  }

  const returnCounts = new Map<string, number>();
  for (const record of reactivation.records) {
    if (!record.returnAt) continue;
    const key = bucketKey(record.returnAt, range.bucket);
    returnCounts.set(key, (returnCounts.get(key) ?? 0) + 1);
  }

  return {
    messagesSent: toTrend(buckets, sentCounts),
    replies: toTrend(buckets, replyCounts),
    returns: toTrend(buckets, returnCounts),
  };
}
