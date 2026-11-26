/**
 * Pre-flight enforcement — every one of these is called and awaited
 * BEFORE the underlying paid action runs (before the OpenAI call, before
 * the Meta send, before the row insert), never after. Each throws a plain,
 * user-safe `Error` on the same convention every server action in this
 * codebase already uses (`requireOwner`, `requireStaffOrOwner`): caught at
 * the call site and turned into `{ error }`, never a raw stack trace.
 *
 * Never trusts a client-supplied business id, plan, or price — every
 * check re-derives the business's real plan and real current usage
 * server-side from the authenticated session (or, for the automation
 * scheduler's case, from the business row it already resolved server-side
 * from the DB — see `automations/executor.ts`, which passes its own
 * admin-client `supabase` through the WhatsApp-limit functions below,
 * since the scheduler has no signed-in user for the default RLS-scoped
 * client to key off).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_STAFF_PER_BUSINESS } from "@/lib/team/constants";
import { getBillingSnapshotForBusiness } from "./subscription";
import { PLAN_ORDER, getPlan, type PlanId } from "./plans";
import {
  countActiveAutomations,
  countAiGenerationsSince,
  countCampaignsCreatedSince,
  countCustomersForBusiness,
  countStaffSeatsUsed,
  countWhatsAppMessagesSince,
  recordAiGeneration,
  releaseAiGeneration,
  reserveAiGeneration,
  resolvePeriodStart,
} from "./usage";
import type { BillingSnapshot } from "./types";

export { recordAiGeneration, reserveAiGeneration, releaseAiGeneration };

/** The next plan up from `planId` in `PLAN_ORDER` (free -> starter ->
 * growth), or `null` if already on the top plan. Used only to phrase a
 * limit-reached message as "Upgrade to Starter" / "Upgrade to Growth"
 * instead of the vaguer "upgrade your plan" — the exact copy the product
 * spec calls for on the Free plan, generalized so Starter also points
 * users at Growth. */
function nextPlanName(planId: PlanId): string | null {
  const index = PLAN_ORDER.indexOf(planId);
  const next = PLAN_ORDER[index + 1];
  return next ? getPlan(next).name : null;
}

function upgradeCta(planId: PlanId): string {
  const next = nextPlanName(planId);
  return next ? `Upgrade to ${next}.` : "Upgrade your plan.";
}

async function requireGoodStanding(businessId: string, supabase?: SupabaseClient): Promise<BillingSnapshot> {
  const snapshot = await getBillingSnapshotForBusiness(businessId, supabase);
  // No subscription row at all should never happen post-`ensureFreeSubscriptionForBusiness`,
  // but if it somehow does, fail closed (block) rather than silently
  // allowing unlimited use — the same "fail closed" principle the
  // automation scheduler's CRON_SECRET already documents.
  if (!snapshot) {
    throw new Error("Your business's billing couldn't be verified. Please contact support.");
  }
  if (!snapshot.isInGoodStanding) {
    throw new Error(
      snapshot.effectiveStatus === "cancelled"
        ? "Your subscription has ended. Visit Billing to resubscribe."
        : "Your subscription needs attention. Visit Billing to continue."
    );
  }
  return snapshot;
}

export async function assertCanAddCustomer(businessId: string): Promise<void> {
  const snapshot = await requireGoodStanding(businessId);
  const limit = snapshot.plan.limits.maxCustomers;
  if (limit === null) return;
  const used = await countCustomersForBusiness(businessId);
  if (used >= limit) {
    throw new Error(`Your ${snapshot.plan.name} plan supports up to ${limit} customers. ${upgradeCta(snapshot.plan.id)}`);
  }
}

/** For a bulk operation (CSV import) that wants to insert as many rows as
 * safely fit rather than fail the whole batch — `null` means unlimited. */
export async function getRemainingCustomerQuota(businessId: string): Promise<number | null> {
  const snapshot = await getBillingSnapshotForBusiness(businessId);
  if (!snapshot || !snapshot.isInGoodStanding) return 0;
  const limit = snapshot.plan.limits.maxCustomers;
  if (limit === null) return null;
  const used = await countCustomersForBusiness(businessId);
  return Math.max(0, limit - used);
}

/** Reuses Phase 15's exact staff-seat counting (`countStaffSeatsUsed`) —
 * only the limit it's compared against is new (plan-driven instead of the
 * old flat constant). `MAX_STAFF_PER_BUSINESS` still applies as an
 * absolute product ceiling underneath any plan, exactly as its own
 * comment always said it would. */
export async function assertCanAddStaffSeat(businessId: string): Promise<void> {
  const snapshot = await requireGoodStanding(businessId);
  const limit = Math.min(snapshot.plan.limits.maxStaff, MAX_STAFF_PER_BUSINESS);
  const used = await countStaffSeatsUsed(businessId);
  if (used >= limit) {
    throw new Error(`Your ${snapshot.plan.name} plan supports up to ${limit} staff member${limit === 1 ? "" : "s"}. ${upgradeCta(snapshot.plan.id)}`);
  }
}

/** The actual staff-seat ceiling in effect right now (plan limit, capped
 * by the product-wide `MAX_STAFF_PER_BUSINESS` safety default) — for
 * display (the Team page's "X/Y staff seats used" subtitle), not
 * enforcement. Falls back to the plain product ceiling if billing can't
 * be read for any reason, so the Team page never crashes over it. */
