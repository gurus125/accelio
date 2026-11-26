/**
 * Types for Phase 12's Daily Smart Recommendations. Deliberately thin —
 * this module ranks and filters the Phase 6 `Opportunity` type, it never
 * invents a second "who/why" model. See `dailyRecommendations.ts`'s header
 * comment for the full reuse rationale.
 */

import type { Opportunity } from "@/lib/opportunities/types";

/** Human-readable only — never a numeric score (Phase 12 spec section 4:
 * no "Score: 87/100" shown to the business owner). */
export type RecommendationPriority = "high" | "recommended" | "lower";

export interface DailyRecommendation {
  opportunity: Opportunity;
  priority: RecommendationPriority;
  /** Short, deterministic action label — reused from
   * `lib/opportunities/recommended-action.ts`, not reworded here. */
  recommendedAction: string;
  /** Most recent qualifying (sent/delivered/read) outbound message to this
   * customer, if any — the basis for the contact cooldown. */
  lastContactedAt: string | null;
  /** True when the customer's most recent reply hasn't been followed up
   * on yet — such a customer is already excluded from the list (see
   * `filters.ts`), this is carried through only for any UI that wants to
   * explain why. */
  hasUnansweredReply: boolean;
  whatsappConnected: boolean;
  /** Formatted destination number (e.g. "+91 98765 43210"), or null when
   * the stored phone couldn't be confidently normalized — such customers
   * are excluded before this point, but the field is kept for display. */
  customerPhoneDisplay: string | null;
}

export interface DailyRecommendationsResult {
  recommendations: DailyRecommendation[];
  /** How many opportunities passed every filter, before the daily cap —
   * lets the UI say "showing 10 of 23" and link to the full list. */
  totalEligible: number;
}
