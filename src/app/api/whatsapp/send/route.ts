import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCustomer } from "@/lib/customers/queries";
import { getLead, markLeadContacted } from "@/lib/leads/queries";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { checkCustomerConsent } from "@/lib/consent";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";
import {
  getWhatsAppConnection,
  reserveWhatsAppMessage,
  markMessageSent,
  markMessageFailed,
} from "@/lib/whatsapp/queries";
import { decideSendMode, dispatchWhatsAppMessage } from "@/lib/whatsapp/send";
import { assertCanSendWhatsAppMessage, getWhatsAppReservationContext } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4096;

interface ParsedRequestBody {
  customerId: string | null;
  leadId: string | null;
  content: string;
  opportunityType: string | null;
}

function parseRequestBody(body: unknown): ParsedRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const customerId = typeof record.customerId === "string" ? record.customerId : null;
  const leadId = typeof record.leadId === "string" ? record.leadId : null;
  const content = typeof record.content === "string" ? record.content.trim() : "";
  const opportunityType = typeof record.opportunityType === "string" ? record.opportunityType : null;

  // Exactly one of customerId/leadId, matching the messages table's own
  // constraint (see the Phase 13 migration) — never both, never neither.
  if (Boolean(customerId) === Boolean(leadId)) return null;
  if (!content) return null;
  return { customerId, leadId, content, opportunityType };
}

/**
 * POST /api/whatsapp/send
 *
 * The ONLY path in the app that actually sends a WhatsApp message — always
 * in direct response to an explicit "Send message" confirmation click.
 * Nothing else calls this: not opportunity load, not AI generation, not a
 * dashboard/page render.
 *
 * Phase 13 extends this to also send to a LEAD (`leadId` instead of
 * `customerId`) — same send path, same Meta call, same `messages` table,
 * no second WhatsApp implementation. Like the customer path, this never
 * trusts client-supplied business context — only the id and the approved
 * `content` come from the client; the business, its WhatsApp connection,
 * and the destination's real phone number are all re-derived server-side
 * from the authenticated session.
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ ok: false, error: "This feature isn't available yet." }, { status: 503 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const parsed = parseRequestBody(rawBody);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "A message and recipient are required." }, { status: 400 });
    }
    if (parsed.content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ ok: false, error: "This message is too long." }, { status: 400 });
    }

    // 1. Authenticate the user, 2. determine their business.
    const business = await getBusinessForCurrentUser();
    if (!business) {
      return NextResponse.json({ ok: false, error: "Set up your business profile first." }, { status: 403 });
    }

    // 3. Retrieve the customer/lead from that business — never trusts a
    // client-supplied business_id; an id belonging to another business
    // simply won't be found here (RLS + this explicit filter).
    let recipientName: string;
    let recipientPhone: string;
    if (parsed.customerId) {
      const customer = await getCustomer(business.id, parsed.customerId);
      if (!customer) {
        return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
      }
      // Milestone 1 — never message someone who opted out or never agreed.
      const consent = checkCustomerConsent(customer);
      if (!consent.allowed) {
        return NextResponse.json({ ok: false, error: consent.message }, { status: 403 });
      }
      recipientName = customer.name;
      recipientPhone = customer.phone;
    } else {
      const lead = await getLead(business.id, parsed.leadId as string);
      if (!lead) {
        return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      }
      if (!lead.phone) {
        return NextResponse.json({ ok: false, error: "This lead doesn't have a phone number on file." }, { status: 400 });
      }
      if (lead.opted_out_at) {
        return NextResponse.json(
          { ok: false, error: "This lead replied STOP and opted out of WhatsApp messages." },
          { status: 403 }
        );
      }
      recipientName = lead.name || "there";
      recipientPhone = lead.phone;
    }

    // Phase 16 — checked BEFORE the Meta API call, never after: an
    // over-the-limit business must never have the send actually attempted.
    // This is a fast, friendly pre-check only — the actual enforcement is
    // the atomic reservation below (Phase 19 hardening).
    try {
      await assertCanSendWhatsAppMessage(business.id);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "You've reached your plan's WhatsApp message limit." },
        { status: 403 }
      );
    }

    // 4. Verify WhatsApp configuration belongs to that business.
    const connection = await getWhatsAppConnection(business.id);
    if (!isWhatsAppEnvConfigured || !connection || connection.connection_status !== "connected" || !connection.phone_number_id) {
      return NextResponse.json({ ok: false, error: "WhatsApp isn't connected." }, { status: 400 });
    }

    // 5. Validate the destination phone number.
    const normalizedPhone = normalizePhoneForWhatsApp(recipientPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { ok: false, error: "This contact has an invalid WhatsApp number." },
        { status: 400 }
      );
    }

    const reservationContext = await getWhatsAppReservationContext(business.id);
    if (!reservationContext) {
      return NextResponse.json(
        { ok: false, error: "Your business's billing couldn't be verified. Please contact support." },
        { status: 403 }
      );
    }

    // 6. Validate the message/template — decide the send mode up front so
    // the persisted record reflects what was actually attempted.
    const decision = decideSendMode();

    // Phase 19 — duplicate-send protection AND the WhatsApp quota check
    // are now one atomic, database-locked reservation (see
    // reserveWhatsAppMessage's own comment): a double-click, a retried
    // request, or two truly concurrent requests can never both create a
    // message row for the same intentional send, and quota enforcement
    // can never be raced past 100%.
    const reservation = await reserveWhatsAppMessage({
      businessId: business.id,
      customerId: parsed.customerId ?? undefined,
      leadId: parsed.leadId ?? undefined,
      opportunityType: parsed.opportunityType,
      messageType: decision.messageType,
      templateName: decision.templateName,
      content: parsed.content,
      periodStart: reservationContext.periodStart,
      limit: reservationContext.limit,
    });
    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "You've reached your plan's WhatsApp message limit for this billing period." },
        { status: 403 }
      );
    }
    if (!reservation.isNewReservation) {
      return NextResponse.json({ ok: true, data: reservation.message, deduped: true });
    }
    const draft = reservation.message;

    // 7. Send through Meta.
    const result = await dispatchWhatsAppMessage({
      phoneNumberId: connection.phone_number_id,
      to: normalizedPhone,
      content: parsed.content,
      customerFirstName: recipientName.split(" ")[0] || recipientName,
      businessName: business.name,
      decision,
    });

    if (!result.ok) {
      // 8. Store the resulting message metadata (failed).
      const failed = await markMessageFailed(draft.id, result.error);
      // 9. Return a safe response — the friendly error only, never Meta's
      // raw error body, tokens, or request payload.
      return NextResponse.json({ ok: false, error: result.error, data: failed }, { status: 502 });
    }

    // 8. Store the resulting message metadata (sent).
    const sent = await markMessageSent(draft.id, result.providerMessageId);

    // Phase 13 — a successful send to a lead is the "we contacted them"
    // event that moves a brand-new lead to "contacted" (see
    // markLeadContacted's own comment on why it never downgrades a lead
    // that's already replied/qualified/etc.).
    if (parsed.leadId) {
      await markLeadContacted(business.id, parsed.leadId);
    }

    // 9. Return a safe response to the frontend.
    return NextResponse.json({ ok: true, data: sent });
  } catch (error) {
    console.error("[api/whatsapp/send] Unexpected error.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Message couldn't be sent." }, { status: 500 });
  }
}
