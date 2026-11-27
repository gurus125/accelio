"use server";

import { revalidatePath } from "next/cache";
import { chunk } from "@/lib/supabase/paginate";
import { canMessageCustomer } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { requireOwner } from "@/lib/auth/access";
import { assertCanCreateCampaign } from "@/lib/billing/limits";
import { generateCampaignMessage } from "@/lib/ai/generate-campaign-message";
import type { MessageLanguage, MessageTone } from "@/lib/ai/types";
import { resolveAudienceCandidates, campaignTypeDescription, campaignTypeLabel } from "./audience";
import { getCampaign, listRecipients } from "./queries";
import { hasOnlySupportedVariables } from "./personalize";
import type { CampaignType } from "./types";

/**
 * Every mutation below derives `business_id` from the authenticated
 * session via `requireBusinessForCurrentUser()` — never accepted as a
 * client argument. RLS (Phase 10 migration) enforces the same rule
 * independently, as a second layer, exactly like every other mutation in
 * this app.
 */

export async function createCampaign(input: {
  name: string;
  campaignType: CampaignType;
  description?: string;
}): Promise<{ error?: string; id?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const name = input.name.trim();
  if (!name) return { error: "Campaign name is required." };

  // Phase 16 — checked before the campaign row is ever created.
  try {
    await assertCanCreateCampaign(business.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You've reached your plan's campaign limit." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      business_id: business.id,
      name,
      description: input.description?.trim() || null,
      campaign_type: input.campaignType,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !campaign) return { error: "Couldn't create the campaign. Please try again." };

  // Auto-populate the audience for opportunity-derived types immediately —
  // for "custom" the owner adds customers explicitly (addRecipients below).
  if (input.campaignType !== "custom") {
    const candidates = await resolveAudienceCandidates(business.id, input.campaignType);
    if (candidates.length > 0) {
      await supabase.from("campaign_recipients").upsert(
        candidates.map((c) => ({
          campaign_id: campaign.id,
          business_id: business.id,
          customer_id: c.customer.id,
          status: "selected",
        })),
        { onConflict: "campaign_id,customer_id", ignoreDuplicates: true }
      );
    }
  }

  revalidatePath("/campaigns");
  return { id: campaign.id };
}

export async function addRecipients(campaignId: string, customerIds: string[]): Promise<{ error?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status !== "draft" && campaign.status !== "review") {
    return { error: "This campaign's audience can no longer be changed." };
  }
  if (customerIds.length === 0) return {};

  const supabase = createClient();
  // Re-verify every customer id actually belongs to this business — never
  // trust a client-supplied id list beyond that check (RLS enforces the
  // same on insert, this is defense in depth for a clearer error).
  // Milestone 1 — only customers who agreed to WhatsApp and haven't
  // opted out can be added. Chunked: `.in()` puts every id in the URL.
  const validIds: string[] = [];
  for (const ids of chunk(customerIds, 150)) {
    const { data: ownedCustomers, error: ownedError } = await supabase
      .from("customers")
      .select("id, whatsapp_consent, opted_out_at")
      .eq("business_id", business.id)
      .in("id", ids);
    if (ownedError) return { error: "Couldn't verify customers. Please try again." };
    for (const c of ownedCustomers ?? []) {
      if (canMessageCustomer(c as { whatsapp_consent: boolean; opted_out_at: string | null })) validIds.push(c.id as string);
    }
  }
  if (validIds.length === 0) {
    return { error: "None of these customers can be messaged — they haven't agreed to WhatsApp messages or have opted out." };
  }

  const { error } = await supabase.from("campaign_recipients").upsert(
    validIds.map((customerId) => ({
      campaign_id: campaignId,
      business_id: business.id,
      customer_id: customerId,
      status: "selected",
    })),
    { onConflict: "campaign_id,customer_id", ignoreDuplicates: true }
  );

  if (error) return { error: "Couldn't add customers to the campaign." };

  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}

