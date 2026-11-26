/**
 * Translates Phase 6's own signals (opportunity type + confidence) into
 * three plain-language priority buckets. Deliberately does NOT introduce
 * a new scoring system — `Opportunity.score` (from
 * `lib/opportunities/scoring.ts`) is still the tiebreaker used in
 * `dailyRecommendations.ts`'s sort; this file only decides which of three
 * human-readable labels a recommendation gets, and that label is never a
 * number shown to the business owner.
 */

import type { Opportunity } from "@/lib/opportunities/types";
import type { RecommendationPriority } from "./types";

/**
 * Deterministic rule:
 * - Low confidence (thin visit history) is always "Lower priority",
 *   regardless of type — Phase 6 itself treats low-confidence signals
 *   more cautiously everywhere else, this stays consistent with that.
 * - A high-value customer gone quiet is always "High priority" once
 *   there's real evidence for it (confidence isn't low) — real money on
 *   the table is the most worth an owner's attention.
 * - "Due to return" is "High priority" only once Reelo has high
 *   confidence in that customer's usual pattern; with only medium
 *   confidence it's "Recommended" instead, since the pattern is less
 *   certain.
 * - Everything else with real evidence behind it is "Recommended".
 */
export function derivePriority(opportunity: Opportunity): RecommendationPriority {
  if (opportunity.confidence === "low") return "lower";
  if (opportunity.type === "high_value_inactive") return "high";
  if (opportunity.type === "due_to_return" && opportunity.confidence === "high") return "high";
  return "recommended";
}

export const PRIORITY_LABEL: Record<RecommendationPriority, string> = {
  high: "High priority",
  recommended: "Recommended",
  lower: "Lower priority",
};

/** Sort order — smaller sorts first (High priority at the top). */
export const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  high: 0,
  recommended: 1,
  lower: 2,
};
