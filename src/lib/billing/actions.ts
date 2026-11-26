"use server";

/**
 * Every billing-management action is owner-only (`requireOwner()`) even
 * though `subscriptions`/`billing_events` are readable by any active
 * business member — reading your plan/status to understand why an action
 * was blocked is not the same as being able to change what's paid for.
 * Staff hitting any of these (there's no UI path for them to, but this is
 * the real security boundary, not the UI) get the exact same friendly
 * denial `requireOwner()` already gives everywhere else in the app.
 *
 * Nothing here ever accepts a client-supplied price, plan limit, or
 * business id — the plan is looked up server-side from `lib/billing/plans.ts`
 * by id only, and the business always comes from the authenticated
 * session via `requireOwner()`.
 */

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingSnapshotForBusiness } from "./subscription";
import { isPaidPlanId, isPlanId, PLANS, type PlanId } from "./plans";
export { isPlanId };
import { isRazorpayConfigured, razorpayEnv, razorpayPublicKeyId } from "./config";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  verifyCheckoutSignature,
} from "./razorpay";
import {
  countActiveAutomations,
  countCustomersForBusiness,
  countStaffSeatsUsed,
} from "./usage";
import type { SubscriptionRow } from "@/types/database";

function razorpayPlanIdFor(planId: PlanId): string {
  if (planId === "starter") return razorpayEnv.planIdStarter;
  if (planId === "growth") return razorpayEnv.planIdGrowth;
  return ""; // Free never has a Razorpay plan — it's never checked out.
}

export interface StartCheckoutResult {
  error?: string;
  checkout?: {
    razorpayKeyId: string;
    razorpaySubscriptionId: string;
    planId: PlanId;
    planName: string;
    amountInPaise: number;
  };
}

/**
 * Creates a Razorpay Subscription object for the given plan and hands the
 * browser just enough to open Razorpay Checkout — never the key secret,
 * never a price the browser could have tampered with (the amount shown
 * comes from `PLANS`, looked up by `planId` alone).
 *
 * `scheduledStartAt`, when passed by `changePlan` below, defers the first
 * charge to a future date (Razorpay's own `start_at` parameter) so a plan
 * change made mid-cycle doesn't double-charge — the new plan's billing
 * starts exactly when the old one's current period ends.
 */
export async function startCheckoutForPlan(planId: string, scheduledStartAt?: string): Promise<StartCheckoutResult> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  if (!isPlanId(planId)) return { error: "That plan doesn't exist." };
  if (!isPaidPlanId(planId)) {
    return { error: "The Free plan doesn't need checkout — it's free forever." };
  }
  if (!isRazorpayConfigured || !razorpayPublicKeyId) {
    return { error: "Online payment isn't configured yet. Please contact support." };
  }

  const razorpayPlanId = razorpayPlanIdFor(planId);
  if (!razorpayPlanId) {
    return { error: "This plan isn't available for checkout yet. Please contact support." };
  }

  const snapshot = await getBillingSnapshotForBusiness(membership.business.id);
  if (
    !scheduledStartAt &&
    snapshot?.subscription.provider_subscription_id &&
    (snapshot.effectiveStatus === "active" || snapshot.effectiveStatus === "past_due")
  ) {
    return { error: "You already have an active subscription. Use “Change plan” instead." };
  }

  const result = await createRazorpaySubscription({
    razorpayPlanId,
    businessId: membership.business.id,
    notifyCustomerEmail: null,
    ...(scheduledStartAt ? { startAt: Math.floor(new Date(scheduledStartAt).getTime() / 1000) } : {}),
  });

  if (!result.ok) return { error: result.error };

  return {
    checkout: {
      razorpayKeyId: razorpayPublicKeyId,
      razorpaySubscriptionId: result.data.id,
      planId,
      planName: PLANS[planId].name,
      amountInPaise: PLANS[planId].priceInPaise,
    },
  };
}

export interface VerifyCheckoutInput {
  planId: string;
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}

/**
 * Called by the client the instant Razorpay Checkout's own success
 * handler fires — before that, nothing about this "payment" is trusted.
 * The signature check is the entire security boundary here: a forged
 * client-side call with made-up ids fails it and nothing is ever written.
 */
