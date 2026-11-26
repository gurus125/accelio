/**
 * Phase 9 — handles inbound WhatsApp messages (customer -> owner) from
 * Meta's webhook. Uses the service-role admin client (no user session
 * here). Business attribution comes ONLY from the webhook payload's own
 * `phone_number_id` (looked up against `whatsapp_connections`) — never
 * from anything the sender controls, so one business can never end up
 * with another business's inbound messages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIndianMobile } from "@/lib/phone";
import { parseOptKeyword } from "@/lib/consent";

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

  // 2. Match each sender against this business's customers and leads by
  // exact normalised phone. Phones are stored as "+91XXXXXXXXXX" everywhere
  // (lib/phone.ts), so these are indexed point lookups — no loading every
  // customer into memory (which also silently stopped at 1,000 rows).
  async function findCustomerId(phone: string): Promise<string | null> {
    const { data, error } = await admin
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[whatsapp/webhooks] Failed to match inbound sender to a customer.", error.message);
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  }

  // Phase 13 — also match against this business's leads, so a reply from
  // someone who hasn't (yet) become a customer still shows up on their
  // lead record. A phone that matches BOTH is treated as the customer.
  async function findLead(phone: string): Promise<{ id: string; status: string } | null> {
    const { data, error } = await admin
      .from("leads")
      .select("id, status")
      .eq("business_id", businessId)
      .eq("phone_normalized", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[whatsapp/webhooks] Failed to match inbound sender to a lead.", error.message);
      return null;
    }
    return data ? { id: data.id as string, status: data.status as string } : null;
  }

  for (const raw of messages as MetaInboundMessage[]) {
    const providerMessageId = typeof raw.id === "string" ? raw.id : null;
    const fromRaw = typeof raw.from === "string" ? raw.from : null;
    if (!providerMessageId || !fromRaw) continue;

    // Meta sends `from` as "919876543210"; store and match it in the one
    // canonical "+91XXXXXXXXXX" shape used everywhere (lib/phone.ts).
    const normalizedFrom = normalizeIndianMobile(fromRaw) ?? fromRaw;
    const customerId = await findCustomerId(normalizedFrom);
    const matchedLead = customerId ? null : await findLead(normalizedFrom);
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

    // Milestone 1 — STOP / UNSUBSCRIBE opts the sender out of every future
    // message from this business; START opts them back in. Applied even
    // when Meta re-delivers a message we already stored (idempotent).
    const keyword = parseOptKeyword(content);
    if (keyword) {
      // A number can be both a customer and an old lead — opt out both.
      const optLeadId = leadId ?? (await findLead(normalizedFrom))?.id ?? null;
      await applyOptKeyword(admin, businessId, keyword, { customerId, leadId: optLeadId }, receivedAt);
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

/** Records an opt-out (STOP) or opt-in (START) from an inbound message. */
async function applyOptKeyword(
  admin: SupabaseClient,
  businessId: string,
  keyword: "opt_out" | "opt_in",
  sender: { customerId: string | null; leadId: string | null },
  receivedAt: string
): Promise<void> {
  if (sender.customerId) {
    const update =
      keyword === "opt_out"
        ? { opted_out_at: receivedAt }
        : { opted_out_at: null, whatsapp_consent: true, consent_source: "whatsapp", consent_at: receivedAt };
    let query = admin.from("customers").update(update).eq("business_id", businessId).eq("id", sender.customerId);
    // Never let an older re-delivered START undo a newer STOP (or vice versa).
    if (keyword === "opt_out") query = query.is("opted_out_at", null);
    const { error } = await query;
    if (error) console.error("[whatsapp/webhooks] Failed to record customer opt-out/in.", error.message);
  }
  if (sender.leadId) {
    const { error } = await admin
      .from("leads")
      .update({ opted_out_at: keyword === "opt_out" ? receivedAt : null })
      .eq("business_id", businessId)
      .eq("id", sender.leadId);
    if (error) console.error("[whatsapp/webhooks] Failed to record lead opt-out/in.", error.message);
  }
}
