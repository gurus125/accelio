/**
 * Batched contact-history lookup for the whole business in two queries —
 * NOT one query per customer (Phase 12 spec section 18 explicitly warns
 * against N+1 here, and the dashboard needs to stay fast with thousands
 * of customers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TimelineEntry } from "@/lib/whatsapp/types";
import type { OutreachContext } from "./filters";

const QUALIFYING_STATUSES = new Set(["sent", "delivered", "read"]);

interface OutboundRow {
  customer_id: string;
  sent_at: string;
}

interface InboundRow {
  customer_id: string;
  received_at: string;
}

/**
 * Returns a map of customerId -> outreach context for an entire business,
 * built from exactly two queries (one for outbound `messages`, one for
 * inbound `customer_messages`) regardless of how many customers or
 * messages exist.
 */
export async function getOutreachContextForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<Map<string, OutreachContext>> {

  const [outboundResult, inboundResult] = await Promise.all([
    supabase
      .from("messages")
      .select("customer_id, sent_at")
      .eq("business_id", businessId)
      .in("status", ["sent", "delivered", "read"])
      .not("sent_at", "is", null),
    supabase
      .from("customer_messages")
      .select("customer_id, received_at")
      .eq("business_id", businessId)
      .not("customer_id", "is", null),
  ]);

  if (outboundResult.error) throw new Error(outboundResult.error.message);
  if (inboundResult.error) throw new Error(inboundResult.error.message);

  const lastOutboundByCustomer = new Map<string, string>();
  for (const row of (outboundResult.data ?? []) as OutboundRow[]) {
    const current = lastOutboundByCustomer.get(row.customer_id);
    if (!current || row.sent_at > current) lastOutboundByCustomer.set(row.customer_id, row.sent_at);
  }

  const lastInboundByCustomer = new Map<string, string>();
  for (const row of (inboundResult.data ?? []) as InboundRow[]) {
    const current = lastInboundByCustomer.get(row.customer_id);
    if (!current || row.received_at > current) lastInboundByCustomer.set(row.customer_id, row.received_at);
  }

  const customerIds = new Set<string>([...lastOutboundByCustomer.keys(), ...lastInboundByCustomer.keys()]);
  const context = new Map<string, OutreachContext>();

  for (const customerId of customerIds) {
    const lastOutboundAt = lastOutboundByCustomer.get(customerId) ?? null;
    const lastInboundAt = lastInboundByCustomer.get(customerId) ?? null;
    const hasUnansweredReply = lastInboundAt !== null && (lastOutboundAt === null || lastInboundAt > lastOutboundAt);
    context.set(customerId, { lastQualifyingMessageAt: lastOutboundAt, hasUnansweredReply });
  }

  return context;
}


/**
 * Derives one customer's outreach context from their already-fetched
 * communication timeline (see `getCommunicationTimelineForCustomer`) —
 * used on the customer profile page, where the timeline is already
 * loaded for the "Communication history" card, so checking whether this
 * one customer is currently recommended needs no extra business-wide
 * query. `timeline` is expected sorted newest-first, exactly what that
 * function already returns.
 */
export function deriveOutreachContextFromTimeline(timeline: TimelineEntry[]): OutreachContext {
  const lastOutbound = timeline.find(
    (entry): entry is Extract<TimelineEntry, { direction: "outbound" }> =>
      entry.direction === "outbound" && QUALIFYING_STATUSES.has(entry.message.status)
  );
  const lastInbound = timeline.find((entry) => entry.direction === "inbound");

  const lastQualifyingMessageAt = lastOutbound?.timestamp ?? null;
  const hasUnansweredReply =
    lastInbound !== undefined &&
    (lastOutbound === undefined || new Date(lastInbound.timestamp).getTime() > new Date(lastOutbound.timestamp).getTime());

  return { lastQualifyingMessageAt, hasUnansweredReply };
}
