/**
 * Entry points for the opportunity engine. Everything here is synchronous
 * and re-derived on every call — opportunities are never written to the
 * database (see `constants.ts`'s header and the Phase 6 spec: this is
 * intentionally dynamic, not a persisted table), so they're always as
 * fresh as the underlying `customers` / `customer_events` rows.
 *
 * Since the tiered-intelligence overhaul, a rule can also reason about the
 * business's own configured service intervals and its `business_type` —
 * both threaded through here rather than fetched per-rule, so every caller
 * fetches them exactly once per tick (see `service_baselines`'s comment in
 * `baselines.ts` for why this is a small, explicit table rather than
 * something rules reach for themselves).
 */

import type { BusinessRow, CustomerEventRow, CustomerRow, ServiceBaselineRow } from "@/types/database";
import type { Opportunity } from "./types";
import { computeVisitPattern } from "./stats";
import { RULES } from "./rules";

/**
 * Computes at most one opportunity for a single customer. Wrapped so that
 * one malformed customer or event record (bad date, non-numeric amount,
 * whatever) can never take down the calculation for the rest of the
 * business — it just quietly yields "no opportunity" for that customer.
 */
export function calculateOpportunityForCustomer(
  customer: CustomerRow,
  events: CustomerEventRow[],
  business: BusinessRow,
  serviceBaselines: ServiceBaselineRow[],
  now: Date = new Date()
): Opportunity | null {
  try {
    const pattern = computeVisitPattern(customer.id, events, now);

    // No visit history at all isn't an opportunity — it's "not enough data
    // yet," a different (and honest) state the UI shows separately.
    if (pattern.visitCount === 0) return null;

    const ctx = { customer, pattern, business, serviceBaselines, now };
    for (const rule of RULES) {
      const opportunity = rule(ctx);
      if (opportunity) return opportunity;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Computes opportunities for every customer in a business and ranks them
 * by internal score, highest first. `eventsByCustomerId` lets callers pass
 * in events they've already grouped (see `queries.ts`) instead of
 * re-fetching per customer.
 */
export function calculateOpportunities(
  customers: CustomerRow[],
  eventsByCustomerId: Map<string, CustomerEventRow[]>,
  business: BusinessRow,
  serviceBaselines: ServiceBaselineRow[],
  now: Date = new Date()
): Opportunity[] {
  const opportunities: Opportunity[] = [];

  for (const customer of customers) {
    const events = eventsByCustomerId.get(customer.id) ?? [];
    const opportunity = calculateOpportunityForCustomer(customer, events, business, serviceBaselines, now);
    if (opportunity) opportunities.push(opportunity);
  }

  return opportunities.sort((a, b) => b.score - a.score);
}

/** Groups a flat list of a business's events by customer id — a small
 * helper so query code doesn't repeat this loop. */
export function groupEventsByCustomer(
  events: CustomerEventRow[]
): Map<string, CustomerEventRow[]> {
  const map = new Map<string, CustomerEventRow[]>();
  for (const event of events) {
    const list = map.get(event.customer_id);
    if (list) {
      list.push(event);
    } else {
      map.set(event.customer_id, [event]);
    }
  }
  return map;
}
