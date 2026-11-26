import type { PlanDefinition, PlanId } from "./plans";
import type { SubscriptionRow, SubscriptionStatus } from "@/types/database";

/**
 * The STORED `status` column reflects what the last webhook/action told us
 * (or "trial" until anything happens). The EFFECTIVE status below is what
 * every enforcement check and every UI actually uses — computed fresh
 * against the current time on every read, never trusted as a value that
 * might have gone stale since the last webhook fired. This is the same
 * "never trust a possibly-stale flag, recompute the real thing" instinct
 * Phase 15 applied to role checks: a trial that quietly expired an hour
 * ago must be treated as expired the very next request, not only after
 * some background job gets around to flipping a column.
 */
export type { SubscriptionStatus };

export interface BillingSnapshot {
  subscription: SubscriptionRow;
  plan: PlanDefinition;
  /** Computed from `subscription` + the current time — see
   * `subscription.ts`'s `computeEffectiveStatus`. */
  effectiveStatus: SubscriptionStatus;
  /** Only meaningful while `effectiveStatus === "trial"`. */
  trialDaysRemaining: number | null;
  /** True for `active` and `trial` — the two statuses where every paid
   * action should proceed normally. `past_due` still allows it (short
   * grace period, banner shown) but `cancelled`/`expired` do not. */
  isInGoodStanding: boolean;
}

export interface UsageSnapshot {
  customers: number;
  staff: number;
  aiGenerationsThisPeriod: number;
  whatsappMessagesThisPeriod: number;
  campaignsThisPeriod: number;
  activeAutomations: number;
}

export interface PlanChangeCandidate {
  planId: PlanId;
}
