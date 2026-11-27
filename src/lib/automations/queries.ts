/**
 * Phase 14 — CRUD and read queries for `automations` / `automation_runs`.
 * Same pattern as every other queries.ts in this codebase: RLS is the real
 * boundary, `business_id` filters here are defense in depth. The one
 * exception is `listActiveAutomationsAcrossAllBusinesses`, which is called
 * ONLY by the scheduler with the service-role client — never reachable
 * from a signed-in user's own request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { DEFAULT_BUSINESS_TIMEZONE, startOfBusinessDay } from "@/lib/dates";
import type {
  AutomationActionType,
  AutomationLanguage,
  AutomationRow,
  AutomationRunRow,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTone,
  AutomationType,
} from "./types";

export async function listAutomationsForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRow[]> {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AutomationRow[];
}

export async function getAutomation(
  businessId: string,
  automationId: string,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRow | null> {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", automationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AutomationRow | null;
}

export interface CreateAutomationInput {
  businessId: string;
  createdBy: string;
  name: string;
  description?: string | null;
  automationType: AutomationType;
  actionType: AutomationActionType;
  delayMinutes: number;
  language?: AutomationLanguage;
  tone?: AutomationTone;
  messageTemplate?: string | null;
}

export async function createAutomation(
  input: CreateAutomationInput,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRow> {
  const { data, error } = await supabase
    .from("automations")
    .insert({
      business_id: input.businessId,
      created_by: input.createdBy,
      name: input.name,
      description: input.description ?? null,
      automation_type: input.automationType,
      // Kept 1:1 with automation_type today — see the migration's comment.
      trigger_type: input.automationType,
      action_type: input.actionType,
      status: "draft",
      delay_minutes: input.delayMinutes,
      language: input.language ?? "english",
      tone: input.tone ?? "friendly",
      message_template: input.messageTemplate ?? null,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create automation.");
  return data as AutomationRow;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string | null;
  delayMinutes?: number;
  language?: AutomationLanguage;
  tone?: AutomationTone;
  messageTemplate?: string | null;
}

export async function updateAutomation(
  businessId: string,
  automationId: string,
  input: UpdateAutomationInput,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRow> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.delayMinutes !== undefined) update.delay_minutes = input.delayMinutes;
  if (input.language !== undefined) update.language = input.language;
  if (input.tone !== undefined) update.tone = input.tone;
  if (input.messageTemplate !== undefined) update.message_template = input.messageTemplate;

  const { data, error } = await supabase
    .from("automations")
    .update(update)
    .eq("business_id", businessId)
    .eq("id", automationId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update automation.");
  return data as AutomationRow;
}

export async function setAutomationStatus(
  businessId: string,
  automationId: string,
  status: AutomationStatus,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRow> {
  const { data, error } = await supabase
    .from("automations")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", automationId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update automation status.");
  return data as AutomationRow;
}

export async function stampAutomationLastRunAt(
  automationId: string,
  supabase: SupabaseClient,
  at: Date = new Date()
): Promise<void> {
  const { error } = await supabase.from("automations").update({ last_run_at: at.toISOString() }).eq("id", automationId);
  if (error) throw new Error(error.message);
}

/** Scheduler-only: every currently-active automation across every business,
 * regardless of who owns it. Called with the service-role client — never
 * reachable through a normal signed-in request (RLS would only ever return
 * one business's own rows anyway, which is exactly why the scheduler needs
 * the admin client instead). */
export async function listActiveAutomationsAcrossAllBusinesses(supabase: SupabaseClient): Promise<AutomationRow[]> {
  return fetchAllPages<AutomationRow>((from, to) =>
    supabase.from("automations").select("*").eq("status", "active").order("id").range(from, to)
  );
}

