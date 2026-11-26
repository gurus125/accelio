/**
 * Phase 14 — candidate identification. For each allowed automation type,
 * finds the real records that match its trigger condition, using ONLY
 * existing opportunity-engine / leads logic — never a second, parallel
 * definition of "due to return" or "new lead." The one exception is
 * `recurring_schedule`, which is deliberately NOT opportunity-based (see
 * `lib/recurring-schedules/` and its own comment below) — a calendar
 * anchor date is a different kind of trigger than a visit pattern, and the
 * spec is explicit that the two must not be merged into one calculation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateOpportunities, groupEventsByCustomer } from "@/lib/opportunities/calculate";
import { listServiceBaselines } from "@/lib/opportunities/baselines";
import type { OpportunityType } from "@/lib/opportunities/types";
import { listCustomers, listEventsForBusiness } from "@/lib/customers/queries";
import { listLeadsForBusiness } from "@/lib/leads/queries";
import { findDueRecurringSchedules, periodKeyForRecurringSchedule } from "@/lib/recurring-schedules/queries";
import type { BusinessRow, CustomerRow } from "@/types/database";
import type { CustomerConsentFields } from "@/lib/consent";
import { DEFAULT_BUSINESS_TIMEZONE, getBusinessTimeZone } from "@/lib/dates";
import type { AutomationCandidate, AutomationType } from "./types";

function pickConsent(customer: CustomerRow | undefined): CustomerConsentFields | undefined {
  return customer ? { whatsapp_consent: customer.whatsapp_consent, opted_out_at: customer.opted_out_at } : undefined;
}

/** Maps each opportunity-based automation type to the one `OpportunityType`
 * it's allowed to act on. */
const AUTOMATION_TYPE_TO_OPPORTUNITY_TYPE: Partial<Record<AutomationType, OpportunityType>> = {
  due_for_return: "due_to_return",
  follow_up_reminder: "follow_up",
  service_reminder: "service_reminder",
};

/**
 * Candidates for the "new website lead follow-up" automation: every lead
 * still in Phase 13's `status: "new"` state (i.e. never yet contacted).
 * The `entity_event_key` is `lead:<lead_id>` — stable for the lead's whole
 * lifetime, so the DB-level duplicate guard can never double-send to the
 * same lead for this automation.
 */
export async function findNewLeadFollowupCandidates(
  businessId: string,
  supabase: SupabaseClient
): Promise<AutomationCandidate[]> {
  const leads = await listLeadsForBusiness(businessId, supabase);

  return leads
    .filter((lead) => lead.status === "new")
    .map((lead) => ({
      entityEventKey: `lead:${lead.id}`,
      leadId: lead.id,
      triggeredAt: new Date(lead.captured_at),
      templateContext: {
        leadName: lead.name ?? undefined,
        interest: lead.interest ?? undefined,
      },
      phone: lead.phone,
    }));
}

/**
 * Candidates for the three opportunity-based automation types. Reuses the
 * opportunity engine verbatim (never a second calculation) and simply
 * filters to the one opportunity type this automation is allowed to act
 * on. `entity_event_key` reuses the engine's own deterministic
 * `Opportunity.id` (`<customerId>:<opportunityType>`), which already
 * ceases to exist once the underlying condition resolves (e.g. a fresh
 * visit) — exactly the identifier the duplicate-send guard needs.
 */
export async function findOpportunityBasedCandidates(
  automationType: AutomationType,
  business: BusinessRow,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<AutomationCandidate[]> {
  const opportunityType = AUTOMATION_TYPE_TO_OPPORTUNITY_TYPE[automationType];
  if (!opportunityType) return [];

  const [customers, events, serviceBaselines] = await Promise.all([
    listCustomers(business.id, supabase),
    listEventsForBusiness(business.id, supabase),
    listServiceBaselines(business.id, supabase),
  ]);
  const eventsByCustomer = groupEventsByCustomer(events);
  const opportunities = calculateOpportunities(customers, eventsByCustomer, business, serviceBaselines, now);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return opportunities
    .filter((opportunity) => opportunity.type === opportunityType)
    .map((opportunity) => ({
      entityEventKey: opportunity.id,
      customerId: opportunity.customerId,
      // Opportunities are recomputed fresh every tick with no stored
      // "became due at" timestamp, so the delay is measured from "now" —
      // see eligibility.ts's comment on why this still safely honors a
      // configured delay without ever sending too early.
      triggeredAt: now,
      templateContext: { customerName: opportunity.customerName },
      phone: opportunity.customerPhone,
      customerConsent: pickConsent(customerById.get(opportunity.customerId)),
    }));
}

/**
 * Candidates for the `recurring_schedule` automation type: every active
 * `recurring_schedules` row for this business whose current period is due
 * today and hasn't been sent yet. Deliberately separate from the
 * opportunity engine above — a calendar anchor date isn't a visit pattern,
 * and the spec is explicit these must not be merged into one calculation.
 * `entity_event_key` is period-scoped (`recurring:<scheduleId>:<period>`),
 * so the same automation_runs uniqueness guard that already protects every
 * other automation type also guarantees at most one send per schedule per
 * period, with no new mechanism needed.
 */
export async function findRecurringScheduleCandidates(
  businessId: string,
  supabase: SupabaseClient,
  now: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Promise<AutomationCandidate[]> {
  const due = await findDueRecurringSchedules(businessId, supabase, now, timeZone);

  return due.map(({ schedule, customer }) => ({
    entityEventKey: `recurring:${schedule.id}:${periodKeyForRecurringSchedule(schedule, now, timeZone)}`,
    customerId: schedule.customer_id,
    triggeredAt: now,
    templateContext: { customerName: customer.name, reminderLabel: schedule.label },
    phone: customer.phone,
    customerConsent: pickConsent(customer),
  }));
}

/** Single entry point the executor calls per automation. */
export async function findCandidatesForAutomation(
  automationType: AutomationType,
  business: BusinessRow,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<AutomationCandidate[]> {
  if (automationType === "new_lead_followup") {
    return findNewLeadFollowupCandidates(business.id, supabase);
  }
  if (automationType === "recurring_schedule") {
    return findRecurringScheduleCandidates(business.id, supabase, now, getBusinessTimeZone(business));
  }
  return findOpportunityBasedCandidates(automationType, business, supabase, now);
}
