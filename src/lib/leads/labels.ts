/**
 * Plain-language labels for lead data — never technical/internal names in
 * the UI or in an AI prompt (Phase 13 spec step 36: "Website — Pricing
 * Request", not "source: website_pricing").
 */

import type { LeadSource, LeadStatus } from "@/types/database";

const SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  website_brochure: "Website — Brochure",
  website_pricing: "Website — Pricing Request",
  website_contact: "Website — Contact Form",
  website_booking: "Website — Booking Request",
  manual: "Added manually",
  other: "Other",
};

export function describeLeadSource(source: LeadSource): string {
  return SOURCE_LABEL[source] ?? "Website";
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

export function describeLeadStatus(status: LeadStatus): string {
  return STATUS_LABEL[status] ?? status;
}
