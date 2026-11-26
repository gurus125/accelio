/**
 * Phase 16's chokepoint, in the same spirit as Phase 15's
 * `getBusinessForCurrentUser()`: every part of the app that needs to know
 * "what's this business's billing state, right now" goes through
 * `getBillingSnapshotForBusiness` — never a raw `subscriptions` table
 * read. That's what makes it safe to change how effective status is
 * computed, or add a new status, in exactly one place.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionRow, SubscriptionStatus } from "@/types/database";
import { DEFAULT_PLAN_ID, getPlan, type PlanId } from "./plans";
import type { BillingSnapshot } from "./types";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";

/**
 * Idempotently creates a Free subscription row for a brand-new business.
 * Free is a permanent plan — no trial dates, no expiry, no card, and no
 * Razorpay involvement at all. A business simply stays on it until it
 * chooses to upgrade. Always uses the admin client — `subscriptions`
 * intentionally has no authenticated-role insert policy at all (see the
 * billing migration), so this is the ONLY code path that ever creates
 * one. Called once, right after `ensureBusinessForCurrentUser` creates
 * the business row itself.
 */
export async function ensureFreeSubscriptionForBusiness(businessId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("business_id", businessId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return; // already provisioned — nothing to do.

  const { error } = await admin.from("subscriptions").insert({
    business_id: businessId,
    plan_id: DEFAULT_PLAN_ID,
    status: "active",
  });

  if (error) {
    // A unique-violation (23505) means a concurrent request already
    // provisioned it — fine, not a real error (same tolerance
    // `ensureBusinessForCurrentUser` already applies to its own insert).
    if (error.code === "23505") return;
    throw new Error(error.message);
  }
}

/**
 * The stored `status` column only changes when a webhook or an owner
 * action actually runs. Time keeps moving in between, so the EFFECTIVE
 * status recomputes what that stored value implies right now:
 *  - a trial whose `trial_ends_at` has passed is effectively "expired",
 *    even though nothing has gone back to flip the row (no cron exists or
 *    is needed for this — every read recomputes it fresh);
 *  - a cancel-at-period-end subscription whose `current_period_end` has
 *    passed is effectively "cancelled" (access ends), even if Razorpay's
 *    own `subscription.cancelled` webhook is still in flight;
 *  - everything else (active, past_due, and an already-cancelled/expired
 *    row) is exactly what it says.
 */
export function computeEffectiveStatus(subscription: SubscriptionRow, now: Date = new Date()): SubscriptionStatus {
  if (subscription.status === "trial") {
    if (subscription.trial_ends_at && new Date(subscription.trial_ends_at) <= now) {
      return "expired";
    }
    return "trial";
  }

  if (subscription.status === "active" || subscription.status === "past_due") {
    if (subscription.current_period_end && new Date(subscription.current_period_end) <= now) {
      return subscription.cancel_at_period_end ? "cancelled" : "expired";
    }
    return subscription.status;
  }

  return subscription.status;
}

function toSnapshot(subscription: SubscriptionRow, now: Date): BillingSnapshot {
  const effectiveStatus = computeEffectiveStatus(subscription, now);
  const trialDaysRemaining =
    effectiveStatus === "trial" && subscription.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : null;

  return {
    subscription,
    plan: getPlan(subscription.plan_id as PlanId),
    effectiveStatus,
    trialDaysRemaining,
    isInGoodStanding: effectiveStatus === "trial" || effectiveStatus === "active" || effectiveStatus === "past_due",
  };
}

/**
 * Reads one business's billing snapshot. Accepts an optional Supabase
 * client so callers with no user session (the webhook, the scheduler) can
 * pass the admin client, while every normal request-scoped caller uses the
 * default RLS-scoped one — same pattern `runAutomationOnce` uses for the
 * automation engine.
 */
export async function getBillingSnapshotForBusiness(
  businessId: string,
  supabase?: SupabaseClient
): Promise<BillingSnapshot | null> {
  const client = supabase ?? createClient();
  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return toSnapshot(data as SubscriptionRow, new Date());
}

/** Convenience wrapper for the common case: the current signed-in user's
 * own business. Throws the same way `requireBusinessForCurrentUser` does
 * if there's no signed-in business at all. */
export async function getBillingSnapshotForCurrentUser(): Promise<BillingSnapshot | null> {
  const business = await requireBusinessForCurrentUser();
  return getBillingSnapshotForBusiness(business.id);
}
