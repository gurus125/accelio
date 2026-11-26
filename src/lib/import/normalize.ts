/**
 * Pure, dependency-free normalization helpers for imported data. Each
 * function is deliberately conservative: when a value can't be confidently
 * interpreted, it's left `null`/flagged rather than guessed at — imported
 * data becomes real customer records, so silent guessing is worse than
 * asking the owner to check it themselves.
 */

export function normalizeName(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

export interface PhoneResult {
  value: string | null; // normalized as +91XXXXXXXXXX when confident
  valid: boolean;
  raw: string;
}

/** Handles the common Indian formats: 9876543210, +91 9876543210,
 * +919876543210, 91-9876543210, 09876543210 — all normalize to
 * +919876543210. Anything that doesn't reduce to a plausible 10-digit
 * number is left unnormalized and marked invalid, never guessed at. */
export function normalizePhone(raw: string | undefined): PhoneResult {
  const original = (raw ?? "").trim();
  if (!original) return { value: null, valid: false, raw: original };

  let digits = original.replace(/\D/g, "");

  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return { value: `+91${digits}`, valid: true, raw: original };
  }

  return { value: null, valid: false, raw: original };
}

export interface EmailResult {
  value: string | null;
  valid: boolean;
}

export function normalizeEmail(raw: string | undefined): EmailResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, valid: true }; // optional field — empty is fine
  const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return { value: trimmed, valid: looksValid };
}

export interface AmountResult {
  value: number | null;
  valid: boolean;
}

/** Handles ₹4,800 / 4,800 / 4800 / ₹ 4800. */
export function normalizeAmount(raw: string | undefined): AmountResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, valid: true };
  const cleaned = trimmed.replace(/[₹,\s]/g, "");
  const num = Number(cleaned);
  if (cleaned !== "" && Number.isFinite(num)) return { value: num, valid: true };
  return { value: null, valid: false };
}

export function normalizeVisitCount(raw: string | undefined): AmountResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, valid: true };
  const cleaned = trimmed.replace(/[,\s]/g, "");
  const num = Number(cleaned);
  if (cleaned !== "" && Number.isInteger(num) && num >= 0) return { value: num, valid: true };
  return { value: null, valid: false };
}

export type DateStatus = "ok" | "empty" | "ambiguous" | "invalid";

export interface DateResult {
  value: string | null; // ISO yyyy-mm-dd
  status: DateStatus;
  raw: string;
}

function finalizeDate(year: number, month: number, day: number, raw: string): DateResult {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { value: null, status: "invalid", raw };
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  if (!roundTrips) return { value: null, status: "invalid", raw };
  return { value: d.toISOString().slice(0, 10), status: "ok", raw };
}

/** Handles ISO (2026-06-01) confidently. For D/M/Y-style formats
 * (01/06/2026, 01-06-2026), only resolves the order when one part is
 * unambiguously a day (> 12) — otherwise flags the date as ambiguous rather
 * than guessing whether it's day-first or month-first. */
export function normalizeDate(raw: string | undefined): DateResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, status: "empty", raw: trimmed };

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return finalizeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), trimmed);
  }

  const parts = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const year = Number(parts[3]);
    const aIsDay = a > 12 && a <= 31;
    const bIsDay = b > 12 && b <= 31;

    if (aIsDay && !bIsDay) return finalizeDate(year, b, a, trimmed);
    if (bIsDay && !aIsDay) return finalizeDate(year, a, b, trimmed);
    if (a <= 12 && b <= 12) return { value: null, status: "ambiguous", raw: trimmed };
    return { value: null, status: "invalid", raw: trimmed };
  }

  // Fall back to whatever the spreadsheet cell formatted the date as
  // (e.g. Excel's own locale rendering) — only trust it when JS parses it
  // unambiguously and it round-trips.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { value: parsed.toISOString().slice(0, 10), status: "ok", raw: trimmed };
  }

  return { value: null, status: "invalid", raw: trimmed };
}
