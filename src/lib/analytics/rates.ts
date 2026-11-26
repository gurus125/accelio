/**
 * Pure rate-calculation helpers — no Supabase, no React, just arithmetic —
 * kept in their own file specifically so they're trivial to unit test in
 * isolation (see scripts/analytics-tests.ts).
 */

export interface RateResult {
  ratio: number | null;
  display: string;
}

/**
 * A rate is undefined (shown as "--"), never "0%", when its denominator is
 * zero (Phase 11 sections 7/8/9). Showing "0%" with no denominator would
 * falsely imply "we measured this and it failed" rather than "there's
 * nothing to measure yet."
 */
export function computeRate(numerator: number, denominator: number): RateResult {
  if (denominator <= 0) return { ratio: null, display: "--" };
  const ratio = numerator / denominator;
  return { ratio, display: `${Math.round(ratio * 100)}%` };
}
