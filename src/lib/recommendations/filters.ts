/**
 * Exclusion rules for turning a Phase 6 `Opportunity` list into TODAY's
 * recommendations. Deliberately narrow: Phase 6 itself already handles
 * "customer returned recently" (a fresh visit simply makes the
 * opportunity stop existing — see `calculate.ts`), so that case needs no
 * extra code here. This file only adds the checks Phase 6 has no way to
 * know about: real WhatsApp contact/reply history.
 */

import type { Opportunity } from "@/lib/opportunities/types";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { RECOMMENDATION_CONTACT_COOLDOWN_DAYS } from "./constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OutreachContext {
  /** Most recent qualifying (sent/delivered/read) outbound message time
   * for this customer, business-wide (any opportunity type) — or null if
   * they've never been messaged. */
  lastQualifyingMessageAt: string | null;
  /** True when the customer's latest communication is an inbound reply
   * that nothing has been sent after yet. */
  hasUnansweredReply: boolean;
}

/**
 * Whether an opportunity is worth surfacing as a recommendation today.
 *
 * Note on the field Phase 12's spec calls "opted out of marketing
 * communication, if such a field exists": no such field exists anywhere
 * in the `customers` schema (Phase 4-11) — this check is intentionally
 * omitted rather than invented, and is called out as a limitation in the
 * Phase 12 report.
 */
export function isEligibleToday(opportunity: Opportunity, context: OutreachContext, now: Date = new Date()): boolean {
  // No usable WhatsApp number — nothing actionable to recommend.
  if (!normalizePhoneForWhatsApp(opportunity.customerPhone)) return false;

  // The customer already replied and hasn't been responded to since —
  // that needs the owner's personal attention, not another
  // automated-feeling nudge to send a templated reminder.
  if (context.hasUnansweredReply) return false;

  // Contacted for this too recently — respect the cooldown so the same
  // still-open opportunity doesn't get re-recommended every single day.
  if (context.lastQualifyingMessageAt) {
    const daysSinceContact = (now.getTime() - new Date(context.lastQualifyingMessageAt).getTime()) / DAY_MS;
    if (daysSinceContact < RECOMMENDATION_CONTACT_COOLDOWN_DAYS) return false;
  }

  return true;
}
