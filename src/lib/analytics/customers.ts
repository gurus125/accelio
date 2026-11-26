/**
 * Customer-level analytics (Phase 11 section 20-21) — a single customer's
 * communication summary and reactivation status, shown on their profile
 * and in the "Recently returned" list. Uses that customer's FULL history,
 * not a date-filtered slice — a reactivation status ("returned after
 * outreach") describes a fact about the customer, not something that
 * should flicker on/off depending on which date filter happens to be
 * selected elsewhere.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { computeCustomerReactivation, isQualifyingOutreachStatus } from "./reactivation";
import { getReactivationSummary } from "./reactivation-query";

export interface CustomerAnalyticsSummary {
  messagesSent: number;
  repliesTotal: number;
  lastOutreachAt: string | null;
  lastReplyAt: string | null;
  returnedAfterOutreach: boolean;
  outreachAt: string | null;
  returnAt: string | null;
  revenue: number | null;
}

export async function getCustomerAnalyticsSummary(
  businessId: string,
  customerId: string
): Promise<CustomerAnalyticsSummary> {
  const supabase = createClient();

  const [messagesResult, repliesResult, eventsResult] = await Promise.all([
    supabase
      .from("messages")
      .select("status, sent_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .not("sent_at", "is", null),
    supabase
      .from("customer_messages")
      .select("received_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("received_at", { ascending: false }),
    supabase
      .from("customer_events")
      .select("occurred_at, amount")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .eq("event_type", "visit"),
  ]);

  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (repliesResult.error) throw new Error(repliesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const messages = (messagesResult.data ?? []) as { status: string; sent_at: string }[];
  const qualifying = messages.filter((m) => isQualifyingOutreachStatus(m.status));
  const messagesSent = qualifying.length;
  const lastOutreachAt =
    qualifying.length > 0
      ? qualifying.reduce((latest, m) => (m.sent_at > latest ? m.sent_at : latest), qualifying[0].sent_at)
      : null;

  const replies = (repliesResult.data ?? []) as { received_at: string }[];
  const repliesTotal = replies.length;
  const lastReplyAt = replies[0]?.received_at ?? null;

  const events = (eventsResult.data ?? []) as { occurred_at: string; amount: number | null }[];
  const visits = events.map((e) => ({ at: e.occurred_at, amount: e.amount !== null ? Number(e.amount) : null }));
  const outreaches = qualifying.map((m) => ({ at: m.sent_at }));
  const reactivation =
    visits.length > 0
      ? computeCustomerReactivation(outreaches, visits)
      : { returned: false, outreachAt: null, returnAt: null, revenue: null };

  return {
    messagesSent,
    repliesTotal,
    lastOutreachAt,
    lastReplyAt,
    returnedAfterOutreach: reactivation.returned,
    outreachAt: reactivation.outreachAt,
    returnAt: reactivation.returnAt,
    revenue: reactivation.revenue,
  };
}


export interface RecentlyReturnedCustomer {
  customerId: string;
  customerName: string;
  outreachAt: string;
  returnAt: string;
  revenue: number | null;
}

/** Phase 11 section 21 — "Recently Returned After Outreach" list for the
 * analytics page. Reuses `getReactivationSummary` (same source of truth as
 * the overview tile) and joins in customer names for display only. */
export async function getRecentlyReturnedCustomers(
  businessId: string,
  range: AnalyticsDateRange,
  limit = 10
): Promise<RecentlyReturnedCustomer[]> {
  const summary = await getReactivationSummary(businessId, range);
  if (summary.records.length === 0) return [];

  const supabase = createClient();
  const customerIds = summary.records.map((r) => r.customerId);
  const { data, error } = await supabase.from("customers").select("id, name").in("id", customerIds);
  if (error) throw new Error(error.message);

  const nameById = new Map(((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  return summary.records
    .filter((r): r is typeof r & { outreachAt: string; returnAt: string } => Boolean(r.outreachAt && r.returnAt))
    .sort((a, b) => new Date(b.returnAt).getTime() - new Date(a.returnAt).getTime())
    .slice(0, limit)
    .map((r) => ({
      customerId: r.customerId,
      customerName: nameById.get(r.customerId) ?? "Customer",
      outreachAt: r.outreachAt,
      returnAt: r.returnAt,
      revenue: r.revenue,
    }));
}
