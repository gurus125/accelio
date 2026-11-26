/**
 * Types for AI-assisted message generation. The AI only ever decides HOW to
 * phrase a message — WHO to contact and WHY comes entirely from the Phase 6
 * opportunity engine and real customer data, passed in as plain data below.
 */

import type { OpportunityType } from "@/lib/opportunities/types";

export type MessageTone = "friendly" | "professional" | "warm";
export type MessageLanguage = "english" | "hinglish";

export interface AIBusinessContext {
  name: string;
  businessType: string | null;
  city: string | null;
}

/** Deliberately minimal — only what could plausibly help phrase a message.
 * No phone number, no notes, no internal IDs, no account/auth data. */
export interface AICustomerContext {
  firstName: string;
  visitCount: number;
  daysSinceLastVisit: number | null;
  /** Only set when the opportunity engine has established a real, reliable
   * return pattern (see STRONG_PERSONAL_HISTORY_MIN_VISITS) — null means "don't
   * claim a visit pattern," never a guess. */
  averageReturnDays: number | null;
  totalSpent: number;
}

export interface AIOpportunityContext {
  type: OpportunityType;
  /** Short, deterministic label — e.g. "Send a return reminder." */
  recommendedAction: string;
  /** The real, engine-produced explanation of why this customer was
   * flagged (e.g. "Usually visits every 45 days... it's been 74 days").
   * The AI must base its message on this, not re-derive its own reasoning. */
  reason: string;
}

export interface GenerateMessageRequest {
  business: AIBusinessContext;
  customer: AICustomerContext;
  opportunity: AIOpportunityContext;
  tone: MessageTone;
  language: MessageLanguage;
}

export interface GeneratedMessage {
  message: string;
  tone: MessageTone;
  language: MessageLanguage;
}

export type GenerateMessageResult =
  | { ok: true; data: GeneratedMessage }
  | { ok: false; error: string };

/** Phase 10 — context for generating one reusable campaign message
 * template (not tied to a single customer's real numbers, unlike
 * `GenerateMessageRequest` above). */
export interface CampaignAudienceContext {
  business: AIBusinessContext;
  /** Short plain-language segment name, e.g. "Inactive customers". */
  audienceLabel: string;
  /** One factual sentence describing the segment, with no per-customer
   * numbers — e.g. "Customers who haven't visited in a while." */
  audienceDescription: string;
  tone: MessageTone;
  language: MessageLanguage;
}

export type GenerateCampaignMessageResult =
  | { ok: true; data: { message: string; tone: MessageTone; language: MessageLanguage } }
  | { ok: false; error: string };

/** Phase 13 — context for generating a follow-up message to a website
 * LEAD, not an existing customer. Deliberately excludes anything Phase 6
 * would know about a customer (visit count, spend, return pattern) — a
 * lead has none of that yet. Only what the lead actually told the
 * business, plus their current follow-up status. */
export interface AILeadContext {
  firstName: string | null;
  /** What they said they were interested in, if anything — e.g. "Haircut". */
  interest: string | null;
  /** Plain-language source, e.g. "your website's pricing request form". */
  sourceLabel: string;
  /** Any free-text note the lead left. */
  note: string | null;
  status: "new" | "contacted" | "replied" | "qualified";
}

export interface GenerateLeadMessageRequest {
  business: AIBusinessContext;
  lead: AILeadContext;
  tone: MessageTone;
  language: MessageLanguage;
}

export type GenerateLeadMessageResult =
  | { ok: true; data: GeneratedMessage }
  | { ok: false; error: string };
