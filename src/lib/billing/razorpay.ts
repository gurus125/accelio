/**
 * The only file in the app that talks to Razorpay's HTTP API. Deliberately
 * a plain `fetch` (Basic Auth with key_id:key_secret) instead of the
 * `razorpay` npm package — same reasoning `lib/ai/generate-message.ts`
 * gives for skipping the `openai` SDK: a small, auditable, server-only
 * function, and here it also sidesteps a real constraint of this specific
 * deployment (this project's package installs run on a machine whose
 * network policy blocks the npm registry entirely — confirmed while
 * building this phase). Every shape below (parameters, response fields,
 * webhook event names, the signature formulas) was checked against
 * Razorpay's current (September 2026) official docs and the `razorpay-node`
 * SDK's own documented helpers while building this — not carried over
 * from a possibly-stale tutorial.
 *
 * Never imported from a "use client" file — `RAZORPAY_KEY_SECRET` and
 * `RAZORPAY_WEBHOOK_SECRET` must never reach the browser.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { RAZORPAY_API_BASE, razorpayEnv } from "./config";

function authHeader(): string {
  const token = Buffer.from(`${razorpayEnv.keyId}:${razorpayEnv.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!razorpayEnv.keyId || !razorpayEnv.keySecret) {
    return { ok: false, error: "Billing isn't fully configured yet. Please try again later." };
  }

  try {
    const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const description =
        payload && typeof payload === "object" && payload !== null && "error" in payload
          ? (payload as { error?: { description?: string } }).error?.description
          : undefined;
      console.error(`[billing/razorpay] Razorpay responded with HTTP ${response.status}: ${description ?? "no description"}.`);
      return { ok: false, error: "We couldn't reach the payment provider. Please try again." };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    console.error("[billing/razorpay] Network error calling Razorpay.", error instanceof Error ? error.message : error);
    return { ok: false, error: "We couldn't reach the payment provider. Please try again." };
  }
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  plan_id: string;
  short_url: string | null;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  start_at: number | null;
  ended_at: number | null;
  customer_id?: string;
}

/**
 * Creates a Razorpay Subscription for one business's chosen plan. Uses a
 * large `total_count` (Razorpay bills in fixed-count cycles, not an
 * open-ended "until cancelled" primitive) so it behaves like an ongoing
 * monthly subscription in practice — 120 monthly cycles is 10 years,
 * comfortably longer than any business will run without ever changing
 * plans (a plan change creates a fresh subscription; see `actions.ts`).
 * `notes.business_id` is how the webhook maps a Razorpay event back to a
 * Accelio business without trusting anything else in the payload.
 */
export async function createRazorpaySubscription(params: {
  razorpayPlanId: string;
  businessId: string;
  notifyCustomerEmail: string | null;
  /** Unix timestamp (seconds) — defers the first authorized charge to a
   * future date, used when a plan change is scheduled to start at the
   * end of the currently-paid period rather than immediately. Omit for
   * an ordinary "start billing now" checkout. */
  startAt?: number;
}) {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: params.razorpayPlanId,
    total_count: 120,
    quantity: 1,
    customer_notify: 1,
    ...(params.startAt ? { start_at: params.startAt } : {}),
    notes: {
      business_id: params.businessId,
      ...(params.notifyCustomerEmail ? { business_email: params.notifyCustomerEmail } : {}),
    },
  });
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>("GET", `/subscriptions/${subscriptionId}`);
}

/** `cancelAtCycleEnd: true` lets the current paid period run out before
 * access is revoked (the spec's required "remains active until [date]"
 * semantics); `false` cancels immediately (used only for a same-day
 * self-service cancellation the owner explicitly confirms as immediate,
 * if ever exposed — Phase 16's UI only offers the at-period-end path). */
export async function cancelRazorpaySubscription(subscriptionId: string, cancelAtCycleEnd: boolean) {
  return razorpayRequest<RazorpaySubscription>("POST", `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
  });
}

/**
 * Verifies the signature Razorpay Checkout hands back to the success
 * handler after a subscription's authorizing payment. Formula confirmed
 * from Razorpay's own docs/SDK: HMAC-SHA256 of
 * `"<razorpay_payment_id>|<razorpay_subscription_id>"`, keyed with the
 * account's key secret, compared to `razorpay_signature`. The caller must
 * pass the subscription id it already has on file for this business — the
 * checkout response's own `razorpay_subscription_id` is never trusted as
 * the identifier to update, only as one input to the signature check.
 */
export function verifyCheckoutSignature(params: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  if (!razorpayEnv.keySecret) return false;
  const expected = createHmac("sha256", razorpayEnv.keySecret)
    .update(`${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`)
    .digest("hex");
  return safeCompare(expected, params.razorpaySignature);
}

/**
 * Verifies an incoming webhook's `X-Razorpay-Signature` header: HMAC-SHA256
 * of the exact raw request body (never the parsed/re-stringified JSON —
 * whitespace differences would change the hash), keyed with
 * `RAZORPAY_WEBHOOK_SECRET`. Mirrors the SDK's own `validateWebhookSignature`
 * helper, reimplemented here in plain `crypto` for the same
 * no-extra-dependency reason as the rest of this file.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeCompare(expected, signatureHeader);
}

function safeCompare(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Every subscription webhook event Razorpay currently documents (checked
 * live against razorpay.com/docs/webhooks/subscriptions/ while building
 * this phase). Kept as a type so the webhook route's switch statement is
 * exhaustively checked by the compiler as events are handled.
 */
export type RazorpaySubscriptionWebhookEvent =
  | "subscription.authenticated"
  | "subscription.activated"
  | "subscription.charged"
  | "subscription.completed"
  | "subscription.updated"
  | "subscription.pending"
  | "subscription.halted"
  | "subscription.paused"
  | "subscription.resumed"
  | "subscription.cancelled";
