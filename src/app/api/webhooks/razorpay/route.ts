import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRazorpayWebhookConfigured, razorpayEnv } from "@/lib/billing/config";
import { verifyWebhookSignature, type RazorpaySubscriptionWebhookEvent } from "@/lib/billing/razorpay";
import type { SubscriptionStatus } from "@/types/database";

export const dynamic = "force-dynamic";

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  notes?: { business_id?: string };
}

interface RazorpayWebhookPayload {
  entity: "event";
  event: string;
  created_at: number;
  payload: {
    subscription?: { entity: RazorpaySubscriptionEntity };
  };
}

/** Maps a Razorpay subscription webhook event to our own, deliberately
 * smaller status enum. `pending`, `halted`, and `paused` all collapse to
 * `past_due` — we don't distinguish *why* payment is stalled, only that it
 * is, which is all the payment-failure banner (spec Phase 16, step 72)
 * needs to show. `null` means "don't change status" — just sync period
 * dates/log the event. */
function statusForEvent(event: string): SubscriptionStatus | null {
  switch (event as RazorpaySubscriptionWebhookEvent) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return "active";
    case "subscription.pending":
    case "subscription.halted":
    case "subscription.paused":
      return "past_due";
    case "subscription.completed":
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.authenticated":
    case "subscription.updated":
      return null;
    default:
      return null;
  }
}

/**
 * POST /api/webhooks/razorpay
 *
 * Configure this exact URL in the Razorpay Dashboard (Settings > Webhooks)
 * with the "subscription.*" events enabled, and set RAZORPAY_WEBHOOK_SECRET
 * to the same secret shown there.
 *
 * Security and idempotency, in order:
 *  1. Reject outright if signature verification isn't even configured —
 *     unlike the WhatsApp webhook's optional app secret, this is money, so
 *     there's no "accept unverified for local dev" fallback.
 *  2. Verify `X-Razorpay-Signature` against the raw (unparsed) body.
 *  3. Deduplicate on `X-Razorpay-Event-Id` via `billing_events`' unique
 *     constraint — a retried delivery hits the constraint, is treated as
 *     already-handled, and is acknowledged without reprocessing.
 *  4. Only then update `subscriptions`. Never any customer/lead/message/
 *     campaign/analytics data — nothing in this app is ever deleted or
 *     hidden because of a billing event.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isRazorpayWebhookConfigured) {
    console.error("[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET is not set — refusing to process billing webhooks.");
    return NextResponse.json({ ok: false, error: "Webhook not configured." }, { status: 401 });
  }

  const signatureHeader = request.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(rawBody, signatureHeader, razorpayEnv.webhookSecret)) {
    console.error("[webhook/razorpay] Rejected request with invalid/missing signature.");
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    // A body that fails signature verification never reaches here; a body
    // that passes but isn't valid JSON is simply malformed — ack it so
    // Razorpay doesn't retry something that will never parse.
    return NextResponse.json({ ok: true });
  }

  // Razorpay guarantees a unique id per delivery in this header (see their
  // webhook best-practices docs). Falling back to a synthetic key from the
  // event body itself only guards the (undocumented, shouldn't happen)
  // case where the header is ever missing — it still dedupes reliably
  // since the same redelivered body produces the same key.
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `fallback:${payload.event}:${payload.payload.subscription?.entity.id ?? "unknown"}:${payload.created_at}`;

  const admin = createAdminClient();
  const subscriptionEntity = payload.payload.subscription?.entity ?? null;
  const businessIdFromNotes = subscriptionEntity?.notes?.business_id ?? null;

  const { error: insertError } = await admin.from("billing_events").insert({
    business_id: businessIdFromNotes,
    provider_event_id: eventId,
    event_type: payload.event,
    payload: payload as unknown as Record<string, unknown>,
  });

  if (insertError) {
    // 23505 = unique_violation on (provider, provider_event_id) — this
    // exact event was already recorded (a retried delivery). Acknowledge
    // without reprocessing so the subscription row is never updated twice
    // for the same event.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    console.error("[webhook/razorpay] Failed to record billing event.", insertError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  try {
    if (subscriptionEntity) {
      await applySubscriptionEvent(admin, payload.event, subscriptionEntity, businessIdFromNotes);
    }
    await admin
      .from("billing_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider_event_id", eventId)
      .eq("provider", "razorpay");
  } catch (error) {
    console.error("[webhook/razorpay] Failed to apply event to subscription.", error instanceof Error ? error.message : error);
    // Returning 500 here (unlike the WhatsApp webhook's always-200) is
    // deliberate: a missed subscription status update is a billing
    // correctness issue, and Razorpay's exponential-backoff retry (up to
    // 24h) gives this a real chance to succeed on a later attempt.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

interface ExistingSubscriptionRow {
  business_id: string;
  downgrade_to_plan_id: string | null;
  provider_subscription_id: string | null;
}

/**
 * Applies one subscription webhook event to the one `subscriptions` row it
 * belongs to. Two things this function is careful about beyond the plain
 * "sync status and period dates" job:
 *
 *  1. Stale-event protection — if this event arrives late (Razorpay
 *     retries for up to 24h) for a subscription id that a business's row
 *     has already moved on from (e.g. a paid -> paid plan switch already
 *     verified a new subscription before this old one's own cancellation
 *     webhook showed up), applying it by `notes.business_id` would
 *     overwrite current, correct state with stale data. That fallback
 *     path is skipped whenever the row is already linked to a different
 *     subscription id than this event is about.
 *  2. Soft landing on Free — a subscription actually ending
 *     (`subscription.completed`/`.cancelled`) lands the business on
 *     `downgrade_to_plan_id` (set by `changePlan`/`cancelSubscription` in
 *     `billing/actions.ts`) with `status: "active"`, instead of the old
 *     behavior of leaving it in a blocked `"cancelled"` state. Free is a
 *     permanent floor, never a dead end — no business is ever fully
 *     locked out just because a paid subscription ended.
 */
