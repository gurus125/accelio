/**
 * Product safety default, not a billing enforcement mechanism (Phase 15
 * explicitly excludes billing). Centralized here so a future plan-based
 * limit (Phase 16+) only has to change this one place.
 */
export const MAX_STAFF_PER_BUSINESS = 5;

/** How long an invitation stays valid before it's treated as expired. */
export const INVITATION_EXPIRY_DAYS = 7;
