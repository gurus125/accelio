/**
 * Factual, per-opportunity-type performance (Phase 11 section 19) — plain
 * counts only, deliberately never labeled "best"/"winner"/"highest
 * performing" anywhere this feeds the UI. Covers only PER-CUSTOMER
 * messages (Phase 7's `messages.opportunity_type`, e.g. "due_to_return");
 * campaign sends store `opportunity_type` as "campaign:<type>" (see
 * `lib/campaigns/send.ts`) specifically so the two are never double
 * counted here — campaign performance is `campaigns.ts`'s job.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { computeCustomerReactivation } from "./reactivation";
import type { OpportunityType } from "@/lib/opportunities/types";

export interface OpportunityTypeAnalytics {
  type: OpportunityType;
  contacted: number;
  repliesTotal: number;
  customersReplied: number;
  returned: number;
}

const OPPORTUNITY_TYPES: OpportunityType[] = [
  "due_to_return",
  "inactive",
  "high_value_inactive",
  "service_reminder",
  "follow_up",
];

interface MessageRow {
  customer_id: string;
  opportunity_type: string;
  sent_at: string;
}

export async function getOpportunityTypeAnalytics(
  businessId: string,
  range: AnalyticsDateRange
): Promise<OpportunityTypeAnalytics[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("customer_id, opportunity_type, sent_at")
    .eq("business_id", businessId)
    .in("status", ["sent", "delivered", "read"])
    .gte("sent_at", range.startIso)
    .lt("sent_at", range.endIso)
    .in("opportunity_type", OPPORTUNITY_TYPES);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MessageRow[];

  const customerIdsInvolved = [...new Set(rows.map((r) => r.customer_id))];
  if (customerIdsInvolved.length === 0) {
    return OPPORTUNITY_TYPES.map((type) => ({ type, contacted: 0, repliesTotal: 0, customersReplied: 0, returned: 0 }));
  }

  const [repliesResult, eventsResult] = await Promise.all([
    supabase
      .from("customer_messages")
      .select("customer_id")
      .eq("business_id", businessId)
      .in("customer_id", customerIdsInvolved)
      .gte("received_at", range.startIso)
      .lt("received_at", range.endIso),
    supabase
      .from("customer_events")
      .select("customer_id, occurred_at, amount")
      .eq("business_id", businessId)
      .eq("event_type", "visit")
      .in("customer_id", customerIdsInvolved),
  ]);

  if (repliesResult.error) throw new Error(repliesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const repliedCustomers = new Set(
    ((repliesResult.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id)
  );

  const visitsByCustomer = new Map<string, { at: string; amount: number | null }[]>();
  for (const e of (eventsResult.data ?? []) as { customer_id: string; occurred_at: string; amount: number | null }[]) {
    const list = visitsByCustomer.get(e.customer_id) ?? [];
    list.push({ at: e.occurred_at, amount: e.amount });
    visitsByCustomer.set(e.customer_id, list);
  }

  return OPPORTUNITY_TYPES.map((type) => {
    const typeRows = rows.filter((r) => r.opportunity_type === type);
    const contactedCustomers = [...new Set(typeRows.map((r) => r.customer_id))];
    const repliedForType = contactedCustomers.filter((id) => repliedCustomers.has(id));

    let returned = 0;
    for (const customerId of contactedCustomers) {
      const outreaches = typeRows.filter((r) => r.customer_id === customerId).map((r) => ({ at: r.sent_at }));
      const visits = visitsByCustomer.get(customerId);
      if (!visits || visits.length === 0) continue;
      if (computeCustomerReactivation(outreaches, visits).returned) returned += 1;
    }

    return {
      type,
      contacted: contactedCustomers.length,
      repliesTotal: repliedForType.length,
      customersReplied: repliedForType.length,
      returned,
    };
  });
}
