/**
 * Every tunable threshold for the opportunity engine lives here — nothing
 * below is hardcoded inline elsewhere, so these can be revisited later
 * (or eventually exposed as per-business settings) without hunting through
 * rule logic.
 */

/** A customer only counts as "overdue" once they've passed their expected
 * return interval (personal or baseline) by this multiplier — not the
 * instant they hit it. Also the ceiling of the "approaching" window: at or
 * past this multiplier is overdue, below it (but at/past 1x) is
 * approaching. */
export const RETURN_OVERDUE_MULTIPLIER = 1.25;

/**
 * At or above this many visits to the SAME service, a customer's own
 * observed return interval for it is trusted on its own and overrides any
 * business/service baseline ("strong" personal history). Below it (1-2
 * visits), the interval is "weak" — a real signal, but one that still
 * leans on a baseline where one exists, per the tiered-intelligence model:
 * Accelio should be useful from a customer's first visit, not just their
 * third. This deliberately does NOT gate whether an opportunity can fire at
 * all anymore (see `service-defaults.ts` / `rules.ts`) — only how much
 * weight the customer's own history carries versus the baseline.
 */
export const STRONG_PERSONAL_HISTORY_MIN_VISITS = 3;

/** Flat inactivity line used when there isn't (yet) a reliable per-customer
 * return pattern, and as the baseline for the "inactive" opportunity type. */
export const INACTIVE_DAYS_THRESHOLD = 90;

/** Total lifetime spend (from real visit events) at or above which a
 * customer is considered high-value for prioritization purposes. */
export const HIGH_VALUE_SPEND_THRESHOLD = 5000;

/** Visit-count bands used purely for the internal confidence rating —
 * never shown to the business owner as a number. */
export const HIGH_CONFIDENCE_MIN_VISITS = 4;
export const MEDIUM_CONFIDENCE_MIN_VISITS = 2;
