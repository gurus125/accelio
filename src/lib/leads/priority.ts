/**
 * Deterministic, human-language-only lead follow-up priority — the exact
 * same philosophy as `lib/recommendations/ranking.ts`: real signals in,
 * plain labels out, never a number shown to the owner. No ML, no lead
 * scoring (explicitly banned by the Phase 13 spec's "do not build" list).
 */

import type { LeadRow } from "@/types/database";
import { LEAD_FOLLOWUP_COOLDOWN_DAYS, LEAD_RECENTLY_CAPTURED_HOURS } from "./constants";

export type LeadFollowUpReason = "new" | "replied" | "needs_follow_up";

export interface LeadFollowUp {
  lead: LeadRow;
  reason: LeadFollowUpReason;
  /** Human-readable only, e.g. "New website lead" — never "Lead score: 92". */
  label: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Sort weight — smaller first. New and replied leads are time-sensitive
 * in different ways (a brand-new request vs. someone actively waiting on
 * a reply), so both outrank a plain "hasn't been followed up on yet". */
const REASON_ORDER: Record<LeadFollowUpReason, number> = {
  replied: 0,
  new: 1,
  needs_follow_up: 2,
};

/**
 * Whether this lead deserves a spot in today's follow-up list, and why.
 * Deliberately narrow — 'qualified'/'converted'/'lost' leads are settled
 * (the owner already decided), so they're never re-surfaced as "needs
 * attention" here; the lead detail page and `/leads` remain the place to
 * review them.
 */
export function getLeadFollowUpReason(lead: LeadRow, now: Date = new Date()): LeadFollowUpReason | null {
  if (lead.status === "replied") return "replied";

  if (lead.status === "new") return "new";

  if (lead.status === "contacted") {
    const since = lead.last_contacted_at ?? lead.captured_at;
    const daysSince = (now.getTime() - new Date(since).getTime()) / DAY_MS;
    if (daysSince >= LEAD_FOLLOWUP_COOLDOWN_DAYS) return "needs_follow_up";
    return null; // contacted recently — give it time before nudging again
  }

  // qualified / converted / lost — not an actionable "follow up today" item.
  return null;
}

export function isRecentlyCaptured(lead: LeadRow, now: Date = new Date()): boolean {
  const hoursSince = (now.getTime() - new Date(lead.captured_at).getTime()) / HOUR_MS;
  return hoursSince <= LEAD_RECENTLY_CAPTURED_HOURS;
}

const REASON_LABEL: Record<LeadFollowUpReason, string> = {
  new: "New website lead",
  replied: "Lead replied",
  needs_follow_up: "Needs follow-up",
};

export function buildLeadFollowUps(leads: LeadRow[], now: Date = new Date()): LeadFollowUp[] {
  const followUps: LeadFollowUp[] = [];
  for (const lead of leads) {
    const reason = getLeadFollowUpReason(lead, now);
    if (!reason) continue;
    followUps.push({ lead, reason, label: REASON_LABEL[reason] });
  }

  return followUps.sort((a, b) => {
    const order = REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
    if (order !== 0) return order;
    // Within the same reason, most recently captured/contacted first.
    return new Date(b.lead.captured_at).getTime() - new Date(a.lead.captured_at).getTime();
  });
}

/** Plain-language "requested X, Y ago" line for a lead card — never
 * "Intent signal detected" (Phase 13 spec step 36). */
export function describeLeadRequest(lead: LeadRow): string {
  const interest = lead.interest?.trim();
  return interest ? `Requested information about ${interest}` : "Requested more information";
}
