/**
 * Phase 10 — resolves WHO belongs in a campaign audience by reusing the
 * existing Phase 6 opportunity engine, never re-implementing its rules.
 * "custom" is the one type with no engine involvement — the owner picks
 * customers by hand.
 */

import { listCustomers } from "@/lib/customers/queries";
import { getOpportunitiesForCurrentBusiness } from "@/lib/opportunities/queries";
import type { OpportunityType } from "@/lib/opportunities/types";
import type { CustomerRow } from "@/types/database";
import type { CampaignType } from "./types";
import { CAMPAIGN_TYPE_DESCRIPTIONS, CAMPAIGN_TYPE_LABELS } from "./types";

const CAMPAIGN_TYPE_TO_OPPORTUNITY: Partial<Record<CampaignType, OpportunityType>> = {
  inactive_customers: "inactive",
  due_for_return: "due_to_return",
  high_value_inactive: "high_value_inactive",
  follow_up: "follow_up",
  service_reminder: "service_reminder",
};

export interface AudienceCandidate {
  customer: CustomerRow;
  /** Only set for opportunity-derived audiences — the real, engine-produced
   * reason, so the campaign message/preview can reference genuine data
   * instead of inventing something. */
  opportunityReason: string | null;
}

/**
 * The full, current set of customers matching a campaign type — computed
 * live from real data every time, never cached/stored (a customer who
 * pays their bill and returns should drop out of "inactive" the next time
 * this is called, exactly like the Opportunities page).
 */
export async function resolveAudienceCandidates(businessId: string, campaignType: CampaignType): Promise<AudienceCandidate[]> {
  if (campaignType === "custom") {
    const customers = await listCustomers(businessId);
    return customers.map((customer) => ({ customer, opportunityReason: null }));
  }

  const opportunityType = CAMPAIGN_TYPE_TO_OPPORTUNITY[campaignType];
  if (!opportunityType) return [];

  const [opportunities, customers] = await Promise.all([
    getOpportunitiesForCurrentBusiness(),
    listCustomers(businessId),
  ]);

  const customerById = new Map(customers.map((c) => [c.id, c]));

  const candidates: (AudienceCandidate | null)[] = opportunities
    .filter((opp) => opp.type === opportunityType)
    .map((opp) => {
      const customer = customerById.get(opp.customerId);
      if (!customer) return null;
      const candidate: AudienceCandidate = { customer, opportunityReason: opp.explanation };
      return candidate;
    });

  return candidates.filter((candidate): candidate is AudienceCandidate => candidate !== null);
}

export function campaignTypeLabel(type: CampaignType): string {
  return CAMPAIGN_TYPE_LABELS[type];
}

export function campaignTypeDescription(type: CampaignType): string {
  return CAMPAIGN_TYPE_DESCRIPTIONS[type];
}

/** All audience counts in one pass — used by the "choose audience" step so
 * it doesn't re-run the opportunity engine once per campaign type. */
export async function getAudienceCountsForBusiness(businessId: string): Promise<Record<CampaignType, number>> {
  const [opportunities, customers] = await Promise.all([
    getOpportunitiesForCurrentBusiness(),
    listCustomers(businessId),
  ]);

  const counts: Record<CampaignType, number> = {
    custom: customers.length,
    inactive_customers: 0,
    due_for_return: 0,
    high_value_inactive: 0,
    follow_up: 0,
    service_reminder: 0,
  };

  for (const opp of opportunities) {
    for (const [campaignType, opportunityType] of Object.entries(CAMPAIGN_TYPE_TO_OPPORTUNITY) as [CampaignType, OpportunityType][]) {
      if (opp.type === opportunityType) counts[campaignType] += 1;
    }
  }

  return counts;
}
