/**
 * Phase 14 — the scheduler's top-level entry point: runs every active
 * automation across every business, once. Called only from the
 * `CRON_SECRET`-protected `/api/automations/run` route (see that file for
 * why this can never be triggered by an ordinary request) — never from
 * client code, and never on a client-side timer (setInterval/setTimeout
 * are explicitly disallowed as a production scheduler by the spec, since
 * they stop the moment the owner's browser or tab closes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listActiveAutomationsAcrossAllBusinesses } from "./queries";
import { runAutomationOnce } from "./executor";
import type { AutomationRow, AutomationRunOutcome } from "./types";
import type { BusinessRow } from "@/types/database";
import { chunk } from "@/lib/supabase/paginate";

export interface SchedulerTickResult {
  automationId: string;
  businessId: string;
  automationType: string;
  outcomes: AutomationRunOutcome[];
  error?: string;
}

/**
 * Runs one scheduler tick. Groups automations by business so each
 * business's row (and its `automations_paused_at` emergency-stop flag) is
 * fetched once, not once per automation.
 */
export async function runSchedulerTick(supabase: SupabaseClient, now: Date = new Date()): Promise<SchedulerTickResult[]> {
  const automations = await listActiveAutomationsAcrossAllBusinesses(supabase);
  if (automations.length === 0) return [];

  const businessIds = Array.from(new Set(automations.map((a) => a.business_id)));
  // Chunked: `.in()` puts every id in the request URL.
  const businessById = new Map<string, BusinessRow>();
  for (const ids of chunk(businessIds, 150)) {
    const { data: businesses, error } = await supabase.from("businesses").select("*").in("id", ids);
    if (error) throw new Error(error.message);
    for (const b of (businesses ?? []) as BusinessRow[]) businessById.set(b.id, b);
  }

  const results: SchedulerTickResult[] = [];

  for (const automation of automations as AutomationRow[]) {
    const business = businessById.get(automation.business_id);
    if (!business) continue; // orphaned row — shouldn't happen given the FK, but never crash the whole tick over it.

    // Emergency stop (spec step 24): skip immediately, before any candidate
    // lookup at all, for a business that paused all automations. Each
    // automation keeps its own `status` untouched.
    if (business.automations_paused_at) continue;

    try {
      const outcomes = await runAutomationOnce(automation, business, supabase, now);
      results.push({
        automationId: automation.id,
        businessId: business.id,
        automationType: automation.automation_type,
        outcomes,
      });
    } catch (err) {
      // One automation's unexpected failure must never take down the rest
      // of the tick for other businesses/automations.
      results.push({
        automationId: automation.id,
        businessId: business.id,
        automationType: automation.automation_type,
        outcomes: [],
        error: err instanceof Error ? err.message : "Unknown scheduler error.",
      });
    }
  }

  return results;
}
