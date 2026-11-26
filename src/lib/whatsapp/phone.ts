/**
 * Phone-number normalization for WhatsApp sends. Deliberately conservative:
 * anything that isn't confidently an Indian mobile number returns null
 * rather than guessing, per the Phase 8 spec ("if the phone number cannot
 * be confidently normalized: do not send").
 *
 * Note this is intentionally stricter than `@/lib/utils`'s `formatPhone`,
 * which is a display-only formatter (it never validates, only reformats
 * the last 10 digits) — sending money-affecting real messages needs a real
 * validity check, not just a display shape.
 */

const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** Returns Meta's expected "to" format — country code + number, digits
 * only, no leading "+" (e.g. "919876543210") — or null if the number can't
 * be confidently normalized as a valid Indian mobile number. */
export function normalizePhoneForWhatsApp(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");

  // Already has the country code: 91 + a valid 10-digit mobile number.
  if (digits.length === 12 && digits.startsWith("91") && INDIAN_MOBILE_PATTERN.test(digits.slice(2))) {
    return digits;
  }

  // Bare 10-digit Indian mobile number.
  if (digits.length === 10 && INDIAN_MOBILE_PATTERN.test(digits)) {
    return `91${digits}`;
  }

  // Domestic trunk-prefixed (leading 0) — strip it, then re-check.
  if (digits.length === 11 && digits.startsWith("0") && INDIAN_MOBILE_PATTERN.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }

  // Wrong length, non-Indian, or otherwise ambiguous — don't guess.
  return null;
}

/** "919876543210" -> "+91 98765 43210", for display in the send
 * confirmation dialog. Caller must already have a normalized number. */
export function formatNormalizedPhoneForDisplay(normalized: string): string {
  const national = normalized.slice(2);
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}
