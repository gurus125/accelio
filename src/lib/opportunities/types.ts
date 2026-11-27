/**
 * Types for the deterministic, rule-based opportunity engine. Nothing here
 * is AI-generated or predicted by a model — every value is computed from
 * real `customers` / `customer_events` rows using plain arithmetic, plus
 * (since the tiered-intelligence overhaul) the business's own configured
 * service intervals and a small set of built-in defaults — see
 * `service-defaults.ts`. No rule invents information: if there's no
 * personal history AND no baseline to fall back on, the rule simply
 * doesn't fire.
 */

import type { BusinessRow, CustomerRow, ServiceBaselineRow } from "@/types/database";

export type OpportunityType =
  | "high_value_inactive"
  | "due_to_return"
  | "service_reminder"
  | "inactive"
  | "follow_up";

/** Internal-only rating of how much evidence backs an opportunity — never
 * shown to the business owner as a number, only ever as calm, plain copy
 * (or not surfaced at all). */
export type OpportunityConfidence = "high" | "medium" | "low";

/**
 * WHERE a due-to-return / service-reminder opportunity's expected interval
 * actually came from — this is what lets the UI say "Rahul usually returns
 * every 33 days" versus "Haircut customers typically return around this
 * time" without ever showing a number score. Never exposed as a raw value
 * to the business owner; only ever used to pick the right sentence.
 *
 *  - personal_pattern: the customer's own observed interval for this
 *    service (3+ visits, or a single observed gap with no baseline to lean
 *    on instead) is the number in use.
 *  - business_baseline: no personal history at all for this service yet —
 *    using the business's configured or built-in default interval.
 *  - personal_with_baseline_support: a little personal history exists
 *    (1-2 visits) but isn't enough to trust on its own yet, so the
 *    baseline interval is still the operative number; the personal visit(s)
 *    support the recommendation without overriding the baseline.
 *  - explicit_schedule: not produced by this engine at all — reserved for
 *    calendar-anchored recurring reminders (see `lib/recurring-schedules/`),
 *    listed here only so UI copy can reason about all four sources
 *    consistently.
 */
export type OpportunitySource =
  | "personal_pattern"
  | "business_baseline"
  | "personal_with_baseline_support"
  | "explicit_schedule";

export interface Opportunity {
  /** Stable per customer — a customer can only ever have one active
   * opportunity at a time (the highest-priority rule that matched). */
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  /** Milestone 1 — false when the customer opted out (STOP) or never agreed
   * to WhatsApp messages. The opportunity still exists (they ARE due), but
   * it is not recommended for a WhatsApp send. Every actual send path
   * re-checks consent itself, so this is a display filter only. */
  customerCanMessage?: boolean;
  type: OpportunityType;
  /** Short, plain-language label for the opportunity type. */
  title: string;
  /** One or two sentences explaining *why*, in the business owner's terms —
   * always built from real numbers, never invented. */
  explanation: string;
  confidence: OpportunityConfidence;
  /** Set only for due_to_return/service_reminder opportunities — see
   * `OpportunitySource`. Undefined for opportunity types that aren't about
   * an expected-return interval at all (high_value_inactive, inactive). */
  source?: OpportunitySource;
  /** The specific service this opportunity is about, when the underlying
   * visits named one — null for a general/unlabeled-visit pattern. */
  service: string | null;
  /** Internal ranking value only. Never render this to a user. */
  score: number;
  daysSinceLastVisit: number | null;
  lastVisitAt: string | null;
  visitCount: number;
  totalSpent: number;
}

/** How much personal return-interval evidence exists for one service (or
 * the general/unlabeled bucket): "none" (exactly one visit — the very
 * first time, so there's no observed interval at all yet, only a baseline
 * to lean on), "weak" (2 visits — one real observed gap, a thin but genuine
 * signal), "strong" (3+ visits — trusted on its own, overriding any
 * baseline). */
export type PersonalHistoryStrength = "none" | "weak" | "strong";

/** One service's (or the general/unlabeled bucket's) visit history for a
 * customer, computed independently of every other service — a customer's
 * haircut cadence must never influence their facial cadence. */
export interface ServiceVisitPattern {
  /** null = visits with no `service` value set at all, tracked together as
   * a general pattern (this is what today's overall dueToReturn behavior
   * becomes when a business doesn't tag services). */
  service: string | null;
  visitCount: number;
  lastVisitAt: string;
  daysSinceLastVisit: number;
  /** Average gap between consecutive visits to this service — null only
   * when there's exactly one visit and so no gap to compute yet. Computed
   * whenever it CAN be, regardless of how few visits that is; whether it's
   * trusted on its own is `personalHistoryStrength`'s job, not this field's. */
  averageReturnDays: number | null;
  personalHistoryStrength: PersonalHistoryStrength;
}

export interface CustomerVisitPattern {
  customerId: string;
  visitCount: number;
  totalSpent: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  /** Average number of days between consecutive visits, across ALL of the
   * customer's visits regardless of service — kept for the high-value and
   * plain-inactivity rules, which have never cared about service. */
  averageReturnDays: number | null;
  /** True only once there's enough overall visit history (3+) to say "this
   * customer usually returns every N days" with any confidence. */
  hasReliableReturnPattern: boolean;
  /** Per-service (and, under the `null` key, general/unlabeled) visit
   * patterns — see `ServiceVisitPattern`. This is what the due-to-return /
   * service-reminder logic actually reasons over now. */
  services: ServiceVisitPattern[];
}

export interface RuleContext {
  customer: CustomerRow;
  pattern: CustomerVisitPattern;
  /** The business this customer belongs to — needed to resolve a
   * business-type baseline default (tier 3) and to look up the business's
   * own configured service intervals. */
  business: BusinessRow;
  /** The business's own tier-1 baseline overrides — see `baselines.ts`. */
  serviceBaselines: ServiceBaselineRow[];
  now: Date;
}

export type OpportunityRule = (ctx: RuleContext) => Opportunity | null;