export async function verifyCheckoutPayment(input: VerifyCheckoutInput): Promise<{ error?: string }> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  if (!isPlanId(input.planId)) return { error: "That plan doesn't exist." };

  const validSignature = verifyCheckoutSignature({
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    razorpaySignature: input.razorpaySignature,
  });

  if (!validSignature) {
    console.error("[billing/actions] Rejected checkout verification with invalid signature.", {
      businessId: membership.business.id,
    });
    return { error: "We couldn't verify that payment. If you were charged, contact support." };
  }

  // Pull the real period dates from Razorpay itself rather than trusting
  // anything computed client-side.
  const fetched = await fetchRazorpaySubscription(input.razorpaySubscriptionId);

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      plan_id: input.planId,
      provider: "razorpay",
      provider_subscription_id: input.razorpaySubscriptionId,
      status: "active",
      cancel_at_period_end: false,
      cancelled_at: null,
      current_period_start:
        fetched.ok && fetched.data.current_start ? new Date(fetched.data.current_start * 1000).toISOString() : null,
      current_period_end:
        fetched.ok && fetched.data.current_end ? new Date(fetched.data.current_end * 1000).toISOString() : null,
    })
    .eq("business_id", membership.business.id);

  if (error) return { error: "Payment was verified, but we couldn't update your account. Please contact support." };

  await admin.from("billing_events").insert({
    business_id: membership.business.id,
    provider_event_id: `checkout:${input.razorpaySubscriptionId}:${input.razorpayPaymentId}`,
    event_type: "checkout.verified",
    payload: { planId: input.planId, razorpaySubscriptionId: input.razorpaySubscriptionId },
    processed_at: new Date().toISOString(),
  });

  revalidatePath("/billing");
  revalidatePath("/dashboard");
  return {};
}

/** Downgrade/plan-change safety: never let a change take effect while the
 * business's CURRENT usage already exceeds the target plan's limits. The
 * data itself is never touched either way — this only blocks the plan
 * change until the owner reduces usage (or the owner can stay put). */
async function describeWhatBlocksDowngrade(businessId: string, targetPlanId: PlanId): Promise<string | null> {
  const target = PLANS[targetPlanId];
  const [customers, staff, activeAutomations] = await Promise.all([
    countCustomersForBusiness(businessId),
    countStaffSeatsUsed(businessId),
    countActiveAutomations(businessId),
  ]);

  const problems: string[] = [];
  if (target.limits.maxCustomers !== null && customers > target.limits.maxCustomers) {
    problems.push(`you have ${customers} customers, the ${target.name} plan allows ${target.limits.maxCustomers}`);
  }
  if (staff > target.limits.maxStaff) {
    problems.push(`you have ${staff} staff members, the ${target.name} plan allows ${target.limits.maxStaff}`);
  }
  if (activeAutomations > target.limits.maxActiveAutomations) {
    problems.push(
      `you have ${activeAutomations} active automations, the ${target.name} plan allows ${target.limits.maxActiveAutomations}`
    );
  }

  if (problems.length === 0) return null;
  return `Switching to ${target.name} would put you over its limits: ${problems.join("; ")}. Reduce these first, or stay on your current plan.`;
}

export interface ChangePlanResult {
  error?: string;
  /** Set when Razorpay Checkout must run to authorize the new plan (see
   * `startCheckoutForPlan`'s `scheduledStartAt`) — the UI opens Checkout
   * using this. `scheduledStartAt: null` means "bill today" (a Free ->
   * paid upgrade, nothing to wait out); a timestamp means "start exactly
   * when the current paid period ends" (a paid -> paid switch). */
  checkoutNeeded?: { planId: PlanId; scheduledStartAt: string | null };
  /** Set when the change was applied without any checkout — either an
   * instant move onto Free (nothing was ever paid), or a downgrade to
   * Free scheduled for the end of an already-paid period. */
  applied?: boolean;
  /** Human-readable detail for an `applied` result, e.g. when a paid ->
   * Free downgrade is scheduled rather than immediate. */
  message?: string;
}

/**
 * Handles all three transition shapes with one code path:
 *  - Free -> paid (Starter/Growth): nothing to cancel, so the UI is told
 *    to open Checkout right away (`scheduledStartAt: null`).
 *  - paid -> paid (Starter <-> Growth): cancel the current Razorpay
 *    subscription at the end of its already-paid period, and hand the UI
 *    a scheduled Checkout for the new plan starting exactly then — never
 *    a mid-cycle double charge.
 *  - paid -> Free: cancel the current Razorpay subscription at the end of
 *    its already-paid period and mark `downgrade_to_plan_id: "free"`, so
 *    the webhook lands the business on Free (not a blocked "cancelled"
 *    state) the moment that cancellation actually completes. No
 *    checkout, ever — Free never talks to Razorpay.
 * `describeWhatBlocksDowngrade` runs before any of these to make sure the
 * account never lands somewhere its current usage would immediately
 * violate — existing data is never touched either way.
 */
