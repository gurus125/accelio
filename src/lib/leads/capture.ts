/**
 * Public website lead capture — the ONE place a lead can be created without
 * an authenticated Accelio session. Uses the service-role admin client (see
 * `@/lib/supabase/admin`'s own comment on why: a website visitor has no
 * session for RLS to key off, the same situation Phase 9's WhatsApp webhook
 * is in). Because this bypasses RLS entirely, every trust decision normally
 * left to Postgres policies is made explicitly, in code, right here:
 *
 *  - which business owns this submission (via `widget_key`, never a
 *    client-supplied `business_id` — Phase 13 spec step 8/24)
 *  - what fields are accepted at all (Phase 13 spec step 6 — no arbitrary
 *    column ever reaches `.insert()`)
 *  - basic spam/abuse limits (Phase 13 spec step 23/24)
 *
 * Called from `/api/leads` (create) and `/api/widget/[key]` (read-only
 * public config) — never imported into a client component.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeIndianMobile } from "@/lib/phone";
import type { LeadRow, LeadSource, LeadWidgetRow } from "@/types/database";
import {
  LEAD_CAPTURE_RATE_LIMIT_MAX,
  LEAD_CAPTURE_RATE_LIMIT_WINDOW_MINUTES,
  LEAD_DUPLICATE_MERGE_WINDOW_MINUTES,
} from "./constants";

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const INTEREST_MAX = 120;
const MESSAGE_MAX = 1000;
const SOURCE_URL_MAX = 500;

const VALID_SOURCES: readonly LeadSource[] = [
  "website",
  "website_brochure",
  "website_pricing",
  "website_contact",
  "website_booking",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only what a public embed script may legitimately send. Anything else in
 * the request body is silently ignored — never forwarded to `.insert()` —
 * so a crafted payload can't set `status`, `converted_at`, `customer_id`,
 * `business_id`, etc. (Phase 13 spec step 6). */
export interface LeadCaptureInput {
  widgetKey: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  interest?: unknown;
  message?: unknown;
  source?: unknown;
  sourceUrl?: unknown;
  consentGiven?: unknown;
  /** Honeypot field — a real visitor never fills in a field named/hidden
   * like this; a naive scraper bot often does. Any non-empty value here
   * silently drops the submission, no error shown (don't tip off bots). */
  website?: unknown;
}

export type LeadCaptureResult =
  | { ok: true; lead: LeadRow; deduped: boolean }
  | { ok: false; status: number; error: string };

function clampString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Public-safe widget config lookup — only display fields a form needs to
 * render itself, never the business's other data. Returns null for an
 * unknown or deactivated widget key, which the caller must treat as "this
 * form can't be shown" without leaking whether the key ever existed.
 */
export async function getPublicWidgetConfig(
  widgetKey: string
): Promise<{ businessName: string; widget: LeadWidgetRow } | null> {
  const admin = createAdminClient();

  const { data: widget, error } = await admin
    .from("lead_widgets")
    .select("*")
    .eq("widget_key", widgetKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!widget) return null;

  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("name")
    .eq("id", (widget as LeadWidgetRow).business_id)
    .maybeSingle();

  if (businessError) throw new Error(businessError.message);
  if (!business) return null;

  return { businessName: business.name as string, widget: widget as LeadWidgetRow };
}

