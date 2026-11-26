/**
 * Phase 14 — the automation engine's core run loop. Given one active
 * automation, finds its candidates, checks every safety gate, and — only
 * for a `send_whatsapp` automation whose candidate passes every gate —
 * sends via the exact same reused WhatsApp path every other Reelo message
 * already goes through (`decideSendMode` / `dispatchWhatsAppMessage` /
 * `reserveWhatsAppMessage` / `markMessageSent` / `markMessageFailed`).
 *
 * ALWAYS called with the service-role admin client (see
 * `lib/supabase/admin.ts`) — this code runs from the scheduler, outside any
 * signed-in request context, so the request-scoped `createClient()` would
 * silently return empty results under RLS. Never pass anything else in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomer } from "@/lib/customers/queries";
import { getLead, markLeadContacted } from "@/lib/leads/queries";
import {
  reserveWhatsAppMessage,
  getActiveWhatsAppConnection,
  markMessageFailed,
  markMessageSent,
} from "@/lib/whatsapp/queries";
import { decideSendMode, dispatchWhatsAppMessage } from "@/lib/whatsapp/send";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { getOutreachContextForBusiness, deriveOutreachContextFromTimeline } from "@/lib/recommendations/utils";
import { getCommunicationTimelineForLead } from "@/lib/whatsapp/queries";
import type { BusinessRow, LeadRow } from "@/types/database";
import { checkCandidateEligibility } from "./eligibility";
import { personalizeAutomationMessage } from "./template";
import { findCandidatesForAutomation } from "./triggers";
import {
  countAutomatedMessagesSentLast30DaysForRecipient,
  countAutomatedMessagesSentTodayForBusiness,
  hasAlreadySentForEntityEventKey,
} from "./safety";
import { recordAutomationRun, stampAutomationLastRunAt } from "./queries";
import { getRemainingWhatsAppMessageQuota, getWhatsAppReservationContext } from "@/lib/billing/limits";
import { AUTOMATION_OPPORTUNITY_TYPE_PREFIX, MAX_AUTOMATION_CANDIDATES_PER_TICK } from "./constants";
import type { AutomationCandidate, AutomationRow, AutomationRunOutcome } from "./types";

/** Reasons that describe a candidate simply not being due YET (a delay
 * still counting down, or outside business hours). These are NOT written
 * as audit rows — the stateless, idempotent re-evaluation on the next tick
 * naturally produces the correct eventual outcome once conditions change,
 * so logging them would just be repeated noise for the same candidate on
 * every single tick until it's finally due (see the Phase 14 design notes
 * on Edge Case 1: a 2am lead with a 10-minute delay). */
const TRANSIENT_REASONS = new Set(["delay_not_elapsed", "outside_business_hours"]);

async function resolveLeadAndCustomerName(
  candidate: AutomationCandidate,
  businessId: string,
  supabase: SupabaseClient
): Promise<{ lead: LeadRow | null; customerName: string | null }> {
  if (candidate.leadId) {
    const lead = await getLead(businessId, candidate.leadId, supabase);
    return { lead, customerName: null };
  }
  if (candidate.customerId) {
    const customer = await getCustomer(businessId, candidate.customerId);
    return { lead: null, customerName: customer?.name ?? null };
  }
  return { lead: null, customerName: null };
}

/** Runs one active automation for one business: finds candidates, checks
 * every safety gate, sends (or records why it didn't), and returns a
 * per-candidate outcome list for logging/reporting. */
