import { createClient } from "@/lib/supabase/server";
import type { BillingEventRow } from "@/types/database";

/**
 * Billing history for the /billing page. Uses the ordinary RLS-scoped
 * client — `billing_events`' own select policy already restricts this to
 * the OWNER of the caller's business (see the Phase 16 migration), so
 * there's no separate role check needed here; a staff member's own
 * session simply gets zero rows back, never an error.
 */
export async function listBillingEventsForBusiness(businessId: string, limit = 20): Promise<BillingEventRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_events")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as BillingEventRow[];
}
