"use server";

/**
 * Milestone 2 — owner-only actions for Settings -> WhatsApp templates.
 * RLS (message_templates_*_owner policies) enforces the same rule again.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth/access";
import { getWhatsAppConnection } from "@/lib/whatsapp/queries";
import { createWhatsAppTemplate, listWhatsAppTemplates } from "@/lib/whatsapp/client";
import { TEMPLATE_LANGUAGES, type TemplateLanguage, type TemplateStatus } from "./catalog";
import { buildMetaTemplatePayload, mapMetaTemplateStatus, matchMetaStatuses } from "./meta";
import { listMessageTemplates } from "./queries";

type Result = { error?: string; message?: string };

async function ownerBusiness() {
  return (await requireOwner()).business;
}

export async function updateTemplateSettings(input: { language: TemplateLanguage; discreet: boolean }): Promise<Result> {
  let business;
  try {
    business = await ownerBusiness();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Only the business owner can do that." };
  }
  if (!(TEMPLATE_LANGUAGES as readonly string[]).includes(input.language)) return { error: "Choose a language." };

  const supabase = createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ whatsapp_language: input.language, discreet_reminders: input.discreet === true })
    .eq("id", business.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings");
  return { message: "Saved." };
}

/** For templates the owner created/approved directly in WhatsApp Manager:
 * record the status by hand. Only these three are allowed manually. */
export async function setTemplateStatusManually(templateId: string, status: Extract<TemplateStatus, "approved" | "draft" | "paused">): Promise<Result> {
  let business;
  try {
    business = await ownerBusiness();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Only the business owner can do that." };
  }
  if (!["approved", "draft", "paused"].includes(status)) return { error: "Invalid status." };

  const supabase = createClient();
  const { error } = await supabase
    .from("message_templates")
    .update({ status, rejection_reason: null, status_checked_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("business_id", business.id);
  if (error) return { error: "Couldn't update the template." };
  revalidatePath("/settings");
  return {};
}

async function connectedAccountId(businessId: string): Promise<string | null> {
  const connection = await getWhatsAppConnection(businessId);
  if (!connection || connection.connection_status !== "connected") return null;
  return connection.business_account_id || null;
}

/** Submits every draft/rejected template to Meta for review. */
export async function submitTemplatesToWhatsApp(): Promise<Result> {
  let business;
  try {
    business = await ownerBusiness();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Only the business owner can do that." };
  }
  const accountId = await connectedAccountId(business.id);
  if (!accountId) {
    return { error: "Connect WhatsApp with your WhatsApp Business Account ID first (Settings → WhatsApp Business)." };
  }

  const supabase = createClient();
  const templates = (await listMessageTemplates(business.id, supabase)).filter((t) => t.status === "draft" || t.status === "rejected");
  if (templates.length === 0) return { message: "Nothing to submit — every template is already submitted or approved." };

  let submitted = 0;
  const failures: string[] = [];
  for (const template of templates) {
    const result = await createWhatsAppTemplate(accountId, buildMetaTemplatePayload(template));
    if (result.ok) {
      submitted++;
      await supabase
        .from("message_templates")
        .update({
          status: mapMetaTemplateStatus(result.status),
          provider_template_id: result.id,
          rejection_reason: null,
          status_checked_at: new Date().toISOString(),
        })
        .eq("id", template.id)
        .eq("business_id", business.id);
    } else if (result.alreadyExists) {
      // Already on the account (e.g. submitted from another Accelio
      // business on the same WhatsApp account) — the status sync picks it up.
      submitted++;
    } else {
      failures.push(`${template.name} (${template.language}): ${result.error}`);
    }
  }

  // Pull real statuses right away (catches "already exists" ones).
  await syncTemplateStatusesFor(business.id, accountId);
  revalidatePath("/settings");

  if (failures.length > 0) {
    return { error: `${submitted} submitted, ${failures.length} failed: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}` };
  }
  return { message: `${submitted} template${submitted === 1 ? "" : "s"} sent to WhatsApp for review. Approval usually takes minutes to a day — use "Refresh status" to check.` };
}

async function syncTemplateStatusesFor(businessId: string, accountId: string): Promise<Result> {
  const listed = await listWhatsAppTemplates(accountId);
  if (!listed.ok) return { error: listed.error };

  const supabase = createClient();
  const rows = await listMessageTemplates(businessId, supabase);
  const updates = matchMetaStatuses(rows, listed.templates);
  const checkedAt = new Date().toISOString();
  for (const u of updates) {
    await supabase
      .from("message_templates")
      .update({ status: u.status, provider_template_id: u.providerTemplateId, rejection_reason: u.rejectionReason, status_checked_at: checkedAt })
      .eq("id", u.id)
      .eq("business_id", businessId);
  }
  const approved = updates.filter((u) => u.status === "approved").length;
  return { message: `Status updated: ${approved} approved, ${updates.length - approved} not approved yet, ${rows.length - updates.length} not found on WhatsApp.` };
}

/** Reads every template's review status from Meta. */
export async function syncTemplateStatuses(): Promise<Result> {
  let business;
  try {
    business = await ownerBusiness();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Only the business owner can do that." };
  }
  const accountId = await connectedAccountId(business.id);
  if (!accountId) {
    return { error: "Connect WhatsApp with your WhatsApp Business Account ID first (Settings → WhatsApp Business)." };
  }
  const result = await syncTemplateStatusesFor(business.id, accountId);
  revalidatePath("/settings");
  return result;
}
