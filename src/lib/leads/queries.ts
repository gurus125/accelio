/**
 * Authenticated, RLS-scoped lead queries — for the Reelo dashboard only.
 * The public capture path never uses these (see `capture.ts`, which uses
 * the service-role admin client instead, the same split Phase 9's webhook
 * already established).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { LeadRow, LeadStatus, LeadWidgetRow } from "@/types/database";

export interface LeadCounts {
  new: number;
  contacted: number;
  replied: number;
  qualified: number;
  converted: number;
  lost: number;
}

export async function listLeadsForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .order("captured_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRow[];
}

export async function getLead(
  businessId: string,
  leadId: string,
  supabase: SupabaseClient = createClient()
): Promise<LeadRow | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as LeadRow | null;
}

/** Simple counts by status for the `/leads` summary tiles — one grouped
 * query, not five separate `count` round-trips. */
export function countLeadsByStatus(leads: LeadRow[]): LeadCounts {
  const counts: LeadCounts = { new: 0, contacted: 0, replied: 0, qualified: 0, converted: 0, lost: 0 };
  for (const lead of leads) counts[lead.status] += 1;
  return counts;
}

export async function updateLeadStatus(businessId: string, leadId: string, status: LeadStatus): Promise<LeadRow> {
  const supabase = createClient();
  const update: Record<string, unknown> = { status };
  if (status === "converted") update.converted_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("business_id", businessId)
    .eq("id", leadId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update lead.");
  return data as LeadRow;
}

/** Called after a WhatsApp message is actually sent to a lead — moves a
 * brand-new lead to "contacted" and stamps when. Never downgrades a lead
 * that's already replied/qualified/converted/lost; a follow-up message to
 * an already-qualified lead shouldn't reset their status backwards. */
export async function markLeadContacted(
  businessId: string,
  leadId: string,
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString(), status: "contacted" })
    .eq("business_id", businessId)
    .eq("id", leadId)
    .eq("status", "new");
  if (error) throw new Error(error.message);

  // Still stamp last_contacted_at for leads already past "new" (e.g.
  // re-contacting a "replied" lead), without touching their status.
  const { error: stampError } = await supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", leadId)
    .neq("status", "new");
  if (stampError) throw new Error(stampError.message);
}

export async function getWidgetForBusiness(businessId: string): Promise<LeadWidgetRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lead_widgets")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as LeadWidgetRow | null;
}

/** Idempotent, same pattern as `ensureBusinessForCurrentUser` — creates the
 * one widget row a business needs the first time its Settings page (or the
 * embed snippet) is viewed. */
export async function ensureWidgetForBusiness(businessId: string): Promise<LeadWidgetRow> {
  const existing = await getWidgetForBusiness(businessId);
  if (existing) return existing;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("lead_widgets")
    .insert({ business_id: businessId })
    .select("*")
    .single();

  if (error) {
    // Concurrent creation (double page load) — just re-fetch.
    if (error.code === "23505") {
      const raced = await getWidgetForBusiness(businessId);
      if (raced) return raced;
    }
    throw new Error(error.message);
  }
  return data as LeadWidgetRow;
}
