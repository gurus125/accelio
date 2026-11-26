/**
 * Lightweight, fixed-30-day analytics summary for the main dashboard
 * (Phase 11 section 23) — intentionally just a handful of numbers. The
 * full breakdown, date filter, campaign table, and trends all live on
 * /analytics; this is deliberately NOT a second analytics engine, just a
 * thin call into the same `messages.ts`/`reactivation-query.ts` used
 * everywhere else.
 */

import { getMessageMetrics } from "./messages";
import { getReactivationSummary } from "./reactivation-query";
import { resolveAnalyticsDateRange } from "./date-range";

export interface DashboardAnalyticsSummary {
  contacted: number;
  returnedAfterOutreach: number;
  repliesTotal: number;
  delivered: number;
  read: number;
}

export async function getDashboardAnalyticsSummary(businessId: string): Promise<DashboardAnalyticsSummary> {
  const range = resolveAnalyticsDateRange({ range: "30d" });
  const [messages, reactivation] = await Promise.all([
    getMessageMetrics(businessId, range),
    getReactivationSummary(businessId, range),
  ]);

  return {
    contacted: messages.customersContacted,
    returnedAfterOutreach: reactivation.returnedCount,
    repliesTotal: messages.repliesTotal,
    delivered: messages.delivered,
    read: messages.read,
  };
}