export async function getEffectiveStaffLimit(businessId: string): Promise<number> {
  try {
    const snapshot = await getBillingSnapshotForBusiness(businessId);
    if (!snapshot) return MAX_STAFF_PER_BUSINESS;
    return Math.min(snapshot.plan.limits.maxStaff, MAX_STAFF_PER_BUSINESS);
  } catch {
    return MAX_STAFF_PER_BUSINESS;
  }
}

export async function assertCanGenerateAiMessage(businessId: string): Promise<void> {
  const snapshot = await requireGoodStanding(businessId);
  const periodStart = resolvePeriodStart(snapshot.subscription);
  const used = await countAiGenerationsSince(businessId, periodStart);
  if (used >= snapshot.plan.limits.maxAiGenerationsPerMonth) {
    throw new Error(
      `You've used all ${snapshot.plan.limits.maxAiGenerationsPerMonth} AI message generations included in your ${snapshot.plan.name} plan. ${upgradeCta(snapshot.plan.id)}`
    );
  }
}

/**
 * `additional` lets a bulk sender (a campaign about to dispatch N
 * messages) ask "is there room for N more" up front, without needing N
 * separate round-trips. `supabase`, when passed, is used instead of the
 * default RLS-scoped client — the automation scheduler runs with no
 * signed-in user, so it passes its own admin client through here.
 */
export async function assertCanSendWhatsAppMessage(
  businessId: string,
  additional = 1,
  supabase?: SupabaseClient
): Promise<void> {
  const snapshot = await requireGoodStanding(businessId, supabase);
  const periodStart = resolvePeriodStart(snapshot.subscription);
  const used = await countWhatsAppMessagesSince(businessId, periodStart, supabase);
  if (used + additional > snapshot.plan.limits.maxWhatsappMessagesPerMonth) {
    throw new Error(
      `You've used all ${snapshot.plan.limits.maxWhatsappMessagesPerMonth} WhatsApp messages included in your ${snapshot.plan.name} plan this month. ${upgradeCta(snapshot.plan.id)}`
    );
  }
}

/** Returns how many more WhatsApp sends are allowed this period without
 * throwing — for a bulk sender (campaign send loop, or the automation
 * scheduler tracking its own running count across many candidates in one
 * tick) that wants to send as many as it safely can and stop cleanly,
 * rather than all-or-nothing. */
export async function getRemainingWhatsAppMessageQuota(businessId: string, supabase?: SupabaseClient): Promise<number> {
  const snapshot = await getBillingSnapshotForBusiness(businessId, supabase);
  if (!snapshot || !snapshot.isInGoodStanding) return 0;
  const periodStart = resolvePeriodStart(snapshot.subscription);
  const used = await countWhatsAppMessagesSince(businessId, periodStart, supabase);
  return Math.max(0, snapshot.plan.limits.maxWhatsappMessagesPerMonth - used);
}

/**
 * Phase 19 hardening — the period start + numeric limit a caller needs to
 * make an ATOMIC reservation via `reserveWhatsAppMessage`
 * (`@/lib/whatsapp/queries`), which does its own count-and-insert
 * under a database lock rather than trusting a pre-computed "remaining"
 * count the way `getRemainingWhatsAppMessageQuota` above does. Returns
 * `null` when the business isn't in good standing at all — the caller
 * should treat that exactly like a quota of zero.
 */
export async function getWhatsAppReservationContext(
  businessId: string,
  supabase?: SupabaseClient
): Promise<{ periodStart: Date; limit: number } | null> {
  const snapshot = await getBillingSnapshotForBusiness(businessId, supabase);
  if (!snapshot || !snapshot.isInGoodStanding) return null;
  return {
    periodStart: resolvePeriodStart(snapshot.subscription),
    limit: snapshot.plan.limits.maxWhatsappMessagesPerMonth,
  };
}

/** Same idea as `getWhatsAppReservationContext`, for AI generations. */
export async function getAiGenerationReservationContext(
  businessId: string
): Promise<{ periodStart: Date; limit: number } | null> {
  const snapshot = await getBillingSnapshotForBusiness(businessId);
  if (!snapshot || !snapshot.isInGoodStanding) return null;
  return {
    periodStart: resolvePeriodStart(snapshot.subscription),
    limit: snapshot.plan.limits.maxAiGenerationsPerMonth,
  };
}

export async function assertCanCreateCampaign(businessId: string): Promise<void> {
  const snapshot = await requireGoodStanding(businessId);
  const periodStart = resolvePeriodStart(snapshot.subscription);
  const used = await countCampaignsCreatedSince(businessId, periodStart);
  if (used >= snapshot.plan.limits.maxCampaignsPerMonth) {
    throw new Error(
      `Your ${snapshot.plan.name} plan includes ${snapshot.plan.limits.maxCampaignsPerMonth} campaign${snapshot.plan.limits.maxCampaignsPerMonth === 1 ? "" : "s"} per month, and you've reached that limit. ${upgradeCta(snapshot.plan.id)}`
    );
  }
}

export async function assertCanActivateAutomation(businessId: string): Promise<void> {
  const snapshot = await requireGoodStanding(businessId);
  const used = await countActiveAutomations(businessId);
  if (used >= snapshot.plan.limits.maxActiveAutomations) {
    throw new Error(
      `Your ${snapshot.plan.name} plan includes ${snapshot.plan.limits.maxActiveAutomations} active automation${snapshot.plan.limits.maxActiveAutomations === 1 ? "" : "s"}. Pause another one, or ${upgradeCta(snapshot.plan.id).toLowerCase()}`
    );
  }
}
