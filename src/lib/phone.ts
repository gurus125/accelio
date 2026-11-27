/**
 * The ONE phone normaliser for Accelio. Every place that saves or matches a
 * phone number — manual customer entry, CSV/Excel import, billing, lead
 * capture, the WhatsApp inbound webhook, "add unknown sender" — goes
 * through `normalizeIndianMobile`, so the same person can never end up
 * stored twice as "98765 43210" and "+919876543210".
 *
 * Canonical stored form: "+91XXXXXXXXXX" (a 10-digit Indian mobile number,
 * first digit 6-9). Anything that isn't confidently that returns null —
 * we never guess, because a wrong guess means a WhatsApp message to a
 * stranger.
 *
 * Pure and dependency-free (no Supabase import) so it can be unit-tested.
 * The SQL twin is
 * `public.normalize_indian_mobile(text)` in
 * supabase/migrations/0016_m1_phone_normalisation.sql — keep them in sync.
 */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** "+91 98765-43210", "919876543210", "09876543210", "0091 98765 43210",
 * "9876543210" -> "+919876543210". Returns null when the input can't be
 * confidently read as an Indian mobile number. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // International prefix "00" (e.g. 0091...).
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  // Country code, optionally followed by a stray trunk "0" (+91 0XXXXXXXXXX).
  else if (digits.length === 13 && digits.startsWith("910")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  // Domestic trunk prefix.
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  return INDIAN_MOBILE.test(digits) ? `+91${digits}` : null;
}

/** True when `raw` normalises to a valid Indian mobile number. */
export function isValidIndianMobile(raw: string | null | undefined): boolean {
  return normalizeIndianMobile(raw) !== null;
}

/** Meta's WhatsApp Cloud API "to" / wa.me format: digits only, with
 * country code, no "+" (e.g. "919876543210"). Null when not normalisable. */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const normalized = normalizeIndianMobile(raw);
  return normalized ? normalized.slice(1) : null;
}

/** "+919876543210" -> "+91 98765 43210" for display. Falls back to the raw
 * input when it isn't a valid number (so legacy data still shows). */
export function formatIndianMobile(raw: string | null | undefined): string {
  const normalized = normalizeIndianMobile(raw);
  if (!normalized) return (raw ?? "").trim();
  const national = normalized.slice(3);
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

export const INVALID_PHONE_MESSAGE = "Enter a valid 10-digit Indian mobile number (starting 6-9).";
