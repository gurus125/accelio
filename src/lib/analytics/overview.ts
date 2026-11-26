/**
 * Top-level aggregate for the /analytics OVERVIEW section — total
 * customers plus the message/reactivation metrics already computed
 * elsewhere. Exists purely to save the page component from importing and
 * sequencing four separate calls itself.
 */

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsDateRange } from "./date-range";
import { getMessageMetrics, type MessageMetrics } from "./messages";
import { getReactivationSummary, type ReactivationSummary } from "./reactivation-query";

export interface AnalyticsOverview {
  totalCustomers: number;
  messages: MessageMetrics;
  reactivation: ReactivationSummary;
}

export async function getAnalyticsOverview(businessId: string, range: AnalyticsDateRange): Promise<AnalyticsOverview> {
  const supabase = createClient();

  const [customersResult, messages, reactivation] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    getMessageMetrics(businessId, range),
    getReactivationSummary(businessId, range),
  ]);

  if (customersResult.error) throw new Error(customersResult.error.message);

  return {
    totalCustomers: customersResult.count ?? 0,
    messages,
    reactivation,
  };
}
