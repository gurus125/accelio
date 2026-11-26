/**
 * Phase 14 — counting queries backing the daily/per-customer safety limits,
 * plus the duplicate-execution guard. Counts are derived from the SAME
 * `messages` table every other send already writes to (filtered by the
 * `automation:` opportunity_type prefix — see constants.ts) and from
 * `automation_runs` — never a second, separately-maintained counter that
 * could drift out of sync with what was actually sent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTOMATION_OPPORTUNITY_TYPE_PREFIX } from "./constants";

function startOfTodayIso(now: Date): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** How many automated messages this business has already sent today
 * (business-local midnight, server clock — see the timezone note in
 * constants.ts). Counts every automation type together, per spec step 16. */
export async function countAutomatedMessagesSentTodayForBusiness(
  businessId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<number> {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .like("opportunity_type", `${AUTOMATION_OPPORTUNITY_TYPE_PREFIX}%`)
    .not("sent_at", "is", null)
    .gte("sent_at", startOfTodayIso(now));

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** How many automated messages a specific customer or lead has received in
 * the last 30 days, across ALL automations combined (spec step 17 — one
 * automation cannot bypass this by acting alongside another). */
export async function countAutomatedMessagesSentLast30DaysForRecipient(
  businessId: string,
  entity: { customerId: string } | { leadId: string },
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .like("opportunity_type", `${AUTOMATION_OPPORTUNITY_TYPE_PREFIX}%`)
    .not("sent_at", "is", null)
    .gte("sent_at", since);

  query = "customerId" in entity ? query.eq("customer_id", entity.customerId) : query.eq("lead_id", entity.leadId);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Database-level duplicate-execution guard (spec step 18): true if this
 * automation has already SENT for this exact logical trigger occurrence.
 * This is a pre-check for efficiency (skip the eligibility work entirely);
 * the real, race-proof guarantee is the `automation_runs_sent_once_idx`
 * unique partial index itself, which a second concurrent write would
 * violate even if two ticks ran this check at the exact same instant.
 */
export async function hasAlreadySentForEntityEventKey(
  automationId: string,
  entityEventKey: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from("automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("automation_id", automationId)
    .eq("entity_event_key", entityEventKey)
    .eq("status", "sent");

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
