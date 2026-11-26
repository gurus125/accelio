/**
 * Server-only Razorpay configuration. Deliberately its own file, never
 * imported from a "use client" component — the same separation
 * `whatsapp/config.ts` uses for the Meta access token. Every consumer
 * checks `isRazorpayConfigured` before assuming a real API call will
 * work, the same "degrade gracefully" rule Supabase/OpenAI/WhatsApp all
 * already follow: trial billing (no card, no Razorpay) always works;
 * only the actual checkout/webhook path needs these.
 */

export const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export const razorpayEnv = {
  keyId: process.env.RAZORPAY_KEY_ID ?? "",
  keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  planIdStarter: process.env.RAZORPAY_PLAN_ID_STARTER ?? "",
  planIdGrowth: process.env.RAZORPAY_PLAN_ID_GROWTH ?? "",
} as const;

/** True once the credentials needed to call Razorpay's API at all are
 * present. Doesn't guarantee a specific plan's Razorpay Plan ID is set —
 * see `getRazorpayPlanId`, which fails per-plan with a friendlier message. */
export const isRazorpayConfigured = Boolean(razorpayEnv.keyId && razorpayEnv.keySecret);

/** True once webhook signature verification is possible. Without this, the
 * webhook route still responds (Razorpay requires a 2xx or it retries for
 * 24h) but refuses to process anything, exactly like the WhatsApp webhook
 * behaves when `WHATSAPP_APP_SECRET` is unset — except billing is money,
 * so here it's a hard requirement, not just a strongly-recommended one. */
export const isRazorpayWebhookConfigured = Boolean(razorpayEnv.webhookSecret);

/** The public key id the *browser* needs to open Razorpay's Checkout —
 * safe to expose (it identifies the account, not a secret). Mirrors
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`'s naming convention. */
export const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
