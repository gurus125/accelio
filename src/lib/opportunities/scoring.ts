/**
 * Internal-only ranking. Nothing here is ever rendered to the business
 * owner — no score, no percentage, no "72% likely." It exists purely so
 * `calculate.ts` can sort a business's opportunities into a sensible order
 * (most worth acting on today, first).
 */

import type { CustomerVisitPattern, OpportunityConfidence, OpportunityType } from "./types";
import { HIGH_CONFIDENCE_MIN_VISITS, MEDIUM_CONFIDENCE_MIN_VISITS } from "./constants";

/** Base weight per opportunity type — deliberately ordered so a quiet
 * high-value customer always outranks a routine reminder. */
const TYPE_BASE_SCORE: Record<OpportunityType, number> = {
  high_value_inactive: 100,
  due_to_return: 70,
  service_reminder: 50,
  inactive: 40,
  follow_up: 0,
};

/**
 * Additive score: a base per opportunity type, nudged up for higher spend
 * (more worth the business's attention) and for longer absence (more
 * urgent), both capped so no single factor dominates.
 */
export function computeScore(type: OpportunityType, pattern: CustomerVisitPattern): number {
  const base = TYPE_BASE_SCORE[type];
  const spendBoost = Math.min(pattern.totalSpent / 100, 50);
  const urgencyBoost = Math.min(pattern.daysSinceLastVisit ?? 0, 120) * 0.25;
  return Math.round(base + spendBoost + urgencyBoost);
}

/**
 * How much evidence backs this opportunity — purely a function of how many
 * real visits we have to go on. More visits, more confidence; a customer
 * with only one or two visits gets treated more cautiously everywhere this
 * is consulted (see the rules in `rules.ts`).
 */
export function computeConfidence(pattern: CustomerVisitPattern): OpportunityConfidence {
  if (pattern.visitCount >= HIGH_CONFIDENCE_MIN_VISITS) return "high";
  if (pattern.visitCount >= MEDIUM_CONFIDENCE_MIN_VISITS) return "medium";
  return "low";
}
