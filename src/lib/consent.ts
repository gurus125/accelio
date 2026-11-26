/**
 * Milestone 1 — WhatsApp consent and opt-out rules for customers.
 *
 * A customer may be sent a WhatsApp message (manual send, campaign,
 * automation, reminder) only when BOTH:
 *   - we recorded that they agreed (`whatsapp_consent = true`), and
 *   - they haven't opted out since (`opted_out_at` is null).
 * Opt-out always wins. Replying "STOP" / "UNSUBSCRIBE" on WhatsApp sets
 * `opted_out_at`; replying "START" opts back in.
 *
 * Pure (no Supabase import) so it is unit-tested in scripts/consent-tests.ts.
 */

export const CONSENT_SOURCES = ["manual", "import", "billing", "whatsapp", "lead", "legacy"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export interface CustomerConsentFields {
  whatsapp_consent?: boolean | null;
  opted_out_at?: string | null;
}

export type ConsentBlockReason = "opted_out" | "no_consent";

export type ConsentCheck = { allowed: true } | { allowed: false; reason: ConsentBlockReason; message: string };

export function checkCustomerConsent(customer: CustomerConsentFields): ConsentCheck {
  if (customer.opted_out_at) {
    return {
      allowed: false,
      reason: "opted_out",
      message: "This customer replied STOP and opted out of WhatsApp messages.",
    };
  }
  if (customer.whatsapp_consent !== true) {
    return {
      allowed: false,
      reason: "no_consent",
      message: "This customer hasn't agreed to WhatsApp messages yet. Edit the customer to record their consent.",
    };
  }
  return { allowed: true };
}

export function canMessageCustomer(customer: CustomerConsentFields): boolean {
  return checkCustomerConsent(customer).allowed;
}

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stop all",
  "stopall",
  "unsubscribe",
  "opt out",
  "optout",
  "बंद",
  "बंद करो",
  "band",
  "band karo",
]);

const OPT_IN_KEYWORDS = new Set(["start", "unstop", "subscribe"]);

/** Classifies an inbound WhatsApp text. Only a message that IS the keyword
 * counts (ignoring case, spaces and trailing punctuation) — "please don't
 * stop the offers" or "stop by tomorrow?" are ordinary messages. */
export function parseOptKeyword(text: string | null | undefined): "opt_out" | "opt_in" | null {
  if (!text) return null;
  const cleaned = text
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .replace(/^[^\p{L}]+|[^\p{L}\p{M}]+$/gu, "");
  if (!cleaned || cleaned.length > 20) return null;
  if (OPT_OUT_KEYWORDS.has(cleaned)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(cleaned)) return "opt_in";
  return null;
}