export async function runAutomationOnce(
  automation: AutomationRow,
  business: BusinessRow,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<AutomationRunOutcome[]> {
  const outcomes: AutomationRunOutcome[] = [];

  const candidates = (
    await findCandidatesForAutomation(automation.automation_type, business, supabase, now)
  ).slice(0, MAX_AUTOMATION_CANDIDATES_PER_TICK);

  if (candidates.length === 0) return outcomes;

  // Batched once per tick, not per candidate — same N+1 avoidance principle
  // as Phase 12's own dailyRecommendations.ts.
  const outreachContextByCustomer = await getOutreachContextForBusiness(business.id, supabase);
  // A running, in-memory count for THIS tick, seeded from the real DB
  // count and incremented after every successful send within the loop —
  // otherwise a single tick processing many candidates could blow past
  // the daily cap before any of those sends were reflected in a fresh
  // DB count. The DB count itself remains the source of truth across ticks.
  let sentTodayCount = await countAutomatedMessagesSentTodayForBusiness(business.id, supabase, now);
  // Phase 16 — the WhatsApp send quota is shared across every send path
  // (customer, lead, campaign, automation); seeded once per tick and
  // decremented locally for the same reason `sentTodayCount` is, then
  // re-verified for real by `assertCanSendWhatsAppMessage` right before
  // each actual dispatch (belt-and-suspenders against a stale in-memory
  // count under concurrent activity).
  let whatsappQuotaRemaining = await getRemainingWhatsAppMessageQuota(business.id, supabase);
  const reservationContext = await getWhatsAppReservationContext(business.id, supabase);

  for (const candidate of candidates) {
    // Fast, cheap duplicate check first — a candidate this automation has
    // already successfully sent for needs no further work at all.
    const alreadySent = await hasAlreadySentForEntityEventKey(automation.id, candidate.entityEventKey, supabase);
    if (alreadySent) continue;

    const { lead, customerName } = await resolveLeadAndCustomerName(candidate, business.id, supabase);

    const outreachContext = candidate.customerId
      ? outreachContextByCustomer.get(candidate.customerId)
      : candidate.leadId
        ? deriveOutreachContextFromTimeline(await getCommunicationTimelineForLead(candidate.leadId))
        : undefined;

    const monthlyCountForCustomerOrLead = await countAutomatedMessagesSentLast30DaysForRecipient(
      business.id,
      candidate.leadId ? { leadId: candidate.leadId } : { customerId: candidate.customerId as string },
      supabase,
      now
    );

    const eligibility = await checkCandidateEligibility({
      automation,
      candidate,
      lead,
      outreachContext,
      businessAutomationsPausedAt: business.automations_paused_at,
      dailyCountForBusiness: sentTodayCount,
      monthlyCountForCustomerOrLead,
      now,
      supabase,
    });

    if (!eligibility.eligible) {
      if (!TRANSIENT_REASONS.has(eligibility.reason)) {
        await recordAutomationRun(
          {
            automationId: automation.id,
            businessId: business.id,
            leadId: candidate.leadId,
            customerId: candidate.customerId,
            entityEventKey: candidate.entityEventKey,
            status: "skipped",
            reason: eligibility.detail,
          },
          supabase
        );
      }
      outcomes.push({ candidate, status: "skipped", reason: eligibility.detail, messageId: null });
      continue;
    }

    // Mode A ("create a recommendation, owner reviews and sends"): Phase 12
    // already surfaces this exact opportunity as a recommendation on the
    // dashboard — there is nothing further for the engine to DO. No audit
    // row is written here since no automated action was taken; enabling
    // this automation type is a configuration choice, not an executable
    // step.
    if (automation.action_type === "create_recommendation") {
      outcomes.push({ candidate, status: "eligible", reason: null, messageId: null });
      continue;
    }

    // From here on: action_type === "send_whatsapp", and every safety gate
    // (including message_template/WhatsApp-connection presence) has passed.
    const normalizedPhone = normalizePhoneForWhatsApp(candidate.phone as string);
    const content = personalizeAutomationMessage(automation.message_template as string, {
      businessName: business.name,
      customerName: customerName ?? candidate.templateContext.customerName,
      leadName: candidate.templateContext.leadName,
      interest: candidate.templateContext.interest,
      reminderLabel: candidate.templateContext.reminderLabel,
    });

    // Phase 16 — a plan's WhatsApp allowance ran out mid-tick: skip every
    // remaining send-eligible candidate with a clear, auditable reason
    // rather than silently dropping them or bursting past the limit. This
    // local counter is an optimization only (skip the round trip once we
    // already know we're empty) — the atomic reservation below is the
    // real, race-safe enforcement (Phase 19 finding: a stale in-memory
    // count can't stop a concurrent scheduler tick from also passing).
    if (whatsappQuotaRemaining <= 0) {
      await recordAutomationRun(
        {
          automationId: automation.id,
          businessId: business.id,
          leadId: candidate.leadId,
          customerId: candidate.customerId,
          entityEventKey: candidate.entityEventKey,
          status: "skipped",
          reason: "Your plan's WhatsApp message limit was reached for this billing period.",
        },
        supabase
      );
      outcomes.push({ candidate, status: "skipped", reason: "billing_limit_reached", messageId: null });
      continue;
    }

    if (!reservationContext) {
      await recordAutomationRun(
        {
          automationId: automation.id,
          businessId: business.id,
          leadId: candidate.leadId,
          customerId: candidate.customerId,
          entityEventKey: candidate.entityEventKey,
          status: "skipped",
          reason: "This business's billing couldn't be verified.",
        },
        supabase
      );
      outcomes.push({ candidate, status: "skipped", reason: "billing_unverified", messageId: null });
      continue;
    }

    // Phase 19 — the duplicate-send check, the WhatsApp quota check, and
    // the message insert are one atomic, database-locked reservation
    // (see reserveWhatsAppMessage's own comment), so two scheduler ticks
    // running concurrently — or a concurrent manual send to the same
    // person — can never both create a message row for the same send.
    const reservation = await reserveWhatsAppMessage(
      {
        businessId: business.id,
        customerId: candidate.customerId,
        leadId: candidate.leadId,
        opportunityType: `${AUTOMATION_OPPORTUNITY_TYPE_PREFIX}${automation.automation_type}`,
        messageType: decideSendMode().messageType,
        templateName: decideSendMode().templateName,
        content,
        periodStart: reservationContext.periodStart,
        limit: reservationContext.limit,
      },
      supabase
    );

    if (!reservation) {
      await recordAutomationRun(
        {
          automationId: automation.id,
          businessId: business.id,
          leadId: candidate.leadId,
          customerId: candidate.customerId,
          entityEventKey: candidate.entityEventKey,
          status: "skipped",
          reason: "Your plan's WhatsApp message limit was reached for this billing period.",
        },
        supabase
      );
      outcomes.push({ candidate, status: "skipped", reason: "billing_limit_reached", messageId: null });
      whatsappQuotaRemaining = 0;
      continue;
    }

    if (!reservation.isNewReservation) {
      await recordAutomationRun(
        {
          automationId: automation.id,
          businessId: business.id,
          leadId: candidate.leadId,
          customerId: candidate.customerId,
          entityEventKey: candidate.entityEventKey,
          status: "skipped",
          reason: "Another message to this person is already in progress.",
        },
        supabase
      );
      outcomes.push({ candidate, status: "skipped", reason: "duplicate", messageId: null });
      continue;
    }

    const messageRecord = reservation.message;

    const connection = await getActiveWhatsAppConnection(business.id, supabase);
    const phoneNumberId = connection?.phone_number_id ?? "";
    const recipientFirstName = (
      customerName ?? candidate.templateContext.customerName ?? candidate.templateContext.leadName ?? "there"
    ).split(" ")[0];

    try {
      const result = await dispatchWhatsAppMessage({
        phoneNumberId,
        to: normalizedPhone as string,
        content,
        customerFirstName: recipientFirstName,
        businessName: business.name,
        decision: decideSendMode(),
      });

      if (result.ok) {
        await markMessageSent(messageRecord.id, result.providerMessageId, supabase);
        if (candidate.leadId) await markLeadContacted(business.id, candidate.leadId, supabase);
        sentTodayCount += 1;
        whatsappQuotaRemaining -= 1;

        const run = await recordAutomationRun(
          {
            automationId: automation.id,
            businessId: business.id,
            leadId: candidate.leadId,
            customerId: candidate.customerId,
            messageId: messageRecord.id,
            entityEventKey: candidate.entityEventKey,
            status: "sent",
          },
          supabase
        );
        outcomes.push({ candidate, status: "sent", reason: null, messageId: run.message_id });
      } else {
        await markMessageFailed(messageRecord.id, result.error, supabase);
        await recordAutomationRun(
          {
            automationId: automation.id,
            businessId: business.id,
            leadId: candidate.leadId,
            customerId: candidate.customerId,
            messageId: messageRecord.id,
            entityEventKey: candidate.entityEventKey,
            status: "failed",
            reason: "The message couldn't be delivered. See the message's own error for details.",
          },
          supabase
        );
        outcomes.push({ candidate, status: "failed", reason: result.error, messageId: messageRecord.id });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error while sending.";
      await markMessageFailed(messageRecord.id, message, supabase);
      await recordAutomationRun(
        {
          automationId: automation.id,
          businessId: business.id,
          leadId: candidate.leadId,
          customerId: candidate.customerId,
          messageId: messageRecord.id,
          entityEventKey: candidate.entityEventKey,
          status: "failed",
          reason: "The message couldn't be delivered.",
        },
        supabase
      );
      outcomes.push({ candidate, status: "failed", reason: message, messageId: messageRecord.id });
    }
  }

  if (outcomes.length > 0) {
    await stampAutomationLastRunAt(automation.id, supabase, now);
  }

  return outcomes;
}
