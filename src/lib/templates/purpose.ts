/**
 * Milestone 2 — which template a message uses, by why it is being sent.
 * Pure (no Supabase import).
 */

import type { TemplateKey } from "./catalog";

/** Opportunity engine type -> template. Reminder-style opportunities use
 * the return reminder; a post-visit follow-up asks for feedback. Anything
 * else (e.g. a message with no opportunity) is a general offer. */
export function purposeForOpportunityType(type: string | null | undefined): TemplateKey {
  switch (type) {
    case "due_to_return":
    case "service_reminder":
    case "inactive":
    case "high_value_inactive":
      return "return_reminder";
    case "follow_up":
      return "review_request";
    default:
      return "offer";
  }
}

export function purposeForCampaignType(type: string): TemplateKey {
  switch (type) {
    case "due_for_return":
    case "service_reminder":
    case "inactive_customers":
    case "high_value_inactive":
      return "return_reminder";
    case "follow_up":
      return "review_request";
    default:
      return "offer"; // "custom": the owner's own text goes in the offer slot
  }
}

export function purposeForAutomationType(type: string): TemplateKey {
  switch (type) {
    case "due_for_return":
    case "service_reminder":
    case "recurring_schedule":
      return "return_reminder";
    case "follow_up_reminder":
      return "review_request";
    default:
      return "offer"; // new_lead_followup: the approved automation text fills the offer slot
  }
}
