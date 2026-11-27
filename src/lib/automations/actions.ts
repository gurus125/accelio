"use server";

/**
 * Phase 14 — server actions for managing automations from the UI. Every
 * action re-derives the business from the authenticated session (via
 * `requireBusinessForCurrentUser`) — never trusts a client-supplied
 * business_id, matching every other actions.ts in this codebase.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { requireOwner } from "@/lib/auth/access";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { getActiveWhatsAppConnection } from "@/lib/whatsapp/queries";
import { dispatchWhatsAppMessage } from "@/lib/whatsapp/send";
import { prepareWhatsAppSend } from "@/lib/templates/prepare";
import { purposeForAutomationType } from "@/lib/templates/purpose";
import {
  createAutomation,
  getAutomation,
  listAutomationsForBusiness,
  setAutomationStatus,
  updateAutomation,
  type CreateAutomationInput as QueryCreateAutomationInput,
  type UpdateAutomationInput as QueryUpdateAutomationInput,
} from "./queries";
import { hasOnlySupportedAutomationVariables, personalizeAutomationMessage } from "./template";
import { assertCanActivateAutomation } from "@/lib/billing/limits";
import type { AutomationRow, AutomationType } from "./types";

export interface CreateAutomationFormInput {
  name: string;
  description?: string;
  automationType: AutomationType;
  actionType: "create_recommendation" | "send_whatsapp";
  delayMinutes: number;
  messageTemplate?: string;
}

/** Creates a new automation in `draft` status — never active on creation,
 * per the spec's "never silently enabled" rule. The owner must explicitly
 * activate it afterward via `activateAutomation`. */
export async function createAutomationAction(
  input: CreateAutomationFormInput
): Promise<{ error?: string; automation?: AutomationRow }> {
  if (!input.name.trim()) return { error: "Give this automation a short name." };
  if (input.actionType === "send_whatsapp" && input.messageTemplate && !hasOnlySupportedAutomationVariables(input.messageTemplate)) {
    return { error: "This message uses a variable Accelio doesn't recognize. Only {{customer_name}}, {{lead_name}}, {{business_name}}, {{interest}} and {{reminder_label}} are supported." };
  }

  const { business } = await requireOwner();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to do that." };

  const created = await createAutomation(
    {
      businessId: business.id,
      createdBy: user.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      automationType: input.automationType,
      actionType: input.actionType,
      delayMinutes: input.delayMinutes,
      messageTemplate: input.messageTemplate?.trim() || null,
    } satisfies QueryCreateAutomationInput,
    supabase
  );

  revalidatePath("/automations");
  return { automation: created };
}

export async function updateAutomationAction(
  automationId: string,
  input: QueryUpdateAutomationInput
): Promise<{ error?: string }> {
  if (input.messageTemplate && !hasOnlySupportedAutomationVariables(input.messageTemplate)) {
    return { error: "This message uses a variable Accelio doesn't recognize." };
  }
  const { business } = await requireOwner();
  await updateAutomation(business.id, automationId, input);
  revalidatePath("/automations");
  revalidatePath(`/automations/${automationId}`);
  return {};
}

/**
 * Activation is the one moment the spec requires an explicit, non-silent
 * confirmation (steps 25-26) — the UI shows the preview screen and its
 * safety copy BEFORE calling this. Here, the only enforcement left is a
 * hard safety check: a `send_whatsapp` automation can't go active without
 * an approved message template already set (spec step 50 — "if a critical
 * safety component is missing, do not enable automatic sending").
 */
export async function activateAutomationAction(automationId: string): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  const automation = await getAutomation(business.id, automationId);
  if (!automation) return { error: "Automation not found." };

  if (automation.action_type === "send_whatsapp" && !automation.message_template?.trim()) {
    return { error: "Add an approved message before turning this automation on." };
  }

  // Phase 16 — checked before the automation actually starts running.
  try {
    await assertCanActivateAutomation(business.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You've reached your plan's active automation limit." };
  }

  await setAutomationStatus(business.id, automationId, "active");
  revalidatePath("/automations");
  revalidatePath(`/automations/${automationId}`);
  return {};
}

