import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  CommunicationSummary,
  CustomerMessageRow,
  MessageRow,
  MessageStatus,
  MessageType,
  TimelineEntry,
  WhatsAppConnectionRow,
} from "./types";

/**
 * All business-scoped like the rest of the app's queries — RLS is the real
 * boundary, but every query here still filters explicitly as defense in
 * depth (see the comment at the top of `@/lib/customers/queries`).
 */

export async function getWhatsAppConnection(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<WhatsAppConnectionRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as WhatsAppConnectionRow | null;
}

/** Milestone 1 — the connection only if it is actually CONNECTED with a
 * phone number id. Every automated send path uses this, so a business
 * whose connection errored (or lost its number to its real owner, see
 * migration 0019) can never send through a stale phone_number_id. */
export async function getActiveWhatsAppConnection(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<(WhatsAppConnectionRow & { phone_number_id: string }) | null> {
  const connection = await getWhatsAppConnection(businessId, supabase);
  if (!connection || connection.connection_status !== "connected" || !connection.phone_number_id) return null;
  return connection as WhatsAppConnectionRow & { phone_number_id: string };
}

export async function listMessagesForCustomer(customerId: string): Promise<MessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

/** Phase 13 — same as above, for a lead's messages instead of a
 * customer's. Kept as its own tiny function (rather than an `entityType`
 * parameter threaded through) since the two call sites never mix. */
export async function listMessagesForLead(leadId: string): Promise<MessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

/** Duplicate-send guard: an identical message to the same customer created
 * very recently and already sending/sent means this is a double-click or a
 * retried request, not a new, intentional send. */
export async function findRecentDuplicateMessage(
  businessId: string,
  entity: { customerId: string } | { leadId: string },
  content: string,
  supabase: SupabaseClient = createClient()
): Promise<MessageRow | null> {
  const since = new Date(Date.now() - 30_000).toISOString();

  let query = supabase
    .from("messages")
    .select("*")
    .eq("business_id", businessId)
    .eq("content", content)
    .in("status", ["sending", "sent", "delivered", "read"])
    .gte("created_at", since);

  query = "customerId" in entity ? query.eq("customer_id", entity.customerId) : query.eq("lead_id", entity.leadId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) throw new Error(error.message);
  return data as MessageRow | null;
}

export async function createMessageRecord(params: {
  businessId: string;
  /** Exactly one of these two must be set — see the Phase 13 migration's
   * `messages_customer_or_lead_check` constraint, mirrored here so a bug
   * fails fast in application code rather than only at the DB layer. */
  customerId?: string;
  leadId?: string;
  opportunityType: string | null;
  messageType: MessageType;
  templateName: string | null;
  content: string;
  status: MessageStatus;
}, supabase: SupabaseClient = createClient()): Promise<MessageRow> {
  if (Boolean(params.customerId) === Boolean(params.leadId)) {
    throw new Error("createMessageRecord requires exactly one of customerId or leadId.");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      business_id: params.businessId,
      customer_id: params.customerId ?? null,
      lead_id: params.leadId ?? null,
      opportunity_type: params.opportunityType,
      message_type: params.messageType,
      template_name: params.templateName,
      content: params.content,
      status: params.status,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create message record.");
  return data as MessageRow;
}

export interface ReserveWhatsAppMessageParams {
  businessId: string;
  customerId?: string;
  leadId?: string;
  opportunityType: string | null;
  messageType: MessageType;
  templateName: string | null;
  content: string;
  /** The plan's current billing-period start and its WhatsApp message
   * limit — see `@/lib/billing/limits`'s `getWhatsAppReservationContext`. */
  periodStart: Date;
  limit: number;
}

export interface ReserveWhatsAppMessageResult {
  message: MessageRow;
  /** false means an identical send to this recipient in the last 30s
   * already exists (the returned `message` IS that existing row — a
   * double-click or retry, not a new send). true means a brand-new
   * 'sending' row was just reserved and the caller should actually
   * dispatch it. */
  isNewReservation: boolean;
}

/**
 * Phase 19 hardening — the duplicate-send check, the WhatsApp quota check,
 * and the message insert used to be three separate round trips
 * (`findRecentDuplicateMessage` + `assertCanSendWhatsAppMessage` +
 * `createMessageRecord`), which meant two concurrent requests (a
 * double-click, a retried request, or two recipients in the same
 * campaign-send batch) could each see "no duplicate yet" / "under quota"
 * before either had written anything, and both proceed — producing a
 * duplicate WhatsApp send or usage past the plan's limit.
 *
 * This calls a single Postgres function (`reserve_whatsapp_message`, see
 * the Phase 19 migration) that holds a per-business advisory lock for the
 * whole check-and-insert, so every caller — the customer/lead send route,
 * campaign sends, and the automation scheduler alike — gets a truly
 * atomic reservation. Returns `null` only when the plan's WhatsApp quota
 * is exhausted (the duplicate case still returns the existing row).
 */
export async function reserveWhatsAppMessage(
  params: ReserveWhatsAppMessageParams,
  supabase: SupabaseClient = createClient()
): Promise<ReserveWhatsAppMessageResult | null> {
  if (Boolean(params.customerId) === Boolean(params.leadId)) {
    throw new Error("reserveWhatsAppMessage requires exactly one of customerId or leadId.");
  }

  const { data, error } = await supabase.rpc("reserve_whatsapp_message", {
    p_business_id: params.businessId,
    p_customer_id: params.customerId ?? null,
    p_lead_id: params.leadId ?? null,
    p_opportunity_type: params.opportunityType,
    p_message_type: params.messageType,
    p_template_name: params.templateName,
    p_content: params.content,
    p_period_start: params.periodStart.toISOString(),
    p_limit: params.limit,
  });

  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as (MessageRow & { is_new_reservation: boolean }) | undefined;
  if (!row) return null; // quota exhausted — no duplicate found, no room to reserve.

  const { is_new_reservation, ...message } = row;
  return { message: message as MessageRow, isNewReservation: is_new_reservation };
}

export async function markMessageSent(
  id: string,
  providerMessageId: string,
  supabase: SupabaseClient = createClient()
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("messages")
    .update({
      status: "sent",
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update message record.");
  return data as MessageRow;
}

export async function markMessageFailed(
  id: string,
  errorMessage: string,
  supabase: SupabaseClient = createClient()
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("messages")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 300),
      failed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update message record.");
  return data as MessageRow;
}

/**
 * Phase 9 — the merged owner<->customer conversation for one customer,
 * combining outbound `messages` and inbound `customer_messages` into a
 * single time-ordered list. This is a read-time join, not a new stored
 * model — see the Phase 9 migration's comment on why inbound and outbound
 * stay in separate tables.
 */
export async function getCommunicationTimelineForCustomer(customerId: string): Promise<TimelineEntry[]> {
  const supabase = createClient();

  const [outboundResult, inboundResult] = await Promise.all([
    supabase.from("messages").select("*").eq("customer_id", customerId),
    supabase.from("customer_messages").select("*").eq("customer_id", customerId),
  ]);

  if (outboundResult.error) throw new Error(outboundResult.error.message);
  if (inboundResult.error) throw new Error(inboundResult.error.message);

  const outbound: TimelineEntry[] = ((outboundResult.data ?? []) as MessageRow[]).map((message) => ({
    direction: "outbound" as const,
    timestamp: message.sent_at ?? message.created_at,
    message,
  }));

  const inbound: TimelineEntry[] = ((inboundResult.data ?? []) as CustomerMessageRow[]).map((message) => ({
    direction: "inbound" as const,
    timestamp: message.received_at,
    message,
  }));

  return [...outbound, ...inbound].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/** Whether this customer has ever replied — drives the "Customer replied"
 * badge on the profile page. A simple existence check, not a full unread
 * count (Phase 9 deliberately keeps this to a plain indicator, not a
 * notification system — see the Phase 9 spec). */
/**
 * Phase 13 — same merged-timeline idea as
 * `getCommunicationTimelineForCustomer`, for a lead instead. A lead's
 * inbound replies live in the same `customer_messages` table (matched by
 * `lead_id` — see lib/whatsapp/webhooks/inbound.ts), not a second table.
 */
export async function getCommunicationTimelineForLead(leadId: string): Promise<TimelineEntry[]> {
  const supabase = createClient();

  const [outboundResult, inboundResult] = await Promise.all([
    supabase.from("messages").select("*").eq("lead_id", leadId),
    supabase.from("customer_messages").select("*").eq("lead_id", leadId),
  ]);

  if (outboundResult.error) throw new Error(outboundResult.error.message);
  if (inboundResult.error) throw new Error(inboundResult.error.message);

  const outbound: TimelineEntry[] = ((outboundResult.data ?? []) as MessageRow[]).map((message) => ({
    direction: "outbound" as const,
    timestamp: message.sent_at ?? message.created_at,
    message,
  }));

  const inbound: TimelineEntry[] = ((inboundResult.data ?? []) as CustomerMessageRow[]).map((message) => ({
    direction: "inbound" as const,
    timestamp: message.received_at,
    message,
  }));

  return [...outbound, ...inbound].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function customerHasReplied(customerId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("customer_messages")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * Lightweight WhatsApp activity counters for the current business, used by
 * the Activity page's summary tiles. Intentionally just five counts — no
 * time-series, no per-campaign breakdowns (see the Phase 9 spec's warning
 * against overbuilding analytics here).
 */
export async function getCommunicationSummaryForBusiness(businessId: string): Promise<CommunicationSummary> {
  const supabase = createClient();

  const [sent, delivered, read, failed, replies] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("sent_at", "is", null),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("delivered_at", "is", null),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("read_at", "is", null),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "failed"),
    supabase
      .from("customer_messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);

  for (const result of [sent, delivered, read, failed, replies]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    sent: sent.count ?? 0,
    delivered: delivered.count ?? 0,
    read: read.count ?? 0,
    failed: failed.count ?? 0,
    replies: replies.count ?? 0,
  };
}

/** Recent outbound + inbound activity across the whole business, for the
 * Activity page's feed. Capped and merged the same way as the per-customer
 * timeline above. */
export async function listRecentCommunicationForBusiness(
  businessId: string,
  limit = 30
): Promise<(TimelineEntry & { customerId: string | null })[]> {
  const supabase = createClient();

  const [outboundResult, inboundResult] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("customer_messages")
      .select("*")
      .eq("business_id", businessId)
      .not("customer_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(limit),
  ]);

  if (outboundResult.error) throw new Error(outboundResult.error.message);
  if (inboundResult.error) throw new Error(inboundResult.error.message);

  const outbound = ((outboundResult.data ?? []) as MessageRow[]).map((message) => ({
    direction: "outbound" as const,
    timestamp: message.sent_at ?? message.created_at,
    message,
    customerId: message.customer_id,
  }));

  const inbound = ((inboundResult.data ?? []) as CustomerMessageRow[]).map((message) => ({
    direction: "inbound" as const,
    timestamp: message.received_at,
    message,
    customerId: message.customer_id,
  }));

  return [...outbound, ...inbound]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/** Inbound messages that couldn't be matched to any known customer —
 * surfaced on the Activity page so the owner can explicitly add them as a
 * customer rather than Accelio silently creating one. */
export async function listUnknownSendersForBusiness(businessId: string): Promise<CustomerMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_messages")
    .select("*")
    .eq("business_id", businessId)
    .is("customer_id", null)
    .order("received_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerMessageRow[];
}

/** Attaches every unknown-sender message from this phone number to a
 * (just-created or existing) customer, once the owner explicitly confirms
 * who it is. Never called automatically. */
export async function attachUnknownSenderToCustomer(
  businessId: string,
  fromPhone: string,
  customerId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("customer_messages")
    .update({ customer_id: customerId })
    .eq("business_id", businessId)
    .eq("from_phone", fromPhone)
    .is("customer_id", null);

  if (error) throw new Error(error.message);
}
