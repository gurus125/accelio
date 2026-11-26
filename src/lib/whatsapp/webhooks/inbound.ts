/**
 * Phase 9 — handles inbound WhatsApp messages (customer -> owner) from
 * Meta's webhook. Uses the service-role admin client (no user session
 * here). Business attribution comes ONLY from the webhook payload's own
 * `phone_number_id` (looked up against `whatsapp_connections`) — never
 * from anything the sender controls, so one business can never end up
 * with another business's inbound messages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneForWhatsApp } from "../phone";

interface MetaInboundMessage {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: { body?: unknown };
}

function toIsoTimestamp(raw: unknown): string {
  const seconds = typeof raw === "string" ? Number(raw) : null;
  if (seconds && Number.isFinite(seconds)) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

export async function handleInboundMessages(
  admin: SupabaseClient,
  phoneNumberId: string | null,
  messages: unknown
): Promise<void> {
  if (!phoneNumberId || !Array.isArray(messages) || messages.length === 0) return;

  // 1. Resolve the business this WhatsApp number belongs to — the only
  // trusted source of business attribution for inbound messages.
  const { data: connection, error: connectionError } = await admin
    .from("whatsapp_connections")
    .select("business_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (connectionError) {
    console.error("[whatsapp/webhooks] Failed to resolve business for inbound message.", connectionError.message);
    return;
  }
  if (!connection) {
    // Unrecognized phone_number_id — can't safely attribute this to any
    // business. Log without customer/business data and stop.
    console.warn("[whatsapp/webhooks] Inbound message for unknown phone_number_id; dropped.");
    return;
  }

  const businessId = connection.business_id as string;

  // 2. Load this business's customers once, so every inbound message in
  // this batch can be matched by normalized phone without N lookups.
  const { data: customers, error: customersError } = await admin
    .from("customers")
    .select("id, phone")
    .eq("business_id", businessId);

  if (customersError) {
    console.error("[whatsapp/webhooks] Failed to load customers for inbound matching.", customersError.message);
    return;
  }

  const phoneToCustomerId = new Map<string, string>();
  for (const customer of (customers ?? []) as { id: string; phone: string }[]) {
    const normalized = normalizePhoneForWhatsApp(customer.phone);
    if (normalized) phoneToCustomerId.set(normalized, customer.id);
  }

  // Phase 13 — also match against this business's leads by normalized
  // phone, so a reply from someone who hasn't (yet) become a customer
  // still shows up on their lead record rather than as an "unknown
  // sender". A phone that matches BOTH is treated as the customer (once
  // someone is a real customer, that's the primary record) — see the
  // `customerId` check below, which always takes precedence.
  const { data: leads, error: leadsError } = await admin
    .from("leads")
    .select("id, phone_normalized, status")
    .eq("business_id", businessId)
    .not("phone_normalized", "is", null);

  if (leadsError) {
    console.error("[whatsapp/webhooks] Failed to load leads for inbound matching.", leadsError.message);
  }

  const phoneToLead = new Map<string, { id: string; status: string }>();
  for (const lead of (leads ?? []) as { id: string; phone_normalized: string; status: string }[]) {
    phoneToLead.set(lead.phone_normalized, { id: lead.id, status: lead.status });
  }

  for (const raw of messages as MetaInboundMessage[]) {
    const providerMessageId = typeof raw.id === "string" ? raw.id : null;
    const fromRaw = typeof raw.from === "string" ? raw.from : null;
    if (!providerMessageId || !fromRaw) continue;

    // Meta sends `from` as digits with country code (e.g. "919876543210"),
    // which is already our normalized shape — but run it through the same
    // normalizer used everywhere else so matching is always apples-to-apples
    // with how customer phone numbers are normalized (see phone.ts).
    const normalizedFrom = normalizePhoneForWhatsApp(fromRaw) ?? fromRaw;
    const customerId = phoneToCustomerId.get(normalizedFrom) ?? null;
    const matchedLead = customerId ? null : phoneToLead.get(normalizedFrom) ?? null;
    const leadId = matchedLead?.id ?? null;

    const receivedAt = toIsoTimestamp(raw.timestamp);
    const messageType = typeof raw.type === "string" ? raw.type : "text";
    const content = messageType === "text" && typeof raw.text?.body === "string" ? raw.text.body.slice(0, 4096) : null;

    const { data: inserted, error: insertError } = await admin
      .from("customer_messages")
      .insert({
        business_id: businessId,
        customer_id: customerId,
        lead_id: leadId,
        from_phone: normalizedFrom,
        provider_message_id: providerMessageId,
        message_type: messageType,
        content,
        received_at: receivedAt,
      })
      .select("id")
      .maybeSingle();

    // 23505 = unique_violation on provider_message_id — Meta retried a
    // webhook delivery for a message we've already stored. Not an error.
    if (insertError && insertError.code !== "23505") {
      console.error("[whatsapp/webhooks] Failed to store inbound message.", insertError.message);
      continue;
    }

    const { error: eventError } = await admin.from("message_events").insert({
      business_id: businessId,
      message_id: null,
      provider_message_id: providerMessageId,
      event_type: "received",
      event_payload: raw,
      event_timestamp: receivedAt,
    });
    if (eventError && eventError.code !== "23505") {
      console.error("[whatsapp/webhooks] Failed to log inbound message event.", eventError.message);
    }

    // Phase 13 — a reply from a lead who hasn't been contacted yet, or
    // is otherwise mid-conversation, moves them to "replied". Never
    // downgrades a lead the owner already marked qualified/converted/lost
    // — those are settled decisions, not something an inbound message
    // should silently reopen.
    if (!insertError && inserted && leadId && matchedLead && ["new", "contacted"].includes(matchedLead.status)) {
      const { error: leadError } = await admin.from("leads").update({ status: "replied" }).eq("id", leadId);
      if (leadError) {
        console.error("[whatsapp/webhooks] Failed to mark lead as replied.", leadError.message);
      }
    }

    if (!insertError && inserted && customerId) {
      // Phase 10 — a reply from a known customer marks their most recent
      // campaign message as "replied". Only a status marker: the reply's
      // actual content still lives solely in `customer_messages` above —
      // this does not create a second reply-storage system.
      const { error: recipientError } = await admin
        .from("campaign_recipients")
        .update({ status: "replied" })
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .in("status", ["sent", "delivered", "read"]);
      if (recipientError) {
        console.error("[whatsapp/webhooks] Failed to mark campaign recipient as replied.", recipientError.message);
      }
    }
  }
}