export async function pauseAutomationAction(automationId: string): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  await setAutomationStatus(business.id, automationId, "paused");
  revalidatePath("/automations");
  revalidatePath(`/automations/${automationId}`);
  return {};
}

export async function resumeAutomationAction(automationId: string): Promise<{ error?: string }> {
  return activateAutomationAction(automationId);
}

export async function archiveAutomationAction(automationId: string): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  await setAutomationStatus(business.id, automationId, "archived");
  revalidatePath("/automations");
  revalidatePath(`/automations/${automationId}`);
  return {};
}

/** Settings -> Automations -> "Pause all automations" emergency stop (spec
 * step 24). Sets a business-level flag the scheduler checks FIRST, before
 * even looking at any individual automation's own status — and never
 * touches any automation's own status, so resuming restores exactly what
 * was active before. */
export async function pauseAllAutomationsAction(): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  const supabase = createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ automations_paused_at: new Date().toISOString() })
    .eq("id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/automations");
  return {};
}

export async function resumeAllAutomationsAction(): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  const supabase = createClient();
  const { error } = await supabase.from("businesses").update({ automations_paused_at: null }).eq("id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/automations");
  return {};
}

export async function listAutomationsAction(): Promise<AutomationRow[]> {
  const business = await requireBusinessForCurrentUser();
  return listAutomationsForBusiness(business.id);
}

/**
 * Test Mode (spec step 26): sends the automation's real message template,
 * personalized with placeholder-safe sample values, to ONLY the business
 * owner's own verified number (`businesses.phone`) — never a real
 * customer, and never through the scheduler's candidate-selection path at
 * all. Clearly labeled as a test in the message body itself.
 */
export async function sendAutomationTestMessage(automationId: string): Promise<{ error?: string }> {
  const { business } = await requireOwner();
  const supabase = createClient();

  if (!business.phone?.trim()) {
    return { error: "Add your own WhatsApp number in Settings -> Business profile first." };
  }
  const normalizedPhone = normalizePhoneForWhatsApp(business.phone);
  if (!normalizedPhone) {
    return { error: "Your saved number doesn't look like a valid WhatsApp number." };
  }

  const automation = await getAutomation(business.id, automationId);
  if (!automation) return { error: "Automation not found." };
  if (automation.action_type !== "send_whatsapp" || !automation.message_template) {
    return { error: "This automation doesn't send a WhatsApp message, so there's nothing to test." };
  }

  const connection = await getActiveWhatsAppConnection(business.id);
  if (!connection) return { error: "Connect WhatsApp in Settings first." };

  const sampleContent = personalizeAutomationMessage(automation.message_template, {
    businessName: business.name,
    customerName: "Test Customer",
    leadName: "Test Lead",
    interest: "your services",
  });
  const content = `[TEST MESSAGE — not sent to a real customer]\n\n${sampleContent}`;

  // Test Mode deliberately dispatches OUTSIDE the normal `messages` table
  // pipeline: every `messages` row requires exactly one of customer_id /
  // lead_id, and a test send has neither — it should never appear in a
  // customer's WhatsApp history or analytics. It still uses the exact
  // same planner (Milestone 2) and dispatch path as every real send. The
  // owner hasn't "messaged the business", so this always uses the approved
  // template — proving the template itself works.
  const plan = await prepareWhatsAppSend({
    business,
    recipient: { name: "Test Customer" },
    purpose: purposeForAutomationType(automation.automation_type),
    freeformText: content,
    lastInboundAt: null,
    supabase,
  });
  if (!plan.ok) return { error: plan.error };

  const result = await dispatchWhatsAppMessage({
    phoneNumberId: connection.phone_number_id ?? "",
    to: normalizedPhone,
    plan,
  });

  if (!result.ok) return { error: result.error };
  return {};
}
