/**
 * Phase 12 constants — checked the rest of the codebase first for an
 * existing "don't contact again too soon" value before adding one. The
 * only similar existing constant is `findRecentDuplicateMessage`'s
 * 30-SECOND window in `lib/whatsapp/queries.ts`, which exists purely to
 * catch an accidental double-click/duplicate form submit, not to space
 * real outreach out over days — a different problem, left untouched. This
 * is a new, single source of truth for "don't re-recommend someone we
 * just messaged"; nothing else should invent a second cooldown value.
 */
export const RECOMMENDATION_CONTACT_COOLDOWN_DAYS = 7;

/** Caps how many recommendations the dashboard shows at once, so the
 * owner never faces an overwhelming list — configurable in this one
 * place. The full, uncapped list is always still reachable via
 * `/opportunities`. */
export const MAX_DAILY_RECOMMENDATIONS = 10;