async function applySubscriptionEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: string,
  entity: RazorpaySubscriptionEntity,
  businessIdFromNotes: string | null
): Promise<void> {
  const nextStatus = statusForEvent(event);

  // Match by the Razorpay subscription id first (the reliable, stable
  // link once `verifyCheckoutPayment` has run); fall back to the business
  // id carried in `notes` for the rare race where a webhook arrives before
  // that verification step has, so it can still set the id itself.
  const { data: byProviderId, error: findError } = await admin
    .from("subscriptions")
    .select("business_id, downgrade_to_plan_id, provider_subscription_id")
    .eq("provider_subscription_id", entity.id)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  let existing = byProviderId as ExistingSubscriptionRow | null;
  let matchedByNotes = false;

  if (!existing && businessIdFromNotes) {
    const { data: byNotes, error: notesError } = await admin
      .from("subscriptions")
      .select("business_id, downgrade_to_plan_id, provider_subscription_id")
      .eq("business_id", businessIdFromNotes)
      .maybeSingle();
    if (notesError) throw new Error(notesError.message);

    if (byNotes?.provider_subscription_id && byNotes.provider_subscription_id !== entity.id) {
      // This business's row already points at a different subscription
      // than the one this (late/retried) event is about — stale. Skip it
      // rather than overwrite current state.
      console.warn(
        `[webhook/razorpay] Skipping stale event for subscription ${entity.id} — business ${businessIdFromNotes} is already linked to ${byNotes.provider_subscription_id}.`
      );
      return;
    }

    existing = byNotes as ExistingSubscriptionRow | null;
    matchedByNotes = Boolean(existing);
  }

  if (!existing) {
    console.error(`[webhook/razorpay] Couldn't map event for subscription ${entity.id} to any business — no matching row and no business_id in notes.`);
    return;
  }

  const update: Record<string, unknown> = {};
  if (matchedByNotes) update.provider_subscription_id = entity.id;
  if (entity.current_start) update.current_period_start = new Date(entity.current_start * 1000).toISOString();
  if (entity.current_end) update.current_period_end = new Date(entity.current_end * 1000).toISOString();

  if (nextStatus === "cancelled") {
    if (existing.downgrade_to_plan_id) {
      // A scheduled downgrade to Free (or, in principle, any future
      // fallback plan) — land there with a clean, fully active row
      // rather than a blocked "cancelled" one. No business data is ever
      // touched by this.
      update.plan_id = existing.downgrade_to_plan_id;
      update.status = "active";
      update.cancel_at_period_end = false;
      update.cancelled_at = null;
      update.downgrade_to_plan_id = null;
      update.provider_subscription_id = null;
      update.current_period_start = null;
      update.current_period_end = null;
    } else {
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }
  } else if (nextStatus) {
    update.status = nextStatus;
  }

  if (Object.keys(update).length === 0) return; // e.g. "authenticated"/"updated" with no new dates — nothing to change.

  const { error } = await admin.from("subscriptions").update(update).eq("business_id", existing.business_id);
  if (error) throw new Error(error.message);
}
