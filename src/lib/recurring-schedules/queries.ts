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

function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDayOfMonth);
}

function addMonths(year: number, monthIndex: number, count: number): { year: number; monthIndex: number } {
  let total = monthIndex + count;
  let y = year;
  while (total > 11) {
    total -= 12;
    y += 1;
  }
  while (total < 0) {
    total += 12;
    y -= 1;
  }
  return { year: y, monthIndex: total };
}

/**
 * The most recent monthly anniversary of `anchorDate` (strictly after the
 * anchor itself — the anchor date is when the customer joined, not a fee
 * due date) that has occurred at or before `now`. `null` when the very
 * first anniversary hasn't happened yet. Handles month-end anchors (e.g.
 * anchored on the 31st) by clamping to the last real day of a shorter
 * month, same as how a calendar app would.
 */
export function mostRecentAnniversary(anchorDate: Date, now: Date): Date | null {
  const anchorDay = anchorDate.getDate();
  let { year, monthIndex } = addMonths(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  let candidate = new Date(year, monthIndex, clampDayToMonth(year, monthIndex, anchorDay));
  if (candidate.getTime() > now.getTime()) return null;

  // Advance one month at a time while the NEXT anniversary would still be
  // due — schedules are created going forward in practice, so this loop is
  // short, but it's correct even for a schedule whose anchor is far in the
  // past (e.g. imported historical data).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = addMonths(year, monthIndex, 1);
    const nextCandidate = new Date(next.year, next.monthIndex, clampDayToMonth(next.year, next.monthIndex, anchorDay));
    if (nextCandidate.getTime() > now.getTime()) break;
    year = next.year;
    monthIndex = next.monthIndex;
    candidate = nextCandidate;
  }
  return candidate;
}

/** Stable per-period key ("2026-10") for the `automation_runs` uniqueness
 * guard — the same schedule fires at most once per period no matter how
 * many scheduler ticks land inside it. */
export function periodKeyForRecurringSchedule(schedule: RecurringScheduleRow, now: Date): string {
  const anniversary = mostRecentAnniversary(new Date(schedule.anchor_date), now);
  const at = anniversary ?? now;
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
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
  now: Date = new Date()
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
    const anniversary = mostRecentAnniversary(new Date(schedule.anchor_date), now);
    if (!anniversary) continue;
    const customer = customerById.get(schedule.customer_id);
    if (!customer) continue;
    due.push({ schedule, customer });
  }
  return due;
}
