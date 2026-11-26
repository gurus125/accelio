/**
 * Phase 9 — applies one Meta message-status webhook event (sent, delivered,
 * read, failed) to our `messages` table, plus an audit row in
 * `message_events`. Uses the service-role admin client throughout: this
 * runs from Meta's servers, not a signed-in user, so there's no session for
 * RLS to key off (same pattern the Phase 8 webhook already established).
 *
 * Correlation is always via `provider_message_id` — the WhatsApp message id
 * Meta assigned when we sent it (stored on `messages.provider_message_id`
 * in `markMessageSent`). Never trusts anything else from the payload to
 * decide which business/customer a status belongs to.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageStatus } from "../types";

interface MetaStatusEntry {
  id?: unknown;
  status?: unknown;
  timestamp?: unknown;
  errors?: { title?: unknown; code?: unknown }[];
}

/** Forward-only progression: sending -> sent -> delivered -> read. A status
 * update is only applied if it's a strict improvement over the current one
 * — an out-of-order or duplicate "sent" arriving after "read" is already
 * recorded must never downgrade it. "failed" is terminal in the other
 * direction: once a message is confirmed delivered or read, a stray later
 * "failed" event is ignored rather than corrupting a real success. */
const STATUS_RANK: Record<MessageStatus, number> = {
  draft: 0,
  approved: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1, // handled separately, never compared by rank
};

function toIsoTimestamp(raw: unknown): string {
  const seconds = typeof raw === "string" ? Number(raw) : null;
  if (seconds && Number.isFinite(seconds)) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function logEvent(
  admin: SupabaseClient,
  params: {
    businessId: string | null;
    messageId: string | null;
    providerMessageId: string;
    eventType: "sent" | "delivered" | "read" | "failed";
    payload: unknown;
    eventTimestamp: string;
  }
): Promise<void> {
  const { error } = await admin.from("message_events").insert({
    business_id: params.businessId,
    message_id: params.messageId,
    provider_message_id: params.providerMessageId,
    event_type: params.eventType,
    event_payload: params.payload,
    event_timestamp: params.eventTimestamp,
  });

  // 23505 = unique_violation on the (provider_message_id, event_type)
  // dedupe index — this is Meta retrying a webhook delivery we've already
  // processed, not an error. Anything else is logged for debugging.
  if (error && error.code !== "23505") {
    console.error("[whatsapp/webhooks] Failed to log message event.", error.message);
  }
}

export async function handleStatusEvent(admin: SupabaseClient, status: MetaStatusEntry): Promise<void> {
  const providerMessageId = typeof status.id === "string" ? status.id : null;
  const rawStatus = typeof status.status === "string" ? status.status : null;
  if (!providerMessageId || !rawStatus) return;

  const eventTimestamp = toIsoTimestamp(status.timestamp);

  if (!["sent", "delivered", "read", "failed"].includes(rawStatus)) {
    // Meta also sends non-terminal statuses we don't track (e.g. "deleted").
    return;
  }
  const eventType = rawStatus as "sent" | "delivered" | "read" | "failed";

  const { data: existing, error: findError } = await admin
    .from("messages")
    .select("id, business_id, status")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (findError) {
    console.error("[whatsapp/webhooks] Failed to look up message for status event.", findError.message);
    return;
  }

  if (!existing) {
    // No matching outbound message — most likely a status for a message
    // sent before Phase 9, or a race with the send request's own DB write.
    // Log it unattributed (business_id/message_id null) so it's visible
    // for debugging without guessing which business it belongs to.
    await logEvent(admin, {
      businessId: null,
      messageId: null,
      providerMessageId,
      eventType,
      payload: status,
      eventTimestamp,
    });
    return;
  }

  const currentStatus = existing.status as MessageStatus;
  const update: Record<string, unknown> = {};

  if (eventType === "failed") {
    // Never downgrade an already-delivered/read message to failed — that
    // would only ever be a stray/out-of-order event, not reality.
    if (STATUS_RANK[currentStatus] < STATUS_RANK.delivered && currentStatus !== "failed") {
      update.status = "failed";
      update.failed_at = eventTimestamp;
      const errorDetail = status.errors?.[0]?.title;
      update.error_message = typeof errorDetail === "string" ? errorDetail.slice(0, 300) : "WhatsApp reported a failure.";
    }
  } else if (currentStatus !== "failed" && STATUS_RANK[eventType] > STATUS_RANK[currentStatus]) {
    update.status = eventType;
    if (eventType === "sent") update.sent_at = update.sent_at ?? eventTimestamp;
    if (eventType === "delivered") update.delivered_at = eventTimestamp;
    if (eventType === "read") update.read_at = eventTimestamp;
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await admin.from("messages").update(update).eq("id", existing.id);
    if (updateError) {
      console.error("[whatsapp/webhooks] Failed to apply status update.", updateError.message);
    } else if (typeof update.status === "string") {
      // Phase 10 — mirror the same status onto any campaign recipient this
      // message is linked to. Not a second tracking system: `messages` is
      // still the single source of truth, this just keeps
      // `campaign_recipients.status` (used for fast campaign result
      // counts) in sync with it. A reply can later upgrade this to
      // "replied" — see inbound.ts.
      const { error: recipientError } = await admin
        .from("campaign_recipients")
        .update({ status: update.status })
        .eq("message_id", existing.id)
        .neq("status", "replied");
      if (recipientError) {
        console.error("[whatsapp/webhooks] Failed to sync campaign recipient status.", recipientError.message);
      }
    }
  }

  await logEvent(admin, {
    businessId: existing.business_id as string,
    messageId: existing.id as string,
    providerMessageId,
    eventType,
    payload: status,
    eventTimestamp,
  });
}
