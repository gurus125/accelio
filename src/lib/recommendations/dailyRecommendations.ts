/**
 * Phase 12 — Daily Smart Recommendations. This module deliberately does
 * NOT compute who/why: `calculateOpportunities` (Phase 6) is the sole
 * source of truth for that, called here exactly as `/opportunities` and
 * the dashboard already call it — no second intelligence system, no AI
 * involved in deciding WHO to contact.
 *
 * What this module adds on top of Phase 6:
 *  1. Excludes opportunities that shouldn't be re-surfaced today
 *     (`filters.ts` — invalid phone, unanswered reply, contact cooldown).
 *  2. Translates Phase 6's type/confidence into a plain-language priority
 *     label (`ranking.ts` — never a numeric score).
 *  3. Caps the result to `MAX_DAILY_RECOMMENDATIONS` so the owner isn't
 *     overwhelmed, while reporting how many were eligible in total.
 *
 * Performance: exactly the same queries `/opportunities` already runs
 * (`listCustomers` + `listEventsForBusiness`, both a single query each),
 * plus the two batched queries in `utils.ts` — never one query per
 * customer.
 */

import { listCustomers, listEventsForBusiness } from "@/lib/customers/queries";
import { calculateOpportunities, groupEventsByCustomer } from "@/lib/opportunities/calculate";
import { listServiceBaselines } from "@/lib/opportunities/baselines";
import { getRecommendedAction } from "@/lib/opportunities/recommended-action";
import { normalizePhoneForWhatsApp, formatNormalizedPhoneForDisplay } from "@/lib/whatsapp/phone";
import { getWhatsAppConnection } from "@/lib/whatsapp/queries";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";
import { isEligibleToday, type OutreachContext } from "./filters";
import { derivePriority, PRIORITY_ORDER } from "./ranking";
import { getOutreachContextForBusiness } from "./utils";
import { MAX_DAILY_RECOMMENDATIONS } from "./constants";
import type { DailyRecommendation, DailyRecommendationsResult } from "./types";
import type { Opportunity } from "@/lib/opportunities/types";
import type { BusinessRow } from "@/types/database";

const EMPTY_CONTEXT: OutreachContext = { lastQualifyingMessageAt: null, hasUnansweredReply: false };

export async function getDailyRecommendations(
  business: BusinessRow,
  now: Date = new Date()
): Promise<DailyRecommendationsResult> {
  const businessId = business.id;
  const [customers, events, outreachByCustomer, connection, serviceBaselines] = await Promise.all([
    listCustomers(businessId),
    listEventsForBusiness(businessId),
    getOutreachContextForBusiness(businessId),
    getWhatsAppConnection(businessId),
    listServiceBaselines(businessId),
  ]);

  const whatsappConnected = Boolean(isWhatsAppEnvConfigured && connection?.connection_status === "connected");

  const eventsByCustomerId = groupEventsByCustomer(events);
  // The exact same call `/opportunities` and the dashboard already make —
  // the opportunity engine is untouched and unduplicated.
  const opportunities: Opportunity[] = calculateOpportunities(customers, eventsByCustomerId, business, serviceBaselines, now);

  const eligible = opportunities.filter((opportunity) =>
    isEligibleToday(opportunity, outreachByCustomer.get(opportunity.customerId) ?? EMPTY_CONTEXT, now)
  );

  const ranked = [...eligible].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[derivePriority(a)] - PRIORITY_ORDER[derivePriority(b)];
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score; // Phase 6's own internal ranking as the tiebreaker
  });

  const recommendations: DailyRecommendation[] = ranked.slice(0, MAX_DAILY_RECOMMENDATIONS).map((opportunity) => {
    const context = outreachByCustomer.get(opportunity.customerId) ?? EMPTY_CONTEXT;
    const normalizedPhone = normalizePhoneForWhatsApp(opportunity.customerPhone);
    return {
      opportunity,
      priority: derivePriority(opportunity),
      recommendedAction: getRecommendedAction(opportunity.type),
      lastContactedAt: context.lastQualifyingMessageAt,
      hasUnansweredReply: context.hasUnansweredReply,
      whatsappConnected,
      customerPhoneDisplay: normalizedPhone ? formatNormalizedPhoneForDisplay(normalizedPhone) : null,
    };
  });

  return { recommendations, totalEligible: eligible.length };
}
