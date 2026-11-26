/**
 * WhatsApp-facing phone helpers. Thin wrappers over the single shared
 * normaliser in `@/lib/phone` — there is deliberately no second set of
 * phone rules here. Anything that isn't confidently an Indian mobile
 * number returns null ("if the phone number cannot be confidently
 * normalized: do not send").
 */

import { normalizeIndianMobile, toWhatsAppNumber } from "@/lib/phone";

/** Meta's expected "to" format — country code + number, digits only, no
 * leading "+" (e.g. "919876543210") — or null if the number can't be
 * confidently normalized as a valid Indian mobile number. */
export function normalizePhoneForWhatsApp(rawPhone: string): string | null {
  return toWhatsAppNumber(rawPhone);
}

/** "919876543210" or "+919876543210" -> "+91 98765 43210", for display in
 * the send confirmation dialog. */
export function formatNormalizedPhoneForDisplay(normalized: string): string {
  const e164 = normalizeIndianMobile(normalized) ?? normalized;
  const national = e164.replace(/^\+91/, "");
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}
