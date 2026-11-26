"use server";

/**
 * Server actions for creating/pausing/removing a customer's calendar-
 * anchored recurring reminders (e.g. a monthly coaching fee) from the
 * customer detail page. Owner-gated, same bucket as automations — these
 * feed the `recurring_schedule` automation exactly like an automation
 * configures WhatsApp sends.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth/access";
import {
  createRecurringSchedule,
  deleteRecurringSchedule,
  setRecurringScheduleStatus,
} from "./queries";
import type { RecurringScheduleRow } from "@/types/database";

export async function createRecurringScheduleAction(
  customerId: string,
  label: string,
  anchorDate: string
): Promise<{ error?: string; schedule?: RecurringScheduleRow }> {
  try {
    const { business } = await requireOwner();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You need to be signed in to do that." };

    const schedule = await createRecurringSchedule({
      businessId: business.id,
      customerId,
      label,
      anchorDate,
      createdBy: user.id,
    });
    revalidatePath(`/customers/${customerId}`);
    return { schedule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create this recurring reminder." };
  }
}

export async function setRecurringScheduleStatusAction(
  customerId: string,
  scheduleId: string,
  status: "active" | "paused"
): Promise<{ error?: string }> {
  try {
    const { business } = await requireOwner();
    await setRecurringScheduleStatus(business.id, scheduleId, status);
    revalidatePath(`/customers/${customerId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update this recurring reminder." };
  }
}

export async function deleteRecurringScheduleAction(
  customerId: string,
  scheduleId: string
): Promise<{ error?: string }> {
  try {
    const { business } = await requireOwner();
    await deleteRecurringSchedule(business.id, scheduleId);
    revalidatePath(`/customers/${customerId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove this recurring reminder." };
  }
}
