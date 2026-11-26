/**
 * Per-campaign analytics (Phase 11 section 17-18). Reuses Phase 10's
 * `campaign_recipients` rows as the source of truth for send/delivery/
 * reply state (never re-derives it), and layers reactivation on top using
 * ONLY that campaign's own linked messages as qualifying outreach — a
 * customer's other messages (a different campaign, a one-off per-customer
 * message) are deliberately excluded so a campaign's numbers reflect what
 * that campaign itself did, not the customer's whole relationship with
 * the business (that whole-relationship view is what `customers.ts` and
 * the main `/analytics` totals are for).
 */

import { createClient } from "@/lib/supabase/server";
import { listRecipients } from "@/lib/campaigns/queries";
import type { CampaignRow } from "@/lib/campaigns/types";
import { computeCustomerReactivation, isQualifyingOutreachStatus } from "./reactivation";

export interface CampaignAnalytics {
  campaignId: string;
  recipients: number;
  customersContacted: number;
  sent: number;
  delivered: number;
  read: number;
  repliesTotal: number;
  customersReplied: number;
  returnedAfterOutreach: number;
  revenueTrackingAvailable: boolean;
  revenueTotal: number | null;
}

interface MessageRow {
  id: string;
  customer_id: string;
  status: string;
  sent_at: string | null;
}

interface VisitRow {
  customer_id: string;
  occurred_at: string;
  amount: number | null;
}

export async function getCampaignAnalytics(businessId: string, campaign: CampaignRow): Promise<CampaignAnalytics> {
  const supabase = createClient();
  const recipients = await listRecipients(campaign.id);

  const messageIds = recipients.map((r) => r.message_id).filter((id): id is string => id !== null);
  const customerIds = [...new Set(recipients.map((r) => r.customer_id))];

  const [messagesResult, eventsResult] = await Promise.all([
    messageIds.length > 0
      ? supabase.from("messages").select("id, customer_id, status, sent_at").in("id", messageIds)
      : Promise.resolve({ data: [] as MessageRow[], error: null }),
    customerIds.length > 0
      ? supabase
          .from("customer_events")
          .select("customer_id, occurred_at, amount")
          .eq("business_id", businessId)
          .eq("event_type", "visit")
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [] as VisitRow[], error: null }),
  ]);

  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const messages = (messagesResult.data ?? []) as MessageRow[];
  const events = (eventsResult.data ?? []) as VisitRow[];

  const qualifying = messages.filter((m) => isQualifyingOutreachStatus(m.status) && m.sent_at);
  const sent = qualifying.length;
  const delivered = qualifying.filter((m) => m.status === "delivered" || m.status === "read").length;
  const read = qualifying.filter((m) => m.status === "read").length;
  const contactedCustomerIds = [...new Set(qualifying.map((m) => m.customer_id))];

  const repliedRecipients = recipients.filter((r) => r.status === "replied");

  const visitsByCustomer = new Map<string, { at: string; amount: number | null }[]>();
  for (const e of events) {
    const list = visitsByCustomer.get(e.customer_id) ?? [];
    list.push({ at: e.occurred_at, amount: e.amount !== null ? Number(e.amount) : null });
    visitsByCustomer.set(e.customer_id, list);
  }
  const amountsTrackedAtAll = events.some((e) => e.amount !== null);

  let returnedAfterOutreach = 0;
  let revenueTotal = 0;
  for (const customerId of contactedCustomerIds) {
    const outreaches = qualifying
      .filter((m) => m.customer_id === customerId)
      .map((m) => ({ at: m.sent_at as string }));
    const visits = visitsByCustomer.get(customerId);
    if (!visits || visits.length === 0) continue;

    const result = computeCustomerReactivation(outreaches, visits);
    if (result.returned) {
      returnedAfterOutreach += 1;
      revenueTotal += result.revenue ?? 0;
    }
  }

  return {
    campaignId: campaign.id,
    recipients: recipients.length,
    customersContacted: contactedCustomerIds.length,
    sent,
    delivered,
    read,
    repliesTotal: repliedRecipients.length,
    customersReplied: repliedRecipients.length,
    returnedAfterOutreach,
    revenueTrackingAvailable: amountsTrackedAtAll,
    revenueTotal: amountsTrackedAtAll ? revenueTotal : null,
  };
}
