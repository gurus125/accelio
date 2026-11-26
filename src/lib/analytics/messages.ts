/**
 * WhatsApp engagement metrics (Phase 11 sections 5-9) — sent/delivered/
 * read/replies, plus the derived rates. Reuses `messages` and
 * `customer_messages`, the exact tables Phase 8/9 already maintain; this
 * file adds no new counters, it only aggregates what's already there.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { computeRate, type RateResult } from "./rates";
import { isQualifyingOutreachStatus } from "./reactivation";

export interface MessageMetrics {
  sent: number;
  delivered: number;
  read: number;
  customersContacted: number;
  repliesTotal: number;
  customersReplied: number;
  deliveryRate: RateResult;
  readRate: RateResult;
  replyRate: RateResult;
}

const QUALIFYING_STATUSES = ["sent", "delivered", "read"] as const;

interface QualifyingMessageRow {
  customer_id: string;
  status: string;
}

async function fetchQualifyingMessages(businessId: string, range: AnalyticsDateRange): Promise<QualifyingMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("customer_id, status")
    .eq("business_id", businessId)
    .in("status", QUALIFYING_STATUSES)
    .gte("sent_at", range.startIso)
    .lt("sent_at", range.endIso);

  if (error) throw new Error(error.message);
  return (data ?? []) as QualifyingMessageRow[];
}

/**
 * "Customers Contacted" vs. "Messages Sent" are deliberately different
 * numbers (Phase 11 section 6): one customer messaged 3 times contributes
 * 1 to `customersContacted` and 3 to `sent`. Never conflate the two.
 */
export async function getMessageMetrics(businessId: string, range: AnalyticsDateRange): Promise<MessageMetrics> {
  const supabase = createClient();

  const [messages, repliesResult] = await Promise.all([
    fetchQualifyingMessages(businessId, range),
    supabase
      .from("customer_messages")
      .select("customer_id")
      .eq("business_id", businessId)
      .not("customer_id", "is", null)
      .gte("received_at", range.startIso)
      .lt("received_at", range.endIso),
  ]);

  if (repliesResult.error) throw new Error(repliesResult.error.message);

  // Sanity-check the qualifying-status filter matches the shared
  // reactivation definition, so "sent" here always means the same thing
  // it means when computing reactivation.
  const sentMessages = messages.filter((m) => isQualifyingOutreachStatus(m.status));

  const sent = sentMessages.length;
  const delivered = sentMessages.filter((m) => m.status === "delivered" || m.status === "read").length;
  const read = sentMessages.filter((m) => m.status === "read").length;
  const customersContacted = new Set(sentMessages.map((m) => m.customer_id)).size;

  const replyRows = (repliesResult.data ?? []) as { customer_id: string | null }[];
  const repliesTotal = replyRows.length;
  const customersReplied = new Set(
    replyRows.map((r) => r.customer_id).filter((id): id is string => id !== null)
  ).size;

  return {
    sent,
    delivered,
    read,
    customersContacted,
    repliesTotal,
    customersReplied,
    deliveryRate: computeRate(delivered, sent),
    readRate: computeRate(read, delivered),
    replyRate: computeRate(customersReplied, customersContacted),
  };
}
