/**
 * Tiers 2 and 3 of the opportunity engine's baseline hierarchy — built-in,
 * code-level defaults used only when the business hasn't configured its
 * own interval for a service (tier 1, `service_baselines` table, see
 * `baselines.ts`). Never a source of truth by itself: `resolveExpectedInterval`
 * below is what a rule actually calls, and it always checks the business's
 * own configuration first.
 *
 * Deliberately conservative: a business type or service that isn't
 * recognized here returns `null` rather than a guessed number — no rule may
 * manufacture an opportunity from a baseline that doesn't exist. Retail/
 * boutique businesses are excluded on purpose (see `BUSINESS_TYPE_DEFAULTS`)
 * — a one-off purchase doesn't imply any particular return rhythm the way a
 * salon visit does.
 */

import type { BusinessRow, ServiceBaselineRow } from "@/types/database";

export type BaselineSource = "business_defined" | "service_default" | "business_type_default";

export interface BaselineResolution {
  expectedReturnDays: number;
  source: BaselineSource;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Tier 2 — a handful of common, genuinely predictable service intervals,
 * matched by substring against the free-text `customer_events.service`
 * field. Independent of business type: "haircut" means the same thing at
 * any salon. Ordered with the more specific keywords first so e.g. "beard
 * trim" doesn't fall through to a less specific neighbor.
 */
const SERVICE_DEFAULTS: { keywords: string[]; days: number }[] = [
  { keywords: ["beard"], days: 15 },
  { keywords: ["eyebrow", "threading", "brow"], days: 20 },
  { keywords: ["waxing", "wax"], days: 20 },
  { keywords: ["manicure"], days: 20 },
  { keywords: ["pedicure"], days: 25 },
  { keywords: ["haircut", "hair cut", "hair trim"], days: 30 },
  { keywords: ["hair spa", "hair colour", "hair color"], days: 35 },
  { keywords: ["facial"], days: 45 },
  { keywords: ["oil change", "vehicle service", "car service", "bike service", "servicing"], days: 90 },
  { keywords: ["membership renewal", "membership"], days: 30 },
];

function matchServiceDefault(normalizedService: string): number | null {
  for (const entry of SERVICE_DEFAULTS) {
    if (entry.keywords.some((keyword) => normalizedService.includes(keyword))) {
      return entry.days;
    }
  }
  return null;
}

/**
 * Tier 3 — a generic fallback per business type, for when the specific
 * service isn't recognized (or wasn't named at all). Matched by substring
 * against the business's free-text `business_type` field, since there's no
 * fixed enum for it (Settings just takes free text).
 *
 * `null` is a deliberate answer, not a gap to fill in later: retail/
 * boutique businesses are explicitly excluded per the product decision that
 * a single purchase doesn't justify assuming any return period, and
 * clinic/coaching are excluded because their "return" isn't a generic
 * visit-cadence guess — a clinic's follow-up interval is either explicitly
 * configured (tier 1) or unknown, and coaching-style recurring billing is
 * handled entirely outside the opportunity engine (see
 * `lib/recurring-schedules/`).
 */
const BUSINESS_TYPE_DEFAULTS: { keywords: string[]; days: number | null }[] = [
  { keywords: ["salon", "spa", "parlour", "parlor", "barber"], days: 30 },
  { keywords: ["garage", "workshop", "auto", "car service", "bike service", "mechanic"], days: 90 },
  { keywords: ["gym", "fitness"], days: 30 },
  { keywords: ["clinic", "dental", "dentist", "physio", "hospital"], days: null },
  { keywords: ["boutique", "retail", "store", "shop", "e-commerce", "ecommerce"], days: null },
  { keywords: ["coaching", "academy", "institute", "training", "tuition", "classes"], days: null },
];

function matchBusinessTypeDefault(businessType: string | null): number | null {
  if (!businessType) return null;
  const normalized = normalize(businessType);
  for (const entry of BUSINESS_TYPE_DEFAULTS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.days;
    }
  }
  return null;
}

/**
 * The single entry point a rule calls to find "how many days until this
 * service/customer is expected back" when there isn't (yet) a reliable
 * personal pattern to use instead. Always checks the business's own
 * configuration first (tier 1), then the built-in service default (tier 2,
 * only when a service name is given), then the built-in business-type
 * default (tier 3). Returns `null` — never a guess — when none apply,
 * which is exactly the signal a rule needs to stay silent rather than
 * manufacture an opportunity.
 */
export function resolveExpectedInterval(
  service: string | null,
  business: Pick<BusinessRow, "business_type">,
  businessBaselines: ServiceBaselineRow[]
): BaselineResolution | null {
  const normalizedService = service ? normalize(service) : null;

  if (normalizedService) {
    const businessDefined = businessBaselines.find((b) => normalize(b.service) === normalizedService);
    if (businessDefined) {
      return { expectedReturnDays: businessDefined.expected_return_days, source: "business_defined" };
    }

    const serviceDefault = matchServiceDefault(normalizedService);
    if (serviceDefault !== null) {
      return { expectedReturnDays: serviceDefault, source: "service_default" };
    }
  }

  const typeDefault = matchBusinessTypeDefault(business.business_type);
  if (typeDefault !== null) {
    return { expectedReturnDays: typeDefault, source: "business_type_default" };
  }

  return null;
}
