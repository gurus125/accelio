export type WhatsAppConnectionStatus = "not_connected" | "connected" | "error";

export interface WhatsAppConnectionRow {
  id: string;
  business_id: string;
  phone_number_id: string | null;
  business_account_id: string | null;
  display_phone_number: string | null;
  connection_status: WhatsAppConnectionStatus;
  created_at: string;
  updated_at: string;
}

export type MessageType = "template" | "freeform";

/** Phase 9 extends the Phase 8 lifecycle with real Meta delivery states.
 * "approved" is kept for schema compatibility (Phase 8's check constraint)
 * but nothing in the app currently produces it — messages go straight from
 * "draft" (never persisted before send) to "sending" on submit. */
export type MessageStatus = "draft" | "approved" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface MessageRow {
  id: string;
  business_id: string;
  /** Exactly one of customer_id/lead_id is ever set (see the Phase 13
   * migration's `messages_customer_or_lead_check`) — a message always
   * belongs unambiguously to a customer OR a lead, never both/neither. */
  customer_id: string | null;
  lead_id: string | null;
  opportunity_type: string | null;
  message_type: MessageType;
  template_name: string | null;
  content: string | null;
  status: MessageStatus;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MetaSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

/** Phase 9 — a real inbound WhatsApp message (customer -> owner). See the
 * Phase 9 migration's comment on why this is a separate table from
 * `messages` rather than a "direction" column on it. */
export interface CustomerMessageRow {
  id: string;
  business_id: string;
  customer_id: string | null;
  /** Phase 13 — set when this inbound message's phone matches a lead
   * instead of (or in addition to exploring as) a known customer. See
   * lib/whatsapp/webhooks/inbound.ts's matching order. */
  lead_id: string | null;
  from_phone: string;
  provider_message_id: string | null;
  message_type: string;
  content: string | null;
  status: "received";
  received_at: string;
  created_at: string;
}

/** One entry in a merged owner<->customer conversation, built by combining
 * `messages` (outbound) and `customer_messages` (inbound) at query time —
 * see `getCommunicationTimelineForCustomer` in queries.ts. */
export type TimelineEntry =
  | { direction: "outbound"; timestamp: string; message: MessageRow }
  | { direction: "inbound"; timestamp: string; message: CustomerMessageRow };

export interface CommunicationSummary {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replies: number;
}

export type MetaWebhookEventType = "sent" | "delivered" | "read" | "failed" | "received";

export interface MessageEventRow {
  id: string;
  business_id: string | null;
  message_id: string | null;
  provider_message_id: string | null;
  event_type: MetaWebhookEventType;
  event_payload: unknown;
  event_timestamp: string;
  created_at: string;
}
