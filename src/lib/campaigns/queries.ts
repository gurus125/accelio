import { createClient } from "@/lib/supabase/server";
import { chunk, fetchAllPages } from "@/lib/supabase/paginate";
import { canMessageCustomer } from "@/lib/consent";
import type { CustomerRow } from "@/types/database";
import type { CampaignRecipientRow, CampaignRecipientWithCustomer, CampaignResultCounts, CampaignRow } from "./types";

export async function listCampaignsForBusiness(businessId: string): Promise<CampaignRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignRow[];
}

export async function getCampaign(businessId: string, campaignId: string): Promise<CampaignRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CampaignRow | null;
}

export async function listRecipients(campaignId: string): Promise<CampaignRecipientRow[]> {
  const supabase = createClient();
  return fetchAllPages<CampaignRecipientRow>((from, to) =>
    supabase
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

/** Recipients joined with just customer name/phone, for the audience
 * preview and results table. A plain application-level join (two queries)
 * rather than a Postgres join, matching this codebase's existing style
 * (see `lib/whatsapp/queries.ts`'s summary/feed queries). */
export async function listRecipientsWithCustomers(campaignId: string): Promise<CampaignRecipientWithCustomer[]> {
  const supabase = createClient();
  const rows = await listRecipients(campaignId);
  if (rows.length === 0) return [];

  type RecipientCustomer = Pick<CustomerRow, "id" | "name" | "phone" | "whatsapp_consent" | "opted_out_at">;
  const customerById = new Map<string, RecipientCustomer>();
  // Chunked: `.in()` puts every id in the request URL.
  for (const ids of chunk(Array.from(new Set(rows.map((r) => r.customer_id))), 150)) {
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, name, phone, whatsapp_consent, opted_out_at")
      .in("id", ids);
    if (customersError) throw new Error(customersError.message);
    for (const c of (customers ?? []) as RecipientCustomer[]) customerById.set(c.id, c);
  }

  return rows.map((row) => {
    const customer = customerById.get(row.customer_id);
    return {
      ...row,
      customerName: customer?.name ?? "Unknown customer",
      customerPhone: customer?.phone ?? "",
      customerCanMessage: customer ? canMessageCustomer(customer) : false,
    };
  });
}

export async function getCampaignResultCounts(campaignId: string): Promise<CampaignResultCounts> {
  const rows = await listRecipients(campaignId);
  const counts: CampaignResultCounts = { total: rows.length, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, pending: 0 };

  for (const row of rows) {
    switch (row.status) {
      case "sent":
        counts.sent += 1;
        break;
      case "delivered":
        counts.sent += 1;
        counts.delivered += 1;
        break;
      case "read":
        counts.sent += 1;
        counts.delivered += 1;
        counts.read += 1;
        break;
      case "replied":
        counts.sent += 1;
        counts.delivered += 1;
        counts.replied += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "selected":
      case "ready":
        counts.pending += 1;
        break;
      case "skipped":
        break;
    }
  }

  return counts;
}

export interface CustomerCampaignActivity {
  campaignId: string;
  campaignName: string;
  status: CampaignRecipientWithCustomer["status"];
  updatedAt: string;
}

/** Phase 10 — campaign activity for one customer, shown on their profile
 * (section 23 of the spec) via the existing communication/activity area.
 * A plain application-level join, same style as the rest of this module. */
export async function listCampaignActivityForCustomer(customerId: string): Promise<CustomerCampaignActivity[]> {
  const supabase = createClient();
  const { data: recipientRows, error } = await supabase
    .from("campaign_recipients")
    .select("campaign_id, status, updated_at")
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (recipientRows ?? []) as { campaign_id: string; status: CampaignRecipientRow["status"]; updated_at: string }[];
  if (rows.length === 0) return [];

  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, name")
    .in("id", campaignIds);

  if (campaignsError) throw new Error(campaignsError.message);
  const nameById = new Map(((campaigns ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  return rows.map((row) => ({
    campaignId: row.campaign_id,
    campaignName: nameById.get(row.campaign_id) ?? "Campaign",
    status: row.status,
    updatedAt: row.updated_at,
  }));
}
