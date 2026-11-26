import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { CustomerEventRow, CustomerRow } from "@/types/database";

/**
 * All of these take a `businessId` and filter by it explicitly — that's a
 * defense-in-depth convenience, not the actual security boundary. The real
 * boundary is Row Level Security on the tables themselves (see the Phase 4
 * migration): even if a caller forgot the `.eq("business_id", ...)` filter,
 * Postgres would still only return rows the authenticated user owns.
 *
 * `listCustomers` and `listEventsForBusiness` accept an optional trailing
 * Supabase client, defaulting to the request-scoped `createClient()`. This
 * lets Phase 14's automation engine (which runs outside any signed-in
 * request context) pass in `createAdminClient()` instead, reusing this exact
 * query logic rather than duplicating it — see `lib/automations/executor.ts`.
 * Every existing call site is unaffected since the parameter is optional.
 */

export async function listCustomers(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerRow[];
}

export async function listEventsForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<CustomerEventRow[]> {
  const { data, error } = await supabase
    .from("customer_events")
    .select("*")
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerEventRow[];
}

export async function getCustomer(businessId: string, customerId: string): Promise<CustomerRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CustomerRow | null;
}

export async function listEventsForCustomer(customerId: string): Promise<CustomerEventRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_events")
    .select("*")
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerEventRow[];
}