export async function changePlan(planId: string): Promise<ChangePlanResult> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  if (!isPlanId(planId)) return { error: "That plan doesn't exist." };

  const snapshot = await getBillingSnapshotForBusiness(membership.business.id);
  if (!snapshot) return { error: "Your business's billing couldn't be found." };

  const currentPlanId = snapshot.subscription.plan_id as PlanId;
  // Genuinely a no-op only while the current plan is actually in good
  // standing. A business whose paid plan lapsed (cancelled/expired) can
  // still be sitting on that same `plan_id` in the row — clicking it
  // again there is a reactivation, not a no-op, and falls through to a
  // fresh checkout below rather than being rejected.
  if (snapshot.subscription.plan_id === planId && (planId === "free" || snapshot.isInGoodStanding)) {
    return { error: "You're already on this plan." };
  }

  const blocker = await describeWhatBlocksDowngrade(membership.business.id, planId);
  if (blocker) return { error: blocker };

  // A stored `provider_subscription_id` only counts as a LIVE Razorpay
  // subscription while the plan is actually in good standing — once
  // effective status is cancelled/expired, Razorpay's own subscription
  // has already ended regardless of what id is still on file, so there
  // is nothing left to cancel before offering a fresh checkout.
  const hasLiveRazorpaySubscription =
    isPaidPlanId(currentPlanId) && Boolean(snapshot.subscription.provider_subscription_id) && snapshot.isInGoodStanding;

  // Moving to Free.
  if (planId === "free") {
    const admin = createAdminClient();

    if (hasLiveRazorpaySubscription) {
      const cancelResult = await cancelRazorpaySubscription(snapshot.subscription.provider_subscription_id!, true);
      if (!cancelResult.ok) return { error: cancelResult.error };

      const { error } = await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: true, downgrade_to_plan_id: "free" })
        .eq("business_id", membership.business.id);
      if (error) return { error: "Couldn't schedule your downgrade. Please try again." };

      revalidatePath("/billing");
      return {
        applied: true,
        message: snapshot.subscription.current_period_end
          ? `You'll move to the Free plan on ${new Date(snapshot.subscription.current_period_end).toLocaleDateString("en-IN")}. Your current plan stays active — and your data stays intact — until then.`
          : "You'll move to the Free plan at the end of your current billing period. Your data stays intact.",
      };
    }

    // Nothing live to cancel (e.g. an incomplete/stale record) — apply
    // immediately, there's nothing to wait out.
    const { error } = await admin
      .from("subscriptions")
      .update({ plan_id: "free", status: "active", cancel_at_period_end: false, downgrade_to_plan_id: null })
      .eq("business_id", membership.business.id);
    if (error) return { error: "Couldn't change your plan. Please try again." };
    revalidatePath("/billing");
    return { applied: true };
  }

  // Moving from Free to a paid plan — no existing Razorpay subscription
  // to cancel, so Checkout can start right away, billing from today.
  if (!hasLiveRazorpaySubscription) {
    return { checkoutNeeded: { planId, scheduledStartAt: null } };
  }

  // Paid -> paid — cancel the current plan at the end of its already-paid
  // period, and hand the UI a scheduled checkout for the new plan
  // starting exactly then. Never cancels immediately and never touches
  // any business data.
  const cancelResult = await cancelRazorpaySubscription(snapshot.subscription.provider_subscription_id!, true);
  if (!cancelResult.ok) return { error: cancelResult.error };

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, downgrade_to_plan_id: null })
    .eq("business_id", membership.business.id);

  return {
    checkoutNeeded: { planId, scheduledStartAt: snapshot.subscription.current_period_end },
  };
}

export interface CancelSubscriptionResult {
  error?: string;
  effectiveUntil?: string | null;
}

/**
 * Always cancel-at-period-end — there is no immediate-cancellation button
 * in this app, matching the spec's required "remains active until
 * [date]" behavior. No business data is ever touched by this action, and
 * cancelling a paid plan never leaves the business fully locked out: it
 * schedules a soft landing on the permanent Free plan (via
 * `downgrade_to_plan_id`), the same as an explicit "downgrade to Free"
 * through `changePlan`.
 */
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const snapshot = await getBillingSnapshotForBusiness(membership.business.id);
  if (!snapshot) return { error: "Your business's billing couldn't be found." };

  const admin = createAdminClient();

  // Already on Free (or a stale record with nothing live at Razorpay) —
  // nothing to cancel. Just make sure the row is clean.
  if (!snapshot.subscription.provider_subscription_id) {
    const { error } = await admin
      .from("subscriptions")
      .update({ plan_id: "free", status: "active", cancel_at_period_end: false, cancelled_at: null, downgrade_to_plan_id: null })
      .eq("business_id", membership.business.id);
    if (error) return { error: "Couldn't update your plan. Please try again." };
    revalidatePath("/billing");
    return { effectiveUntil: null };
  }

  const result = await cancelRazorpaySubscription(snapshot.subscription.provider_subscription_id, true);
  if (!result.ok) return { error: result.error };

  const { error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString(), downgrade_to_plan_id: "free" })
    .eq("business_id", membership.business.id);
  if (error) return { error: "Cancellation was sent, but we couldn't update your account. Please contact support." };

  revalidatePath("/billing");
  return { effectiveUntil: snapshot.subscription.current_period_end };
}

/** Read-only helper for the /billing page's usage bars. Not itself an
 * action, but colocated here (rather than a separate file) since it's
 * only ever called from that one server component. */
export async function getSubscriptionForCurrentOwner(): Promise<SubscriptionRow | null> {
  const membership = await requireOwner();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("business_id", membership.business.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SubscriptionRow | null;
}
