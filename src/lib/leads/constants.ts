/**
 * Phase 13 constants for lead follow-up. Checked `lib/recommendations/`
 * first: `RECOMMENDATION_CONTACT_COOLDOWN_DAYS` (7 days) governs re-nudging
 * about an existing CUSTOMER opportunity — a different, slower-moving
 * problem than a fresh website lead, which should be followed up with much
 * sooner. So this is a new, single source of truth for leads specifically,
 * not a duplicate of the customer cooldown.
 */

/** A contacted lead with no reply is surfaced again as "needs follow-up"
 * once this many days have passed since the last outbound message to
 * them — short, because an interested website visitor goes cold fast. */
export const LEAD_FOLLOWUP_COOLDOWN_DAYS = 2;

/** A lead captured within this many hours is always treated as "new" for
 * priority purposes, regardless of how many other leads exist. */
export const LEAD_RECENTLY_CAPTURED_HOURS = 24;

/** Caps how many lead follow-ups the dashboard shows at once, mirroring
 * `MAX_DAILY_RECOMMENDATIONS` in `lib/recommendations/constants.ts`. The
 * full list is always reachable via `/leads`. */
export const MAX_LEAD_FOLLOWUPS_SHOWN = 5;

/** Lightweight abuse guard for the public capture endpoint (Phase 13 spec
 * step 23/24): more than this many NEW leads for one business inside the
 * window below almost certainly means a script hammering the form, not
 * real visitors — reject rather than accept unlimited fake records. This
 * reuses the `leads` table itself for the count, no new infra. */
export const LEAD_CAPTURE_RATE_LIMIT_MAX = 8;
export const LEAD_CAPTURE_RATE_LIMIT_WINDOW_MINUTES = 5;

/** A repeat submission from the same normalized phone, for the same
 * business, within this window is treated as the same visitor re-clicking
 * the form (e.g. double-submit) rather than a meaningful new event. */
export const LEAD_DUPLICATE_MERGE_WINDOW_MINUTES = 10;