export async function removeRecipient(campaignId: string, recipientId: string): Promise<{ error?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status !== "draft" && campaign.status !== "review") {
    return { error: "This campaign's audience can no longer be changed." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .delete()
    .eq("id", recipientId)
    .eq("campaign_id", campaignId)
    .eq("business_id", business.id);

  if (error) return { error: "Couldn't remove this customer." };

  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}

export async function setCampaignMessage(
  campaignId: string,
  input: { messageTemplate: string; tone: MessageTone; language: MessageLanguage }
): Promise<{ error?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status !== "draft" && campaign.status !== "review") {
    return { error: "This campaign's message can no longer be changed." };
  }

  const template = input.messageTemplate.trim();
  if (!template) return { error: "A message is required." };
  if (!hasOnlySupportedVariables(template)) {
    return { error: "This message uses a variable Accelio doesn't recognize. Only {{customer_name}} and {{business_name}} are supported." };
  }

  const recipients = await listRecipients(campaignId);
  const nextStatus = recipients.length > 0 ? "review" : "draft";

  const supabase = createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ message_template: template, tone: input.tone, language: input.language, status: nextStatus })
    .eq("id", campaignId)
    .eq("business_id", business.id);

  if (error) return { error: "Couldn't save the message. Please try again." };

  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}

/**
 * Generates ONE reusable message for the whole campaign audience — a
 * single OpenAI call per click, never once per recipient (see the Phase
 * 10 spec's cost-control rule). Does not save anything; the owner reviews
 * and then calls `setCampaignMessage` to persist it, mirroring Phase 7's
 * generate → review → save flow.
 */
export async function generateCampaignAiMessage(
  campaignId: string,
  tone: MessageTone,
  language: MessageLanguage
): Promise<{ error?: string; message?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };

  const result = await generateCampaignMessage({
    business: {
      name: business.name,
      businessType: business.business_type,
      city: business.city,
      discreet: business.discreet_reminders === true,
    },
    audienceLabel: campaignTypeLabel(campaign.campaign_type),
    audienceDescription: campaignTypeDescription(campaign.campaign_type),
    tone,
    language,
  });

  if (!result.ok) return { error: result.error };
  return { message: result.data.message };
}

export async function approveCampaign(campaignId: string): Promise<{ error?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status !== "review") return { error: "This campaign isn't ready to approve yet." };
  if (!campaign.message_template) return { error: "Add a message before approving." };

  const recipients = await listRecipients(campaignId);
  if (recipients.length === 0) return { error: "Add at least one customer before approving." };

  const supabase = createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "approved" })
    .eq("id", campaignId)
    .eq("business_id", business.id);

  if (error) return { error: "Couldn't approve the campaign. Please try again." };

  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}

export async function cancelCampaign(campaignId: string): Promise<{ error?: string }> {
  // Phase 15 — creating/editing/approving campaigns is owner-only; staff
  // can still view status and results via getRecipientsPreview below.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return { error: "Campaign not found." };
  if (!["draft", "review", "approved"].includes(campaign.status)) {
    return { error: "This campaign has already started sending and can't be cancelled." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", campaignId)
    .eq("business_id", business.id);

  if (error) return { error: "Couldn't cancel the campaign. Please try again." };

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return {};
}

// Sending is handled by POST /api/campaigns/[id]/send (see that route),
// not a server action here — it mirrors the existing per-customer
// /api/whatsapp/send pattern and needs a longer execution allowance than
// a typical server action for a campaign with many recipients.

/** Read-only, but exposed as a server action so client components (the
 * campaign creation wizard) can refresh the recipient preview after
 * add/remove without a full page navigation. */
export async function getRecipientsPreview(campaignId: string) {
  const business = await requireBusinessForCurrentUser().catch(() => null);
  if (!business) return [];

  const campaign = await getCampaign(business.id, campaignId);
  if (!campaign) return [];

  const { listRecipientsWithCustomers } = await import("./queries");
  return listRecipientsWithCustomers(campaignId);
}
