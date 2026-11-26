/**
 * Pure customer-reactivation attribution logic — the core of Phase 11. No
 * Supabase import here on purpose: this file only does arithmetic on
 * plain dates/numbers so it can be unit tested in isolation (see
 * scripts/analytics-tests.ts) without a database. The Supabase-backed
 * wrapper that feeds this real data lives in `reactivation-query.ts`.
 *
 * Definition (Phase 11 sections 10-15): a customer is "returned after
 * outreach" when they were contacted by Accelio (a qualifying outbound
 * message — see `isQualifyingOutreachStatus`) and subsequently recorded a
 * qualifying visit within REACTIVATION_ATTRIBUTION_DAYS of that outreach.
 * This is an OBSERVATIONAL metric, not proof that the message caused the
 * visit — see the Phase 11 report and README section on attribution
 * language.
 */

export const REACTIVATION_ATTRIBUTION_DAYS = 30;

export interface OutreachEvent {
  /** ISO timestamp of a qualifying outbound message. */
  at: string;
}

export interface VisitEvent {
  at: string;
  amount: number | null;
}

export interface ReactivationResult {
  returned: boolean;
  /** The outreach credited with this return — the MOST RECENT qualifying
   * outreach before the return visit (Phase 11 section 12), never the
   * first one, so a customer messaged repeatedly is still only counted
   * once and credited to the message closest to their actual return. */
  outreachAt: string | null;
  /** The FIRST qualifying visit only (Phase 11 section 15) — a customer's
   * second, third, etc. visit after returning is real repeat business,
   * but attributing it to the same original outreach would overstate
   * Accelio's effect, so it's deliberately excluded from this metric. */
  returnAt: string | null;
  /** Revenue from that one first qualifying visit only. Null when that
   * visit has no recorded amount (not the same as "revenue unavailable
   * business-wide" — see `reactivation-query.ts`'s `revenueTrackingAvailable`). */
  revenue: number | null;
}

/**
 * One customer's reactivation outcome, given their FULL outreach and visit
 * history (not just a date-filtered slice — see `reactivation-query.ts`
 * for why). Deterministic rule:
 *
 * 1. Walk visits in chronological order.
 * 2. For each visit, find the most recent outreach that happened strictly
 *    BEFORE it (Phase 11 section 13 — a visit before the outreach is never
 *    attributed to it) and within `windowDays` (inclusive boundary — a gap
 *    of exactly 30.0 days still counts; anything past that doesn't, per
 *    section 14).
 * 3. The FIRST visit that qualifies is the customer's one "return" —
 *    return here immediately, never advance to a later visit even if it
 *    has a larger/more impressive amount. This keeps the metric
 *    conservative and prevents a customer from being counted as "returned"
 *    multiple times.
 */
export function computeCustomerReactivation(
  outreaches: OutreachEvent[],
  visits: VisitEvent[],
  windowDays: number = REACTIVATION_ATTRIBUTION_DAYS
): ReactivationResult {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const sortedOutreaches = outreaches
    .map((o) => new Date(o.at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const sortedVisits = visits
    .map((v) => ({ t: new Date(v.at).getTime(), amount: v.amount }))
    .filter((v) => Number.isFinite(v.t))
    .sort((a, b) => a.t - b.t);

  for (const visit of sortedVisits) {
    let bestOutreach: number | null = null;
    for (const outreachTime of sortedOutreaches) {
      if (outreachTime < visit.t && (bestOutreach === null || outreachTime > bestOutreach)) {
        bestOutreach = outreachTime;
      }
    }
    if (bestOutreach === null) continue; // no outreach happened before this visit at all

    const gap = visit.t - bestOutreach;
    if (gap <= windowMs) {
      return {
        returned: true,
        outreachAt: new Date(bestOutreach).toISOString(),
        returnAt: new Date(visit.t).toISOString(),
        revenue: visit.amount,
      };
    }
    // This visit's nearest preceding outreach fell outside the window —
    // keep checking later visits; a later one could still qualify.
  }

  return { returned: false, outreachAt: null, returnAt: null, revenue: null };
}

/** Only messages Accelio actually attempted to deliver count as "outreach"
 * — a draft that was never sent, or one that failed outright, never
 * reached the customer (Phase 11 section 6's "Messages Sent" definition:
 * "accepted for sending by the existing WhatsApp send flow"). */
export function isQualifyingOutreachStatus(status: string): boolean {
  return status === "sent" || status === "delivered" || status === "read";
}