export async function recordAutomationRun(
  params: {
    automationId: string;
    businessId: string;
    leadId?: string;
    customerId?: string;
    messageId?: string | null;
    entityEventKey: string;
    status: AutomationRunStatus;
    reason?: string | null;
  },
  supabase: SupabaseClient
): Promise<AutomationRunRow> {
  const { data, error } = await supabase
    .from("automation_runs")
    .insert({
      automation_id: params.automationId,
      business_id: params.businessId,
      lead_id: params.leadId ?? null,
      customer_id: params.customerId ?? null,
      message_id: params.messageId ?? null,
      entity_event_key: params.entityEventKey,
      status: params.status,
      reason: params.reason ?? null,
    })
    .select("*")
    .single();

  // A unique-index violation here means another concurrent tick already
  // recorded the 'sent' outcome for this exact entity_event_key first —
  // that is the duplicate-execution guard doing its job, not a real error.
  if (error?.code === "23505") {
    const { data: existing, error: fetchError } = await supabase
      .from("automation_runs")
      .select("*")
      .eq("automation_id", params.automationId)
      .eq("entity_event_key", params.entityEventKey)
      .eq("status", "sent")
      .maybeSingle();
    if (!fetchError && existing) return existing as AutomationRunRow;
  }

  if (error || !data) throw new Error(error?.message ?? "Failed to record automation run.");
  return data as AutomationRunRow;
}

export async function listRecentRunsForAutomation(
  businessId: string,
  automationId: string,
  limit = 50,
  supabase: SupabaseClient = createClient()
): Promise<AutomationRunRow[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("business_id", businessId)
    .eq("automation_id", automationId)
    .order("executed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AutomationRunRow[];
}

export interface AutomationAnalyticsSummary {
  automatedMessagesSent: number;
  delivered: number;
  read: number;
  automatedReplies: number;
  skipped: number;
  failed: number;
}

/** Factual, additive automation metrics for the Analytics page (spec step
 * 35) — every number here is a real count, never an attributed revenue
 * figure ("automation generated ₹X" is explicitly disallowed without real
 * attribution, which this product has no basis for). */
export async function getAutomationAnalyticsForBusiness(
  businessId: string,
  supabase: SupabaseClient = createClient()
): Promise<AutomationAnalyticsSummary> {
  const [sentResult, deliveredResult, readResult, skippedResult, failedResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .like("opportunity_type", "automation:%")
      .not("sent_at", "is", null),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .like("opportunity_type", "automation:%")
      .not("delivered_at", "is", null),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .like("opportunity_type", "automation:%")
      .not("read_at", "is", null),
    supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "skipped"),
    supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "failed"),
  ]);

  for (const result of [sentResult, deliveredResult, readResult, skippedResult, failedResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    automatedMessagesSent: sentResult.count ?? 0,
    delivered: deliveredResult.count ?? 0,
    read: readResult.count ?? 0,
    // Replies aren't tagged by automation today (inbound `customer_messages`
    // has no opportunity_type-style attribution column) — reported as 0
    // rather than a guessed figure; documented as a known limitation.
    automatedReplies: 0,
    skipped: skippedResult.count ?? 0,
    failed: failedResult.count ?? 0,
  };
}

export interface AutomationDashboardSummary {
  activeCount: number;
  sentToday: number;
  skippedToday: number;
}

/** Compact counts for the dashboard's small, secondary automation summary
 * card (spec step 28 — "3 active / 12 automated follow-ups today / 2
 * skipped"). Deliberately just three numbers, never a second dashboard. */
export async function getAutomationDashboardSummary(
  businessId: string,
  supabase: SupabaseClient = createClient(),
  now: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Promise<AutomationDashboardSummary> {
  // "Today" = since local midnight in the business's zone.
  const startOfToday = startOfBusinessDay(now, timeZone);

  const [activeResult, sentResult, skippedResult] = await Promise.all([
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "sent")
      .gte("executed_at", startOfToday.toISOString()),
    supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "skipped")
      .gte("executed_at", startOfToday.toISOString()),
  ]);

  for (const result of [activeResult, sentResult, skippedResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    activeCount: activeResult.count ?? 0,
    sentToday: sentResult.count ?? 0,
    skippedToday: skippedResult.count ?? 0,
  };
}
