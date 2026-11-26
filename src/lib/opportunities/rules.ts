/**
 * The opportunity rules, in priority order. `calculate.ts` runs them top to
 * bottom for each customer and stops at the first match — a customer only
 * ever gets one opportunity at a time, whichever is most worth the
 * business owner's attention.
 *
 * Every rule is deterministic — no AI, no invented information. The
 * tiered-intelligence overhaul changed WHAT counts as a legitimate reason
 * (a business/service baseline can now stand in for missing or thin
 * personal history — see `returnCadence` below and `service-defaults.ts`),
 * but never loosened the underlying rule: if there's no reliable personal
 * pattern AND no baseline to fall back on, the rule stays silent rather
 * than guessing.
 */

import type { Opportunity, OpportunitySource, OpportunityRule, OpportunityType, RuleContext, ServiceVisitPattern } from "./types";
import { computeConfidence, computeScore } from "./scoring";
import { resolveExpectedInterval } from "./service-defaults";
import { HIGH_VALUE_SPEND_THRESHOLD, INACTIVE_DAYS_THRESHOLD, RETURN_OVERDUE_MULTIPLIER } from "./constants";

interface BuildOpportunityOptions {
  source?: OpportunitySource;
  service?: string | null;
  daysSinceLastVisit?: number | null;
  lastVisitAt?: string | null;
  visitCount?: number;
}

function buildOpportunity(
  type: OpportunityType,
  title: string,
  explanation: string,
  ctx: RuleContext,
  options: BuildOpportunityOptions = {}
): Opportunity {
  const { customer, pattern } = ctx;
  return {
    id: `${customer.id}:${type}`,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    type,
    title,
    explanation,
    confidence: computeConfidence(pattern),
    source: options.source,
    service: options.service ?? null,
    score: computeScore(type, pattern),
    daysSinceLastVisit: options.daysSinceLastVisit ?? pattern.daysSinceLastVisit,
    lastVisitAt: options.lastVisitAt ?? pattern.lastVisitAt,
    visitCount: options.visitCount ?? pattern.visitCount,
    totalSpent: pattern.totalSpent,
  };
}

/** A high-spending customer has gone quiet — the single most valuable
 * customer to reach out to, so this runs first. Unaffected by the tiered
 * baseline model: spend and inactivity are facts about the customer as a
 * whole, not a per-service cadence guess. */
const highValueInactive: OpportunityRule = (ctx) => {
  const { pattern } = ctx;
  if (pattern.totalSpent < HIGH_VALUE_SPEND_THRESHOLD) return null;
  if (pattern.daysSinceLastVisit === null) return null;
  if (pattern.daysSinceLastVisit < INACTIVE_DAYS_THRESHOLD) return null;

  return buildOpportunity(
    "high_value_inactive",
    "High-value customer has gone quiet",
    `Has spent ₹${pattern.totalSpent.toLocaleString("en-IN")} across ${pattern.visitCount} visits, ` +
      `but hasn't been back in ${pattern.daysSinceLastVisit} days.`,
    ctx
  );
};

interface BucketEvaluation {
  bucket: ServiceVisitPattern;
  expectedDays: number;
  source: OpportunitySource;
  status: "overdue" | "approaching";
}

/**
 * Decides whether ONE service's (or the general bucket's) history gives a
 * legitimate reason to expect this customer back, and if so, whether
 * they're already overdue or just approaching it. Returns null whenever
 * there isn't a legitimate basis — exactly the "never manufacture an
 * opportunity" rule, now expressed per service instead of per customer.
 *
 * Evidence priority (never a mathematical blend of personal + baseline):
 *  - STRONG personal history (3+ visits to this service) → the customer's
 *    own average interval is used, full stop, even when a baseline exists
 *    and disagrees with it.
 *  - WEAK personal history (exactly 2 visits — one real observed gap) → a
 *    baseline, if one exists, remains the operative number (the visit
 *    supports the recommendation without overriding a still-thin sample);
 *    only when NO baseline exists at all does the single observed gap get
 *    used directly.
 *  - NO personal history (exactly 1 visit — the customer's first time, no
 *    observed interval at all) → a baseline, if one exists, is the only
 *    possible basis. This is the "useful from the first visit" case.
 *  - No usable personal signal and no baseline → no opportunity.
 */
function evaluateBucket(bucket: ServiceVisitPattern, ctx: RuleContext): BucketEvaluation | null {
  let expectedDays: number | null;
  let source: OpportunitySource;

  if (bucket.personalHistoryStrength === "strong") {
    expectedDays = bucket.averageReturnDays;
    source = "personal_pattern";
  } else if (bucket.personalHistoryStrength === "weak") {
    const baseline = resolveExpectedInterval(bucket.service, ctx.business, ctx.serviceBaselines);
    if (baseline) {
      expectedDays = baseline.expectedReturnDays;
      source = "personal_with_baseline_support";
    } else if (bucket.averageReturnDays !== null) {
      expectedDays = bucket.averageReturnDays;
      source = "personal_pattern";
    } else {
      return null;
    }
  } else {
    // "none" — the customer's first-ever visit for this service/bucket:
    // there is no observed interval, so a baseline is the only possible
    // legitimate basis. No baseline means no opportunity, never a guess.
    const baseline = resolveExpectedInterval(bucket.service, ctx.business, ctx.serviceBaselines);
    if (!baseline) return null;
    expectedDays = baseline.expectedReturnDays;
    source = "business_baseline";
  }

  if (expectedDays === null) return null;

  const overdueAtDays = expectedDays * RETURN_OVERDUE_MULTIPLIER;
  if (bucket.daysSinceLastVisit >= overdueAtDays) {
    return { bucket, expectedDays, source, status: "overdue" };
  }
  if (bucket.daysSinceLastVisit >= expectedDays) {
    return { bucket, expectedDays, source, status: "approaching" };
  }
  return null;
}

