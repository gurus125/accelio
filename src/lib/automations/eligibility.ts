/**
 * Phase 14 — layers automation-specific safety checks on top of Phase 12's
 * existing `isEligibleToday` (cooldown + unanswered-reply) rather than
 * reimplementing them. Every check here is one item from the spec's
 * step 14 "customer eligibility checklist" / step 13 "consent" /
 * step 22 "business hours" — nothing extra, nothing skipped.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { checkCustomerConsent } from "@/lib/consent";
import { getWhatsAppConnection, findRecentDuplicateMessage } from "@/lib/whatsapp/queries";
import { isEligibleToday, type OutreachContext } from "@/lib/recommendations/filters";
import type { LeadRow } from "@/types/database";
import {
  AUTOMATION_BUSINESS_HOURS_END_HOUR,
  AUTOMATION_BUSINESS_HOURS_START_HOUR,
  ASSUMED_BUSINESS_TIMEZONE,
  MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY,
  MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS,
} from "./constants";
import type { AutomationCandidate, AutomationRow, EligibilityResult } from "./types";

/**
 * Whether `now` falls inside the configured business-hours window, in the
 * assumed business timezone (spec step 22). Never sends outside this
 * window — a candidate outside it is simply deferred to a later tick, not
 * queued anywhere special (see the executor's comment on why that's safe).
 */
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const hourInBusinessTz = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ASSUMED_BUSINESS_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  return hourInBusinessTz >= AUTOMATION_BUSINESS_HOURS_START_HOUR && hourInBusinessTz < AUTOMATION_BUSINESS_HOURS_END_HOUR;
}

/**
 * Whether a candidate's configured delay has elapsed yet. Lead-based
 * candidates have a real `triggeredAt` (the lead's `captured_at`), so the
 * delay is measured from that real moment. Opportunity-based candidates
 * (due-for-return / follow-up / service-reminder) have no stored "became
 * due at" timestamp — Phase 6 opportunities are recomputed fresh every
 * tick, not persisted with a start time — so for those the delay is
 * treated as already elapsed; the cooldown and business-hours checks
 * elsewhere in this file are what actually control pacing for that
 * automation type. This is a deliberate, documented simplification, not an
 * oversight: inventing a persisted "opportunity became true at" timestamp
 * would mean a second, parallel opportunity-tracking table, which the spec
 * explicitly forbids duplicating.
 */
export function hasDelayElapsed(candidate: AutomationCandidate, delayMinutes: number, now: Date = new Date()): boolean {
  if (!candidate.leadId) return true;
  const elapsedMs = now.getTime() - candidate.triggeredAt.getTime();
  return elapsedMs >= delayMinutes * 60_000;
}

/** Consent gate (spec step 13). Leads: only a lead whose Phase 13 consent
 * checkbox was recorded as given, and who hasn't replied STOP, may be
 * automatically messaged. Customers (Milestone 1): only with recorded
 * WhatsApp consent and no opt-out — see src/lib/consent.ts. */
export function hasSufficientConsent(lead: LeadRow | null, candidate?: AutomationCandidate): EligibilityResult {
  // Milestone 1 — customers need recorded consent and no opt-out. A
  // customer candidate without consent data fails closed.
  if (candidate?.customerId) {
    const check = checkCustomerConsent(candidate.customerConsent ?? {});
    if (!check.allowed) return { eligible: false, reason: check.reason, detail: check.message };
  }
  if (!lead) return { eligible: true };
  if (lead.opted_out_at) {
    return { eligible: false, reason: "opted_out", detail: "This lead replied STOP and opted out of WhatsApp messages." };
  }
  if (lead.consent_status === "given") return { eligible: true };
  return {
    eligible: false,
    reason: "consent_unclear",
    detail: "Lead received, but automated marketing message was not sent because communication permission is unclear.",
  };
}

