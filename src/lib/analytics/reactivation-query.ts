/**
 * Supabase-backed wrapper around the pure logic in `reactivation.ts`.
 * Deliberately fetches a business's FULL outreach + visit history (not
 * just the selected date-range slice) — the "first qualifying return
 * only" rule needs a customer's whole history to correctly identify which
 * visit is genuinely their first, so a customer isn't double-counted as
 * "returned" once per date-range view. Results are then filtered down to
 * the returns whose date actually falls inside the selected range.
 *
 * Scale note (Phase 11 section 26/27): for this app's target (a single
 * local business's customer base — hundreds, not millions, of rows), one
 * pass over `messages` and `customer_events` per request is fine. If a
 * business ever grows into tens of thousands of events, this should move
 * to a SQL aggregate (e.g. a Postgres function) instead of an in-app
 * reduce — noted as a limitation in the Phase 11 report rather than
 * pre-optimized here.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { computeCustomerReactivation, isQualifyingOutreachStatus, type ReactivationResult } from "./reactivation";

export interface CustomerReactivationRecord extends ReactivationResult {
  customerId: string;
}

export interface ReactivationSummary {
  returnedCount: number;
  /** False only when this business has never recorded a visit amount at
   * all — see Phase 11 sections 5/16: show "Revenue tracking unavailable"
   * rather than a misleading ₹0. */
  revenueTrackingAvailable: boolean;
  revenueTotal: number | null;
  /** Only the customers whose return falls inside the selected range. */
  records: CustomerReactivationRecord[];
}

interface MessageRow {
  customer_id: string;
  status: string;
  sent_at: string | null;
}

interface VisitRow {
  customer_id: string;
  occurred_at: string;
  amount: number | null;
}

export async function getReactivationSummary(businessId: string, range: AnalyticsDateRange): Promise<ReactivationSummary> {
  const supabase = createClient();

  const [messagesResult, eventsResult] = await Promise.all([
    supabase
      .from("messages")
      .select("customer_id, status, sent_at")
      .eq("business_id", businessId)
      .not("sent_at", "is", null),
    supabase
      .from("customer_events")
      .select("customer_id, occurred_at, amount")
      .eq("business_id", businessId)
      .eq("event_type", "visit"),
  ]);

  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const messages = (messagesResult.data ?? []) as MessageRow[];
  const events = (eventsResult.data ?? []) as VisitRow[];

  const outreachByCustomer = new Map<string, { at: string }[]>();
  for (const m of messages) {
    if (!m.sent_at || !isQualifyingOutreachStatus(m.status)) continue;
    const list = outreachByCustomer.get(m.customer_id) ?? [];
    list.push({ at: m.sent_at });
    outreachByCustomer.set(m.customer_id, list);
  }

  const visitsByCustomer = new Map<string, { at: string; amount: number | null }[]>();
  for (const e of events) {
    const list = visitsByCustomer.get(e.customer_id) ?? [];
    list.push({ at: e.occurred_at, amount: e.amount !== null ? Number(e.amount) : null });
    visitsByCustomer.set(e.customer_id, list);
  }

  const amountsTrackedAtAll = events.some((e) => e.amount !== null);
  const rangeStart = new Date(range.startIso).getTime();
  const rangeEnd = new Date(range.endIso).getTime();

  const records: CustomerReactivationRecord[] = [];
  let revenueTotal = 0;

  for (const [customerId, outreaches] of outreachByCustomer.entries()) {
    const visits = visitsByCustomer.get(customerId);
    if (!visits || visits.length === 0) continue;

    const result = computeCustomerReactivation(outreaches, visits);
    if (!result.returned || !result.returnAt) continue;

    const returnTime = new Date(result.returnAt).getTime();
    if (returnTime < rangeStart || returnTime >= rangeEnd) continue;

    records.push({ customerId, ...result });
    revenueTotal += result.revenue ?? 0;
  }

  return {
    returnedCount: records.length,
    revenueTrackingAvailable: amountsTrackedAtAll,
    revenueTotal: amountsTrackedAtAll ? revenueTotal : null,
    records,
  };
}
