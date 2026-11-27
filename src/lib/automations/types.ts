import type { CustomerConsentFields } from "@/lib/consent";
/**
 * Phase 14 — types for the controlled automation engine. An "automation" is
 * deliberately narrow: TRIGGER + ELIGIBILITY + ACTION + OPTIONAL DELAY +
 * SAFETY RULES. This is NOT a workflow engine — there is no branching, no
 * chaining, no arbitrary conditions. Four of the five kinds below act on
 * the opportunity engine's visit-pattern output; `recurring_schedule` is
 * the one calendar-anchored exception (see `lib/recurring-schedules/`),
 * kept as its own trigger type per the product decision that calendar
 * events and behavioral opportunities must never be merged into one
 * calculation.
 */

export type AutomationType =
  | "new_lead_followup"
  | "due_for_return"
  | "follow_up_reminder"
  | "service_reminder"
  | "recurring_schedule";

export type AutomationActionType = "create_recommendation" | "send_whatsapp";

export type AutomationStatus = "draft" | "active" | "paused" | "archived";

export type AutomationLanguage = "english" | "hinglish";

export type AutomationTone = "friendly" | "professional" | "warm";

export interface AutomationRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  automation_type: AutomationType;
  trigger_type: string;
  action_type: AutomationActionType;
  status: AutomationStatus;
  delay_minutes: number;
  language: AutomationLanguage;
  tone: AutomationTone;
  message_template: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
}

export type AutomationRunStatus = "eligible" | "skipped" | "sent" | "failed";

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  business_id: string;
  lead_id: string | null;
  customer_id: string | null;
  message_id: string | null;
  entity_event_key: string;
  status: AutomationRunStatus;
  reason: string | null;
  executed_at: string;
  created_at: string;
}

/** A candidate the engine found for one automation on one tick — not yet
 * checked for eligibility. Exactly one of `leadId`/`customerId` is set,
 * matching the DB's `automation_runs_one_entity` check. */
export interface AutomationCandidate {
  entityEventKey: string;
  leadId?: string;
  customerId?: string;
  /** Real-world moment the trigger condition first became true (lead
   * captured_at, or "now" for opportunity-based triggers, which are
   * recomputed fresh every tick and carry no stored "became due at"
   * timestamp — see eligibility.ts for how the delay is still honored
   * safely for those). */
  triggeredAt: Date;
  /** Values available for template substitution, already resolved from
   * real records — never invented. */
  templateContext: {
    customerName?: string;
    leadName?: string;
    interest?: string;
    /** The recurring schedule's own label (e.g. "Monthly coaching fee") —
     * only set for `recurring_schedule` candidates. */
    reminderLabel?: string;
  };
  /** The phone number to send to, already whatever this business/customer
   * has on file (may still fail normalization later). */
  phone: string | null;
  /** Milestone 1 — the customer's WhatsApp consent as stored. Required for
   * customer candidates; a missing value fails closed (no send). */
  customerConsent?: CustomerConsentFields;
}

export type EligibilityFailureReason =
  | "no_phone"
  | "invalid_phone"
  | "consent_unclear"
  | "opted_out"
  | "no_consent"
  | "recently_contacted"
  | "conflicting_active_message"
  | "unanswered_reply"
  | "recently_returned"
  | "automation_not_active"
  | "business_paused"
  | "outside_business_hours"
  | "delay_not_elapsed"
  | "daily_limit_reached"
  | "customer_limit_reached"
  | "duplicate_execution"
  | "missing_template"
  | "whatsapp_not_connected";

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EligibilityFailureReason; detail: string };

export interface AutomationRunOutcome {
  candidate: AutomationCandidate;
  status: AutomationRunStatus;
  reason: string | null;
  messageId: string | null;
}
