/**
 * CRUD for `service_baselines` — the business's own tier-1 overrides in
 * the baseline hierarchy (see `service-defaults.ts` for tiers 2-3). Same
 * pattern as every other queries module in this codebase: RLS is the real
 * boundary, `business_id` filters here are defense in depth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ServiceBaselineRow } from "@/types/database";
import { fetchAllPages } from "@/lib/supabase/paginate";

export async function listServiceBaselines(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<ServiceBaselineRow[]> {
  const { data, error } = await supabase
    .from("service_baselines")
    .select("*")
    .eq("business_id", businessId)
    .order("service", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceBaselineRow[];
}

/** Creates or updates the business's expected-return-days for one service
 * name (case-insensitive on the existing row, exact-case on a new one) —
 * the Settings page's "save" action, one call whether the service is new
 * or already configured. */
export async function upsertServiceBaseline(
  businessId: string,
  service: string,
  expectedReturnDays: number,
  supabase: SupabaseClient = createClient()
): Promise<ServiceBaselineRow> {
  const trimmedService = service.trim();
  if (!trimmedService) throw new Error("Service name can't be empty.");
  if (!Number.isFinite(expectedReturnDays) || expectedReturnDays <= 0) {
    throw new Error("Expected return days must be a positive number.");
  }

  const existing = await listServiceBaselines(businessId, supabase);
  const match = existing.find((b) => b.service.trim().toLowerCase() === trimmedService.toLowerCase());

  if (match) {
    const { data, error } = await supabase
      .from("service_baselines")
      .update({ expected_return_days: Math.round(expectedReturnDays), updated_at: new Date().toISOString() })
      .eq("id", match.id)
      .eq("business_id", businessId)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to update the service baseline.");
    return data as ServiceBaselineRow;
  }

  const { data, error } = await supabase
    .from("service_baselines")
    .insert({ business_id: businessId, service: trimmedService, expected_return_days: Math.round(expectedReturnDays) })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save the service baseline.");
  return data as ServiceBaselineRow;
}

export async function deleteServiceBaseline(
  businessId: string,
  baselineId: string,
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { error } = await supabase
    .from("service_baselines")
    .delete()
    .eq("id", baselineId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

/** Every distinct, non-blank service name this business's customers have
 * actual visit history for — used by the Settings page to suggest which
 * services are worth configuring an interval for, instead of asking the
 * owner to type them from memory. */
export async function listDistinctServiceNamesForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<string[]> {
  const data = await fetchAllPages<{ service: string | null }>((from, to) =>
    supabase
      .from("customer_events")
      .select("service")
      .eq("business_id", businessId)
      .eq("event_type", "visit")
      .not("service", "is", null)
      .order("id")
      .range(from, to)
  );

  const seen = new Map<string, string>();
  for (const row of data) {
    const trimmed = row.service?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
