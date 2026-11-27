import { NextResponse } from "next/server";
import { redactServiceNames } from "@/lib/templates/plan";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCustomer, listEventsForCustomer } from "@/lib/customers/queries";
import { getLead } from "@/lib/leads/queries";
import { describeLeadSource } from "@/lib/leads/labels";
import { calculateOpportunityForCustomer } from "@/lib/opportunities/calculate";
import { listServiceBaselines } from "@/lib/opportunities/baselines";
import { computeVisitPattern } from "@/lib/opportunities/stats";
import { getRecommendedAction } from "@/lib/opportunities/recommended-action";
import { generateMessage, generateLeadMessage } from "@/lib/ai/generate-message";
import { assertCanGenerateAiMessage, getAiGenerationReservationContext, reserveAiGeneration, releaseAiGeneration } from "@/lib/billing/limits";
import type { MessageLanguage, MessageTone } from "@/lib/ai/types";
import type { LeadRow } from "@/types/database";

// Never cache — this always reflects the current, live opportunity/lead.
export const dynamic = "force-dynamic";

const VALID_TONES: readonly MessageTone[] = ["friendly", "professional", "warm"];
const VALID_LANGUAGES: readonly MessageLanguage[] = ["english", "hinglish", "hindi"];

interface ParsedRequestBody {
  customerId: string | null;
  leadId: string | null;
  tone: MessageTone;
  language: MessageLanguage;
}

function parseRequestBody(body: unknown): ParsedRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const customerId = typeof record.customerId === "string" ? record.customerId : null;
  const leadId = typeof record.leadId === "string" ? record.leadId : null;
  if (Boolean(customerId) === Boolean(leadId)) return null; // exactly one

  const tone: MessageTone = VALID_TONES.includes(record.tone as MessageTone)
    ? (record.tone as MessageTone)
    : "friendly";
  const language: MessageLanguage = VALID_LANGUAGES.includes(record.language as MessageLanguage)
    ? (record.language as MessageLanguage)
    : "english";

  return { customerId, leadId, tone, language };
}

function leadStatusForPrompt(status: LeadRow["status"]): "new" | "contacted" | "replied" | "qualified" {
  return status === "new" || status === "contacted" || status === "replied" || status === "qualified"
    ? status
    : "contacted"; // converted/lost never reach here (no generate action shown for them)
}

/**
 * POST /api/ai/generate-message
 *
 * Deliberately takes only { customerId | leadId, tone, language } from the
 * client — never a client-supplied business/customer/lead/opportunity
 * payload. Every fact used to build the AI prompt is re-derived here,
 * server-side, from the authenticated session's own business — the same
 * "never trust the client" rule the rest of the app follows.
 *
 * Phase 13 adds the `leadId` branch, reusing this SAME route and the SAME
 * underlying `callOpenAiForMessage` (see lib/ai/generate-message.ts) — not
 * a second AI system, just a second, lead-shaped prompt builder, the same
 * way Phase 10's campaign messages already added a second prompt builder
 * alongside the per-customer one.
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { ok: false, error: "This feature isn't available yet." },
        { status: 503 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const parsed = parseRequestBody(rawBody);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "A customer or lead is required." }, { status: 400 });
    }

    const business = await getBusinessForCurrentUser();
    if (!business) {
      return NextResponse.json(
        { ok: false, error: "Set up your business profile first." },
        { status: 403 }
      );
    }

    // Phase 16 — checked BEFORE calling OpenAI, never after: an
    // over-the-limit business must never incur the API cost at all. This
    // fast check runs first purely for a friendly, specific error message;
    // the actual enforcement is the atomic reservation below (Phase 19 —
    // this count-then-act check alone can't prevent two concurrent
    // requests from both passing at 19/20 and producing 21/20 usage).
    try {
      await assertCanGenerateAiMessage(business.id);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "You've reached your plan's AI generation limit." },
        { status: 403 }
      );
    }

    // Phase 19 — atomically reserve the usage slot itself, under a
    // per-business database lock, before ever calling OpenAI. Two
    // concurrent requests at 19/20 can now never both succeed: whichever
    // one wins the lock records its generation first, and the other sees
    // used >= limit and is rejected here, before any API cost is incurred.
    const reservationContext = await getAiGenerationReservationContext(business.id);
    if (!reservationContext) {
      return NextResponse.json(
        { ok: false, error: "Your business's billing couldn't be verified. Please contact support." },
        { status: 403 }
      );
    }
    const reservationId = await reserveAiGeneration(business.id, reservationContext.periodStart, reservationContext.limit);
    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "You've reached your plan's AI message generation limit for this billing period." },
        { status: 403 }
      );
    }

    if (parsed.leadId) {
      const lead = await getLead(business.id, parsed.leadId);
      if (!lead) {
        return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      }

      const result = await generateLeadMessage({
        business: { name: business.name, businessType: business.business_type, city: business.city },
        lead: {
          firstName: lead.name ? lead.name.split(" ")[0] || lead.name : null,
          interest: lead.interest,
          sourceLabel: describeLeadSource(lead.source),
          note: lead.message,
          status: leadStatusForPrompt(lead.status),
        },
        tone: parsed.tone,
        language: parsed.language,
      });

      if (!result.ok) {
        // The reservation already exists (Phase 19) — release it so a
        // failed OpenAI call never eats into the business's monthly
        // allowance, exactly as before.
        await releaseAiGeneration(reservationId);
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    const customer = await getCustomer(business.id, parsed.customerId as string);
    if (!customer) {
      return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
    }

    const events = await listEventsForCustomer(customer.id);
    const serviceBaselines = await listServiceBaselines(business.id);
    const opportunity = calculateOpportunityForCustomer(customer, events, business, serviceBaselines);
    if (!opportunity) {
      return NextResponse.json(
        { ok: false, error: "There's no current opportunity for this customer." },
        { status: 400 }
      );
    }

    const pattern = computeVisitPattern(customer.id, events);

    // Milestone 2 — discreet mode: the AI never sees the service names
    // (they're redacted from the engine's explanation) and is told not to
    // mention one; anything that still slips through is redacted below.
    const discreet = business.discreet_reminders === true;
    const serviceNames = Array.from(new Set(events.map((e) => e.service).filter((s): s is string => Boolean(s))));

    const result = await generateMessage({
      business: {
        name: business.name,
        businessType: business.business_type,
        city: business.city,
        discreet,
      },
      customer: {
        firstName: customer.name.split(" ")[0] || customer.name,
        visitCount: pattern.visitCount,
        daysSinceLastVisit: pattern.daysSinceLastVisit,
        averageReturnDays: pattern.hasReliableReturnPattern ? pattern.averageReturnDays : null,
        totalSpent: pattern.totalSpent,
      },
      opportunity: {
        type: opportunity.type,
        recommendedAction: getRecommendedAction(opportunity.type),
        reason: discreet ? redactServiceNames(opportunity.explanation, serviceNames) : opportunity.explanation,
      },
      tone: parsed.tone,
      language: parsed.language,
    });

    if (!result.ok) {
      await releaseAiGeneration(reservationId);
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    if (discreet) {
      result.data.message = redactServiceNames(result.data.message, serviceNames);
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    // Never leak stack traces / internal details to the client.
    console.error("[api/ai/generate-message] Unexpected error.", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "We couldn't generate a message right now. Please try again." },
      { status: 500 }
    );
  }
}
