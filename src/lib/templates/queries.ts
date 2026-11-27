/**
 * Milestone 2 — reads for the send planner (src/lib/templates/plan.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { SERVICE_WINDOW_MS } from "./plan";
import type { MessageTemplateRow } from "@/types/database";

export async function listMessageTemplates(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<MessageTemplateRow[]> {
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("business_id", businessId)
    .order("key")
    .order("variant")
    .order("language");
  if (error) {
    // Table only exists once migration 0020 is applied — degrade to "no
    // approved templates" (free-form inside the 24h window still works).
    console.error("[templates] Couldn't load message templates.", error.message);
    return [];
  }
  return (data ?? []) as MessageTemplateRow[];
}

/** When this customer or lead last messaged the business, or null. */
export async function getLastInboundAt(
  businessId: string,
  recipient: { customerId?: string | null; leadId?: string | null },
  supabase: SupabaseClient = createClient()
): Promise<string | null> {
  let query = supabase.from("customer_messages").select("received_at").eq("business_id", businessId);
  if (recipient.customerId) query = query.eq("customer_id", recipient.customerId);
  else if (recipient.leadId) query = query.eq("lead_id", recipient.leadId);
  else return null;
  const { data, error } = await query.order("received_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.received_at as string | undefined) ?? null;
}

/** customerId -> last inbound time, for every customer who messaged in the
 * last 24 hours (one query for a whole campaign/automation run). */
export async function getRecentInboundByCustomer(
  businessId: string,
  now: Date,
  supabase: SupabaseClient = createClient()
): Promise<Map<string, string>> {
  const since = new Date(now.getTime() - SERVICE_WINDOW_MS).toISOString();
  const rows = await fetchAllPages<{ customer_id: string | null; lead_id: string | null; received_at: string }>((from, to) =>
    supabase
      .from("customer_messages")
      .select("customer_id, lead_id, received_at")
      .eq("business_id", businessId)
      .gte("received_at", since)
      .order("id")
      .range(from, to)
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const id of [row.customer_id, row.lead_id]) {
      if (!id) continue;
      const current = map.get(id);
      if (!current || row.received_at > current) map.set(id, row.received_at);
    }
  }
  return map;
}

/** Services a customer has had (for the discreet-mode check). */
export async function listServiceNamesForCustomer(
  customerId: string,
  supabase: SupabaseClient = createClient()
): Promise<string[]> {
  const { data, error } = await supabase
    .from("customer_events")
    .select("service")
    .eq("customer_id", customerId)
    .not("service", "is", null)
    .limit(500);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => (r.service as string).trim()).filter(Boolean)));
}

/** The service on this customer's most recent visit, if recorded. */
export async function getLastVisitService(
  customerId: string,
  supabase: SupabaseClient = createClient()
): Promise<string | null> {
  const { data, error } = await supabase
    .from("customer_events")
    .select("service")
    .eq("customer_id", customerId)
    .eq("event_type", "visit")
    .not("service", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.service as string | undefined) ?? "").trim() || null;
}