export interface EligibilityCheckParams {
  automation: AutomationRow;
  candidate: AutomationCandidate;
  lead: LeadRow | null;
  outreachContext: OutreachContext | undefined;
  businessAutomationsPausedAt: string | null;
  dailyCountForBusiness: number;
  monthlyCountForCustomerOrLead: number;
  now: Date;
  supabase: SupabaseClient;
}

/**
 * Runs every safety gate for one candidate, in the order a human would
 * reason about them (cheapest/most-fundamental first). Returns the FIRST
 * failure found — callers write exactly one `automation_runs` row from
 * this result, never multiple partial ones.
 */
export async function checkCandidateEligibility(params: EligibilityCheckParams): Promise<EligibilityResult> {
  const { automation, candidate, lead, outreachContext, now } = params;

  if (automation.status !== "active") {
    return { eligible: false, reason: "automation_not_active", detail: "This automation isn't active." };
  }

  if (params.businessAutomationsPausedAt) {
    return {
      eligible: false,
      reason: "business_paused",
      detail: "All automations are currently paused for this business.",
    };
  }

  if (!candidate.phone) {
    return { eligible: false, reason: "no_phone", detail: "No phone number on file." };
  }

  const normalizedPhone = normalizePhoneForWhatsApp(candidate.phone);
  if (!normalizedPhone) {
    return { eligible: false, reason: "invalid_phone", detail: "Phone number couldn't be confirmed as valid." };
  }

  const consent = hasSufficientConsent(lead, candidate);
  if (!consent.eligible) return consent;

  if (!hasDelayElapsed(candidate, automation.delay_minutes, now)) {
    return { eligible: false, reason: "delay_not_elapsed", detail: "Still waiting out the configured delay." };
  }

  if (!isWithinBusinessHours(now)) {
    return {
      eligible: false,
      reason: "outside_business_hours",
      detail: "Outside business hours — will run in the next allowed window.",
    };
  }

  // Reuses Phase 12's exact cooldown + unanswered-reply logic rather than
  // re-deriving it — an automation must never re-contact someone Phase 12
  // itself would currently consider ineligible to recommend.
  if (outreachContext) {
    const opportunityLike = { customerPhone: candidate.phone } as Parameters<typeof isEligibleToday>[0];
    const eligibleToday = isEligibleToday(opportunityLike, outreachContext, now);
    if (!eligibleToday) {
      const reason = outreachContext.hasUnansweredReply ? "unanswered_reply" : "recently_contacted";
      return {
        eligible: false,
        reason,
        detail:
          reason === "unanswered_reply"
            ? "They replied and haven't been responded to yet — needs a human reply."
            : "Already contacted recently — waiting out the cooldown.",
      };
    }
  }

  if (params.dailyCountForBusiness >= MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY) {
    return {
      eligible: false,
      reason: "daily_limit_reached",
      detail: "Today's automated message limit for this business was reached.",
    };
  }

  if (params.monthlyCountForCustomerOrLead >= MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS) {
    return {
      eligible: false,
      reason: "customer_limit_reached",
      detail: "This person has already received the maximum automated messages this month.",
    };
  }

  if (automation.action_type === "send_whatsapp") {
    if (!automation.message_template) {
      return { eligible: false, reason: "missing_template", detail: "No approved message is set up yet." };
    }

    const connection = await getWhatsAppConnection(automation.business_id, params.supabase);
    if (!connection) {
      return { eligible: false, reason: "whatsapp_not_connected", detail: "WhatsApp isn't connected yet." };
    }

    const duplicate = await findRecentDuplicateMessage(
      automation.business_id,
      candidate.leadId ? { leadId: candidate.leadId } : { customerId: candidate.customerId as string },
      automation.message_template,
      params.supabase
    );
    if (duplicate) {
      return {
        eligible: false,
        reason: "conflicting_active_message",
        detail: "Another message to this person is already in progress.",
      };
    }
  }

  return { eligible: true };
}
