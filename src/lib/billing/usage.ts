/**
 * Counts what a business has actually used against its plan's limits.
 * Every counter here reads from a table that already exists for its own
 * unrelated reason (customers, business_members/business_invitations via
 * Phase 15's `countStaffSeatsUsed`, messages, campaigns, automations) plus
 * one new table this phase adds purely for counting
 * (`ai_generation_log` — see the Phase 16 migration's comment on why AI
 * *generations* need their own log separate from `messages`).
 *
 * "This period" means: since the trial started, or since the current paid
 * cycle started — never a hardcoded calendar month, since a business's
 * cycle boundary is whatever day they actually subscribed on.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countStaffSeatsUsed } from "@/lib/team/queries";
import type { SubscriptionRow } from "@/types/database";

/** The start of the window every "per billing period" counter measures
 * against. For the Free plan (which has no Razorpay period at all) this
 * always falls back to the first of the current calendar month, which is
 * exactly what "20 AI messages / month" etc. should reset against. Also
 * the fallback for the edge case of a paid subscription row with no
 * current period start recorded yet (shouldn't happen given
 * `ensureFreeSubscriptionForBusiness` and `verifyCheckoutPayment`, but a
 * usage counter must never throw over missing dates — it should
 * undercount to 0 rather than crash an unrelated action). */
export function resolvePeriodStart(subscription: SubscriptionRow, now: Date = new Date()): Date {
  if (subscription.status === "trial" && subscription.trial_started_at) {
    return new Date(subscription.trial_started_at);
  }
  if (subscription.current_period_start) {
    return new Date(subscription.current_period_start);
  }
  // UTC month start — deterministic regardless of the server's clock zone.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function countCustomersForBusiness(businessId: string, supabase?: SupabaseClient): Promise<number> {
  const client = supabase ?? createClient();
  const { count, error } = await client
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countAiGenerationsSince(businessId: string, periodStart: Date): Promise<number> {
  // Always the admin client — `ai_generation_log` has no authenticated-role
  // policy at all (see the Phase 16 migration), it's a pure internal
  // counter, same reasoning as the automation engine's own tables.
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("ai_generation_log")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", periodStart.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function recordAiGeneration(businessId: string): Promise<void> {
  const admin = createAdminClient();
  // Best-effort — a failed usage-log write should never fail the AI
  // generation the customer is actually waiting on. It only under-counts
  // usage, which errs in the business's favor, never blocks them unfairly.
  const { error } = await admin.from("ai_generation_log").insert({ business_id: businessId });
  if (error) {
    console.error("[billing/usage] Failed to record AI generation usage.", error.message);
  }
}

/**
 * Phase 19 hardening — atomically reserves one AI-generation slot for this
 * business, or returns `null` if the plan's monthly limit is already
 * used up. Unlike the old `assertCanGenerateAiMessage` count-then-act
 * check, this holds a per-business advisory lock for the whole
 * count-and-insert (see the Phase 19 migration's `reserve_ai_generation`
 * function), so two concurrent requests at 19/20 can never both succeed.
 *
 * The reservation IS the usage record (the row is inserted immediately,
 * before the OpenAI call) — call `releaseAiGeneration` to roll it back if
 * the generation then fails, preserving the existing "a failed OpenAI
 * call never counts against the business's allowance" behavior.
 */
export async function reserveAiGeneration(
  businessId: string,
  periodStart: Date,
  limit: number
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_ai_generation", {
    p_business_id: businessId,
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Compensating rollback for `reserveAiGeneration` when the generation it
 * was reserved for turns out to fail — best-effort, same reasoning as
 * `recordAiGeneration`'s own comment: a usage-log write failing here
 * should never surface as a user-facing error on top of the original
 * OpenAI failure. Worst case a failed generation is slightly over-counted,
 * which errs toward the business noticing and contacting support, not
 * toward silently letting anyone bypass their limit. */
export async function releaseAiGeneration(logId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_generation_log").delete().eq("id", logId);
  if (error) {
    console.error("[billing/usage] Failed to release AI generation reservation.", error.message);
  }
}

/** Counts WhatsApp messages Meta actually accepted (`sent_at` set) —
 * matches the spec's "count usage only when the provider accepts the
 * send," never a draft or a failed attempt. Covers customer sends, lead
 * sends, campaign sends, and automation sends alike, since all four paths
 * funnel through the same `messages` table (see `lib/whatsapp/queries.ts`'s
 * `createMessageRecord`/`markMessageSent`). */
export async function countWhatsAppMessagesSince(
  businessId: string,
  periodStart: Date,
  supabase?: SupabaseClient
): Promise<number> {
  const client = supabase ?? createClient();
  const { count, error } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .not("sent_at", "is", null)
    .gte("sent_at", periodStart.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countCampaignsCreatedSince(
  businessId: string,
  periodStart: Date,
  supabase?: SupabaseClient
): Promise<number> {
  const client = supabase ?? createClient();
  const { count, error } = await client
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", periodStart.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countActiveAutomations(businessId: string, supabase?: SupabaseClient): Promise<number> {
  const client = supabase ?? createClient();
  const { count, error } = await client
    .from("automations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export { countStaffSeatsUsed };