export async function captureLead(input: LeadCaptureInput): Promise<LeadCaptureResult> {
  // Honeypot — drop silently, report success-shaped nothing to avoid
  // teaching a bot what tripped it. Handled by the route as a 200 no-op.
  if (typeof input.website === "string" && input.website.trim().length > 0) {
    return { ok: false, status: 400, error: "Invalid submission." };
  }

  const widgetKey = typeof input.widgetKey === "string" ? input.widgetKey.trim() : "";
  if (!widgetKey) {
    return { ok: false, status: 400, error: "Invalid form." };
  }

  const admin = createAdminClient();

  const { data: widget, error: widgetError } = await admin
    .from("lead_widgets")
    .select("*")
    .eq("widget_key", widgetKey)
    .eq("is_active", true)
    .maybeSingle();

  if (widgetError) throw new Error(widgetError.message);
  if (!widget) {
    // Unknown/inactive widget key — never reveal which (Phase 13 spec
    // step 8's "must not allow one business to submit leads into another
    // business accidentally or maliciously").
    return { ok: false, status: 404, error: "This form is no longer available." };
  }

  const businessId = (widget as LeadWidgetRow).business_id;

  const name = clampString(input.name, NAME_MAX);
  const rawPhone = clampString(input.phone, 20);
  const email = clampString(input.email, EMAIL_MAX);
  const interest = clampString(input.interest, INTEREST_MAX);
  const message = clampString(input.message, MESSAGE_MAX);
  const sourceUrl = clampString(input.sourceUrl, SOURCE_URL_MAX);
  const requestedSource = typeof input.source === "string" ? input.source : "website";
  const source: LeadSource = VALID_SOURCES.includes(requestedSource as LeadSource)
    ? (requestedSource as LeadSource)
    : (widget as LeadWidgetRow).default_source;

  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  const phoneNormalized = rawPhone ? normalizeIndianMobile(rawPhone) : null;
  // Phone is how the business actually follows up on WhatsApp — require a
  // confidently-normalizable one unless an email was given instead (the DB
  // constraint only requires *some* contact info; here we're stricter
  // about what a WhatsApp-first product can actually act on).
  if (!phoneNormalized && !email) {
    return { ok: false, status: 400, error: "Enter a valid phone number." };
  }
  if (rawPhone && !phoneNormalized) {
    return { ok: false, status: 400, error: "Enter a valid 10-digit Indian mobile number." };
  }

  // Lightweight rate limit (Phase 13 spec step 23/24) — no new
  // infrastructure, just a count against the table this endpoint already
  // writes to.
  const rateLimitSince = new Date(Date.now() - LEAD_CAPTURE_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount, error: rateError } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", rateLimitSince);
  if (rateError) throw new Error(rateError.message);
  if ((recentCount ?? 0) >= LEAD_CAPTURE_RATE_LIMIT_MAX) {
    return { ok: false, status: 429, error: "Too many requests. Please try again shortly." };
  }

  const consentGiven = input.consentGiven === true;
  const consentText = consentGiven ? (widget as LeadWidgetRow).consent_text : null;

  // Duplicate handling (Phase 13 spec step 9/33): the same normalized
  // phone, for the same business, submitting again very recently is
  // treated as one event (e.g. a double-click, or retrying the form) —
  // reuse that lead rather than creating a new row every time. A
  // resubmission after the merge window is a genuinely new, separate
  // interest signal and gets its own lead — real repeat interest is worth
  // seeing as its own event, not silently collapsed forever.
  if (phoneNormalized) {
    const mergeSince = new Date(Date.now() - LEAD_DUPLICATE_MERGE_WINDOW_MINUTES * 60_000).toISOString();
    const { data: existing, error: existingError } = await admin
      .from("leads")
      .select("*")
      .eq("business_id", businessId)
      .eq("phone_normalized", phoneNormalized)
      .gte("created_at", mergeSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing) {
      const existingLead = existing as LeadRow;
      const { data: updated, error: updateError } = await admin
        .from("leads")
        .update({
          name: name ?? existingLead.name,
          email: email ?? existingLead.email,
          interest: interest ?? existingLead.interest,
          message: message ?? existingLead.message,
          source,
          source_url: sourceUrl ?? existingLead.source_url,
          consent_status: consentGiven ? "given" : existingLead.consent_status,
          consent_text: consentGiven ? consentText : existingLead.consent_text,
          consent_given_at: consentGiven ? new Date().toISOString() : existingLead.consent_given_at,
        })
        .eq("id", existingLead.id)
        .select("*")
        .single();
      if (updateError || !updated) throw new Error(updateError?.message ?? "Failed to update lead.");
      return { ok: true, lead: updated as LeadRow, deduped: true };
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from("leads")
    .insert({
      business_id: businessId,
      name,
      phone: rawPhone,
      phone_normalized: phoneNormalized,
      email,
      source,
      source_url: sourceUrl,
      interest,
      message,
      status: "new",
      consent_status: consentGiven ? "given" : "not_recorded",
      consent_text: consentText,
      consent_given_at: consentGiven ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (insertError || !inserted) throw new Error(insertError?.message ?? "Failed to create lead.");
  return { ok: true, lead: inserted as LeadRow, deduped: false };
}
