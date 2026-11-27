/**
 * Calendar-anchored recurring reminders (e.g. a monthly coaching fee due on
 * the join-date anniversary) — deliberately separate from the opportunity
 * engine, which reasons about visit cadence, not calendar dates. See the
 * `recurring_schedules` migration's comment for why, and `automations/
 * triggers.ts`'s `findRecurringScheduleCandidates` for how this feeds the
 * `recurring_schedule` automation type.
 *
 * Same pattern as every other queries module here: RLS is the real
 * boundary, `business_id` filters are defense in depth. `findDueRecurringSchedules`
 * is the one exception called with the scheduler's admin client (no
 * signed-in user), same as the opportunity-based candidate finders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listCustomers } from "@/lib/customers/queries";
import type { CustomerRow, RecurringScheduleRow } from "@/types/database";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { DEFAULT_BUSINESS_TIMEZONE, businessDateKey, daysInMonth, parseDateKey, toDateKey, type DateKey } from "@/lib/dates";

export async function listRecurringSchedulesForCustomer(
  businessId: string,
  customerId: string,
  supabase: SupabaseClient = createClient()
): Promise<RecurringScheduleRow[]> {
  const { data, error } = await supabase
    .from("recurring_schedules")
    .select("*")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as RecurringScheduleRow[];
}

export interface CreateRecurringScheduleInput {
  businessId: string;
  customerId: string;
  label: string;
  anchorDate: string; // YYYY-MM-DD
  createdBy: string;
}

export async function createRecurringSchedule(
  input: CreateRecurringScheduleInput,
  supabase: SupabaseClient = createClient()
): Promise<RecurringScheduleRow> {
  const label = input.label.trim();
  if (!label) throw new Error("Give this recurring reminder a short label, e.g. \"Monthly coaching fee\".");
  if (!input.anchorDate || Number.isNaN(new Date(input.anchorDate).getTime())) {
    throw new Error("Choose a valid anchor date.");
  }

  const { data, error } = await supabase
    .from("recurring_schedules")
    .insert({
      business_id: input.businessId,
      customer_id: input.customerId,
      label,
      anchor_date: input.anchorDate,
      interval_type: "monthly",
      status: "active",
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create the recurring reminder.");
  return data as RecurringScheduleRow;
}

export async function setRecurringScheduleStatus(
  businessId: string,
  scheduleId: string,
  status: "active" | "paused",
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { error } = await supabase
    .from("recurring_schedules")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringSchedule(
  businessId: string,
  scheduleId: string,
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { error } = await supabase.from("recurring_schedules").delete().eq("id", scheduleId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

/**
 * The most recent monthly anniversary of `anchorDate` (strictly after the
 * anchor itself — the anchor date is when the customer joined, not a fee
 * due date) whose calendar date has arrived in the business's time zone.
 * `null` when the very first anniversary hasn't happened yet. Month-end
 * anchors (e.g. the 31st) clamp to the last real day of a shorter month,
 * same as a calendar app.
 *
 * Milestone 1: pure calendar math on "YYYY-MM-DD" dates plus the business
 * zone — never the server's local time, which made this give different
 * answers on a laptop in India and a server in UTC. Returns the
 * anniversary as a Date at UTC midnight of that calendar date.
 */
export function mostRecentAnniversary(
  anchorDate: Date | string,
  now: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Date | null {
  const anchorKey = typeof anchorDate === "string" ? anchorDate.slice(0, 10) : anchorDate.toISOString().slice(0, 10);
  const anchor = parseDateKey(anchorKey);
  const todayKey = businessDateKey(now, timeZone);

  const anniversaryKey = (monthsAfter: number): DateKey => {
    const totalMonths = anchor.month - 1 + monthsAfter;
    const year = anchor.year + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return toDateKey(year, month, Math.min(anchor.day, daysInMonth(year, month)));
  };

  if (anniversaryKey(1) > todayKey) return null;

  // Jump close to today, then step — correct even for an anchor years back.
  const today = parseDateKey(todayKey);
  let k = Math.max(1, (today.year - anchor.year) * 12 + (today.month - anchor.month) - 1);
  while (anniversaryKey(k) > todayKey) k -= 1;
  while (anniversaryKey(k + 1) <= todayKey) k += 1;

  const { year, month, day } = parseDateKey(anniversaryKey(k));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Stable per-period key ("2026-10") for the `automation_runs` uniqueness
 * guard — the same schedule fires at most once per period no matter how
 * many scheduler ticks land inside it. */
export function periodKeyForRecurringSchedule(
  schedule: RecurringScheduleRow,
  now: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const anniversary = mostRecentAnniversary(schedule.anchor_date, now, timeZone);
  return (anniversary ? anniversary.toISOString() : businessDateKey(now, timeZone)).slice(0, 7);
}

/**
 * Every active recurring schedule for this business whose current period
 * is due as of `now`, paired with its customer (schedules whose customer
 * no longer exists, or has no phone on file, are silently excluded — the
 * usual eligibility checks in `automations/eligibility.ts` handle the
 * "no phone" case for every other trigger type the same way).
 */
export async function findDueRecurringSchedules(
  businessId: string,
  supabase: SupabaseClient,
  now: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Promise<{ schedule: RecurringScheduleRow; customer: CustomerRow }[]> {
  const schedules = await fetchAllPages<RecurringScheduleRow>((from, to) =>
    supabase
      .from("recurring_schedules")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("id")
      .range(from, to)
  );
  if (schedules.length === 0) return [];

  const customers = await listCustomers(businessId, supabase);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const due: { schedule: RecurringScheduleRow; customer: CustomerRow }[] = [];
  for (const schedule of schedules) {
    const anniversary = mostRecentAnniversary(schedule.anchor_date, now, timeZone);
    if (!anniversary) continue;
    const customer = customerById.get(schedule.customer_id);
    if (!customer) continue;
    due.push({ schedule, customer });
  }
  return due;
}
