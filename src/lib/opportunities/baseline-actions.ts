"use server";

/**
 * Server actions for the Settings page's "service return intervals"
 * section — the business's own tier-1 overrides in the opportunity
 * engine's baseline hierarchy (see `service-defaults.ts`). Owner-gated,
 * same bucket as every other business-configuration action (WhatsApp
 * config, automations, billing).
 */

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/access";
import { deleteServiceBaseline, upsertServiceBaseline } from "./baselines";
import type { ServiceBaselineRow } from "@/types/database";

export async function saveServiceBaselineAction(
  service: string,
  expectedReturnDays: number
): Promise<{ error?: string; baseline?: ServiceBaselineRow }> {
  try {
    const { business } = await requireOwner();
    const baseline = await upsertServiceBaseline(business.id, service, expectedReturnDays);
    revalidatePath("/settings");
    return { baseline };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save this service interval." };
  }
}

export async function deleteServiceBaselineAction(baselineId: string): Promise<{ error?: string }> {
  try {
    const { business } = await requireOwner();
    await deleteServiceBaseline(business.id, baselineId);
    revalidatePath("/settings");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove this service interval." };
  }
}
