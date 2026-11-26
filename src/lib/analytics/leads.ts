/**
 * Phase 13 — factual website-lead analytics, additive to Phase 11's
 * `/analytics` page (its Overview/Engagement/Reactivation/Campaign
 * sections are untouched — this is a new section, not a rework). No
 * causal language: "leads captured/converted", never "Reelo generated".
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { computeRate, type RateResult } from "./rates";
import type { LeadRow, LeadSource } from "@/types/database";
import { describeLeadSource } from "@/lib/leads/labels";

export interface LeadAnalyticsSummary {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  /** Denominator is every lead captured in this date range — see the
   * function comment below for why. */
  conversionRate: RateResult;
}

export interface LeadSourceBreakdownRow {
  source: LeadSource;
  label: string;
  count: number;
}

async function listLeadsInRange(businessId: string, range: AnalyticsDateRange): Promise<LeadRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .gte("captured_at", range.startIso)
    .lt("captured_at", range.endIso);

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRow[];
}

/**
 * Conversion rate here is defined explicitly as: leads CONVERTED /
 * leads CAPTURED, both within the same date range (not "of leads eligible
 * to convert" — a lead captured yesterday hasn't had time to convert yet,
 * but excluding it would make the denominator a moving, hard-to-explain
 * target). Shows "--" rather than "0%" when no leads were captured in the
 * range at all, per Phase 11's established rate-display convention.
 */
export async function getLeadAnalyticsSummary(businessId: string, range: AnalyticsDateRange): Promise<LeadAnalyticsSummary> {
  const leads = await listLeadsInRange(businessId, range);

  const counts = {
    new: 0,
    contacted: 0,
    replied: 0,
    qualified: 0,
    converted: 0,
    lost: 0,
  };
  for (const lead of leads) counts[lead.status] += 1;

  return {
    totalLeads: leads.length,
    newLeads: counts.new,
    contactedLeads: counts.contacted,
    repliedLeads: counts.replied,
    qualifiedLeads: counts.qualified,
    convertedLeads: counts.converted,
    lostLeads: counts.lost,
    conversionRate: computeRate(counts.converted, leads.length),
  };
}

/** Website leads by source (Phase 13 spec step 26) — a plain count, never
 * an attribution model or per-visitor tracking. */
export async function getLeadSourceBreakdown(businessId: string, range: AnalyticsDateRange): Promise<LeadSourceBreakdownRow[]> {
  const leads = await listLeadsInRange(businessId, range);

  const counts = new Map<LeadSource, number>();
  for (const lead of leads) counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);

  return [...counts.entries()]
    .map(([source, count]) => ({ source, label: describeLeadSource(source), count }))
    .sort((a, b) => b.count - a.count);
}