function describeReturnCadence(evaluation: BucketEvaluation): { title: string; explanation: string } {
  const { bucket, expectedDays, source, status } = evaluation;
  const service = bucket.service;
  const days = bucket.daysSinceLastVisit;

  if (status === "overdue") {
    if (source === "personal_pattern") {
      return {
        title: service ? `Usual ${service} visit is overdue` : "Due to return",
        explanation: service
          ? `Usually returns for ${service} about every ${expectedDays} days, and it's now been ${days} days since their last ${service} visit.`
          : `Usually visits about every ${expectedDays} days, and it's now been ${days} days since their last visit.`,
      };
    }
    if (source === "personal_with_baseline_support") {
      return {
        title: service ? `Likely due for ${service}` : "Likely due to return",
        explanation: service
          ? `${service} customers at your business typically return within about ${expectedDays} days — it's been ${days} days since their last ${service} visit.`
          : `Customers typically return within about ${expectedDays} days — it's been ${days} days since their last visit.`,
      };
    }
    return {
      title: service ? `May be due for ${service}` : "May be due to return",
      explanation: service
        ? `${service} customers at your business typically return within about ${expectedDays} days — it's been ${days} days since their only ${service} visit so far.`
        : `Customers at your business typically return within about ${expectedDays} days — it's been ${days} days since their only visit so far.`,
    };
  }

  // approaching
  if (source === "personal_pattern") {
    return {
      title: service ? `Usual ${service} visit coming due` : "Return visit coming due",
      explanation: service
        ? `Has come in for ${service} ${bucket.visitCount} time${bucket.visitCount === 1 ? "" : "s"}, roughly every ${expectedDays} days — about that time again.`
        : `Usually visits about every ${expectedDays} days — about that time again.`,
    };
  }
  if (source === "personal_with_baseline_support") {
    return {
      title: service ? `${service} visit may be coming due` : "Return visit may be coming due",
      explanation: service
        ? `${service} customers at your business typically return around this time — it's been ${days} days since their last ${service} visit.`
        : `Customers typically return around this time — it's been ${days} days since their last visit.`,
    };
  }
  return {
    title: service ? `${service} visit may be worth a reminder` : "May be worth a reminder",
    explanation: service
      ? `${service} customers at your business typically return around this time.`
      : `Customers at your business typically return around this time.`,
  };
}

/**
 * Replaces the old `dueToReturn` + `serviceReminder` pair with one rule
 * that reasons per service (haircut, beard, facial — each independently),
 * plus a "general" bucket for visits with no service named at all
 * (preserving the old, service-agnostic behavior for businesses that don't
 * tag services). Evaluates every bucket, then surfaces exactly one —
 * overdue always outranks approaching, and within a tier, the bucket
 * furthest past its expected interval wins.
 */
const returnCadence: OpportunityRule = (ctx) => {
  const evaluations = ctx.pattern.services
    .map((bucket) => evaluateBucket(bucket, ctx))
    .filter((e): e is BucketEvaluation => e !== null);

  if (evaluations.length === 0) return null;

  const byUrgency = (a: BucketEvaluation, b: BucketEvaluation) =>
    (b.bucket.daysSinceLastVisit - b.expectedDays) - (a.bucket.daysSinceLastVisit - a.expectedDays);

  const overdue = evaluations.filter((e) => e.status === "overdue").sort(byUrgency);
  const approaching = evaluations.filter((e) => e.status === "approaching").sort(byUrgency);

  const chosen = overdue[0] ?? approaching[0];
  const type: OpportunityType = chosen.status === "overdue" ? "due_to_return" : "service_reminder";
  const { title, explanation } = describeReturnCadence(chosen);

  return buildOpportunity(type, title, explanation, ctx, {
    source: chosen.source,
    service: chosen.bucket.service,
    daysSinceLastVisit: chosen.bucket.daysSinceLastVisit,
    lastVisitAt: chosen.bucket.lastVisitAt,
    visitCount: chosen.bucket.visitCount,
  });
};

/** Catch-all for customers who've simply gone quiet for a long time,
 * regardless of spend or whether we trust a return pattern for them yet.
 * Runs after the more specific rule so it only catches what that missed. */
const inactive: OpportunityRule = (ctx) => {
  const { pattern } = ctx;
  if (pattern.daysSinceLastVisit === null) return null;
  if (pattern.daysSinceLastVisit < INACTIVE_DAYS_THRESHOLD) return null;

  return buildOpportunity(
    "inactive",
    "Hasn't visited in a while",
    `It's been ${pattern.daysSinceLastVisit} days since their last visit ` +
      `(${pattern.visitCount} visit${pattern.visitCount === 1 ? "" : "s"} on record).`,
    ctx
  );
};

/**
 * Permanent no-op. The spec calls for a "follow up on an enquiry that
 * didn't convert" opportunity, but `customer_events.event_type` only
 * allows 'visit' | 'note' | 'other' (see the Phase 4 migration) — there is
 * no enquiry/lead event to detect a non-conversion from. Rather than
 * inventing logic the data can't support, this rule intentionally never
 * fires. It's kept in the pipeline (in its documented priority slot) so
 * the type and its UI label stay real and ready for whenever enquiry
 * tracking is added — implementing it then means writing this one
 * function, not restructuring the engine.
 */
const followUp: OpportunityRule = () => null;

export const RULES: OpportunityRule[] = [
  highValueInactive,
  returnCadence,
  inactive,
  followUp,
];
