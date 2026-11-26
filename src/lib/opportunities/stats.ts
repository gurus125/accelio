/**
 * Turns a customer's raw `customer_events` rows into the visit-pattern
 * numbers the rule engine reasons about. This is a dedicated calculator
 * (distinct from `@/lib/customers/mappers`'s `computeCustomerStats`) because
 * the opportunity engine needs more than a count and a sum — it needs a
 * return-interval average per service, computed defensively since
 * imported/legacy data can be messy.
 *
 * Deliberately does NOT know about business/service baselines — this file
 * only ever reports what's true about the customer's own visits. Whether a
 * baseline should fill in for missing/weak personal history is a `rules.ts`
 * decision (see `service-defaults.ts`), kept out of this file so "what did
 * this customer actually do" and "what should we assume when we don't know"
 * stay separate and independently testable.
 */

import type { CustomerEventRow } from "@/types/database";
import type { CustomerVisitPattern, PersonalHistoryStrength, ServiceVisitPattern } from "./types";
import { STRONG_PERSONAL_HISTORY_MIN_VISITS } from "./constants";

function isValidDate(iso: string | null | undefined): iso is string {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Average gap between consecutive visits, in chronological order —
 * `null` only when there are fewer than 2 visits (no gap to compute). */
function computeAverageGap(sortedVisits: CustomerEventRow[]): number | null {
  if (sortedVisits.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sortedVisits.length; i++) {
    const gap = daysBetween(sortedVisits[i - 1].occurred_at, sortedVisits[i].occurred_at);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

function strengthFor(visitCount: number): PersonalHistoryStrength {
  if (visitCount >= STRONG_PERSONAL_HISTORY_MIN_VISITS) return "strong";
  if (visitCount >= 2) return "weak";
  return "none";
}

/**
 * Builds one service's (or, for `serviceKey === null`, the general/
 * unlabeled bucket's) visit pattern from its own visits only — never mixed
 * with any other service's visits. Only called for a bucket that has at
 * least one visit, so the returned pattern is never "no history."
 */
function buildServicePattern(serviceKey: string | null, visits: CustomerEventRow[], now: Date): ServiceVisitPattern {
  const sorted = [...visits].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const lastVisitAt = sorted[sorted.length - 1].occurred_at;

  return {
    service: serviceKey,
    visitCount: sorted.length,
    lastVisitAt,
    daysSinceLastVisit: Math.max(0, daysBetween(lastVisitAt, now.toISOString())),
    averageReturnDays: computeAverageGap(sorted),
    personalHistoryStrength: strengthFor(sorted.length),
  };
}

/**
 * Computes a customer's visit pattern from their events. Defensive by
 * design: malformed dates, missing amounts, or a customer with zero
 * history all degrade gracefully to "not enough data" rather than
 * throwing or producing a misleading number.
 */
export function computeVisitPattern(
  customerId: string,
  events: CustomerEventRow[],
  now: Date = new Date()
): CustomerVisitPattern {
  const visits = events
    .filter((e) => e.event_type === "visit" && isValidDate(e.occurred_at))
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const visitCount = visits.length;
  const totalSpent = visits.reduce((sum, e) => {
    const amount = typeof e.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0;
    return sum + Math.max(0, amount);
  }, 0);

  const lastVisitAt = visitCount > 0 ? visits[visitCount - 1].occurred_at : null;
  const daysSinceLastVisit = lastVisitAt ? Math.max(0, daysBetween(lastVisitAt, now.toISOString())) : null;

  // Overall average, across every visit regardless of service — kept for
  // the high-value and plain-inactivity rules, which reason about the
  // customer as a whole, not any one service.
  const averageReturnDays = computeAverageGap(visits);
  const hasReliableReturnPattern = visitCount >= STRONG_PERSONAL_HISTORY_MIN_VISITS && averageReturnDays !== null;

  // Bucket every visit by its named service; visits with no service (or a
  // blank one) go into one shared "general" bucket (serviceKey null) —
  // this is what preserves today's behavior for businesses that don't tag
  // services at all.
  const visitsByService = new Map<string | null, CustomerEventRow[]>();
  for (const visit of visits) {
    const service = visit.service?.trim() || null;
    const list = visitsByService.get(service);
    if (list) {
      list.push(visit);
    } else {
      visitsByService.set(service, [visit]);
    }
  }

  const services: ServiceVisitPattern[] = Array.from(visitsByService.entries()).map(([serviceKey, serviceVisits]) =>
    buildServicePattern(serviceKey, serviceVisits, now)
  );

  return {
    customerId,
    visitCount,
    totalSpent,
    lastVisitAt,
    daysSinceLastVisit,
    averageReturnDays,
    hasReliableReturnPattern,
    services,
  };
}
