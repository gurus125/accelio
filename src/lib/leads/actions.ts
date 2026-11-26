"use server";

/**
 * Authenticated, owner-initiated lead mutations — status changes, lead ->
 * customer conversion, and widget configuration. Every function here
 * re-derives `business_id` from the signed-in session via
 * `requireBusinessForCurrentUser()`, exactly like `lib/customers/actions.ts`
 * — never accepted as an argument, so a client can never act on another
 * business's lead. RLS enforces the same rule again, independently.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { requireOwner } from "@/lib/auth/access";
import { normalizeIndianMobile } from "@/lib/phone";
import type { LeadRow, LeadStatus, LeadWidgetRow } from "@/types/database";

const MUTABLE_STATUSES: readonly LeadStatus[] = ["new", "contacted", "replied", "qualified", "converted", "lost"];

export async function setLeadStatus(leadId: string, status: LeadStatus): Promise<{ error?: string }> {
  if (!MUTABLE_STATUSES.includes(status)) return { error: "Invalid status." };

  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "You need a business profile to do that." };
  }

  const supabase = createClient();
  const update: Record<string, unknown> = { status };
  if (status === "converted") update.converted_at = new Date().toISOString();

  const { error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .eq("business_id", business.id);

  if (error) return { error: error.message };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return {};
}

/**
 * Lead -> customer conversion (Phase 13 spec step 21). Deliberately a
 * distinct, explicit owner action — a lead never silently becomes a
 * customer just because a message was sent or a reply came in.
 *
 * Matches an existing customer by normalized phone first (same normalizer
 * used everywhere else — `lib/whatsapp/phone.ts`), so a lead who already
 * exists as a customer gets LINKED rather than duplicated. Only creates a
 * new customer row when no match exists and the lead actually has a usable
 * phone number — a lead with only an email can be converted by linking to
 * a manually-picked existing customer via a future enhancement, but this
 * phase keeps the automatic path to what's unambiguous.
 */
export async function convertLeadToCustomer(leadId: string): Promise<{ error?: string; customerId?: string }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "You need a business profile to do that." };
  }

  const supabase = createClient();

  const { data: leadData, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (leadError) return { error: leadError.message };
  const lead = leadData as LeadRow | null;
  if (!lead) return { error: "Lead not found." };
  if (lead.customer_id) return { error: "This lead is already linked to a customer.", customerId: lead.customer_id };

  const normalizedLeadPhone = normalizeIndianMobile(lead.phone_normalized ?? lead.phone);
  if (!normalizedLeadPhone) {
    return { error: "This lead doesn't have a usable phone number to match or create a customer from." };
  }

  // Customer phones are stored normalised ("+91XXXXXXXXXX", see
  // lib/phone.ts), so an exact match is the correct and complete check.
  const { data: existingCustomer, error: customersError } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", business.id)
    .eq("phone", normalizedLeadPhone)
    .maybeSingle();
  if (customersError) return { error: customersError.message };

  let customerId: string | null = (existingCustomer?.id as string | undefined) ?? null;

  if (!customerId) {
    const { data: created, error: createError } = await supabase
      .from("customers")
      .insert({
        business_id: business.id,
        name: lead.name?.trim() || "New customer",
        phone: normalizedLeadPhone,
        status: "active",
        notes: lead.interest ? `From website lead: ${lead.interest}` : "From website lead.",
        // Milestone 1 — the lead form's consent checkbox carries over.
        whatsapp_consent: lead.consent_status === "given" && !lead.opted_out_at,
        consent_source: lead.consent_status === "given" ? "lead" : null,
        consent_at: lead.consent_status === "given" ? lead.consent_given_at : null,
        opted_out_at: lead.opted_out_at ?? null,
      })
      .select("id")
      .single();

    if (createError) {
      // 23505 = a concurrent request created this customer between the
      // lookup above and this insert — never create a duplicate.
      if (createError.code === "23505") {
        return { error: "A customer with this phone number already exists." };
      }
      return { error: createError.message };
    }
    customerId = created.id as string;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({ status: "converted", converted_at: new Date().toISOString(), customer_id: customerId })
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (updateError) return { error: updateError.message };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { customerId };
}

export interface WidgetConfigInput {
  buttonText: string;
  introText: string;
  consentText: string;
  defaultSource: LeadWidgetRow["default_source"];
  interestOptions: string[];
  accentColor: string;
  isActive: boolean;
}

export async function updateWidgetConfig(input: WidgetConfigInput): Promise<{ error?: string }> {
  // Phase 15 — the lead-capture widget's config (incl. its secret key) is
  // owner-only, same sensitivity class as WhatsApp configuration.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  if (!input.buttonText.trim()) return { error: "Button text can't be empty." };
  if (!input.consentText.trim()) return { error: "Consent text can't be empty." };

  const supabase = createClient();
  const { error } = await supabase
    .from("lead_widgets")
    .update({
      button_text: input.buttonText.trim().slice(0, 120),
      intro_text: input.introText.trim().slice(0, 300) || null,
      consent_text: input.consentText.trim().slice(0, 300),
      default_source: input.defaultSource,
      interest_options: input.interestOptions.map((s) => s.trim()).filter(Boolean).slice(0, 12),
      accent_color: input.accentColor.trim() || "#16a34a",
      is_active: input.isActive,
    })
    .eq("business_id", business.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return {};
}

/** Rotates the public widget_key — for when a business suspects theirs
 * leaked or wants to retire an old embed. The old key stops working
 * immediately (a stale embed will just get a 404 from `/api/widget/[key]`,
 * the same as an unknown key — never a different, more informative error
 * that would confirm the old key used to be valid). */
export async function regenerateWidgetKey(): Promise<{ error?: string }> {
  // Phase 15 — the lead-capture widget's config (incl. its secret key) is
  // owner-only, same sensitivity class as WhatsApp configuration.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("lead_widgets")
    .update({ widget_key: crypto.randomUUID().replace(/-/g, "") })
    .eq("business_id", business.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}
