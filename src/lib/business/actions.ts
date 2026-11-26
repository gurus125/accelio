"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth/access";
import { ensureFreeSubscriptionForBusiness } from "@/lib/billing/subscription";

export interface EnsureBusinessInput {
  name?: string;
  businessType?: string;
  ownerName?: string;
  city?: string;
  phone?: string;
}

/**
 * Idempotently creates the single business row for the current user, if one
 * doesn't already exist yet. Called once, at the end of onboarding.
 * `owner_id` always comes from the authenticated session, never from client
 * input — so this can never be used to create a business "for" someone else.
 */
export async function ensureBusinessForCurrentUser(
  input: EnsureBusinessInput = {}
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You need to be signed in to continue." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (existing) {
    // Already onboarded — still make sure a billing row exists for a
    // business created before billing shipped. Best-effort: a hiccup here
    // shouldn't block someone from reaching their own dashboard.
    await ensureFreeSubscriptionForBusiness(existing.id).catch((err) =>
      console.error("[business/actions] Failed to backfill Free subscription.", err instanceof Error ? err.message : err)
    );
    return {};
  }

  const fallbackName =
    typeof user.user_metadata?.business_name === "string" && user.user_metadata.business_name
      ? user.user_metadata.business_name
      : "My business";

  const fallbackOwnerName =
    typeof user.user_metadata?.owner_name === "string" ? user.user_metadata.owner_name : null;

  const { error } = await supabase.from("businesses").insert({
    owner_id: user.id,
    name: input.name?.trim() || fallbackName,
    business_type: input.businessType ?? null,
    owner_name: input.ownerName ?? fallbackOwnerName,
    city: input.city ?? null,
    phone: input.phone ?? null,
  });

  if (error) {
    // A unique-violation (23505) means a concurrent request already created
    // it (e.g. a double-click) — that's fine, not a real error.
    if (error.code === "23505") return {};
    return { error: error.message };
  }

  // Every business starts on the permanent Free plan the moment it
  // exists — no card required, no expiry. Best-effort for the same
  // reason as the backfill above: a billing-provisioning hiccup must
  // never block onboarding.
  const { data: created } = await supabase.from("businesses").select("id").eq("owner_id", user.id).maybeSingle();
  if (created) {
    await ensureFreeSubscriptionForBusiness(created.id).catch((err) =>
      console.error("[business/actions] Failed to provision Free subscription.", err instanceof Error ? err.message : err)
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return {};
}

export interface UpdateBusinessProfileInput {
  name: string;
  businessType: string;
  city: string;
  ownerName: string;
  /** Phase 14 — the owner's own verified/test phone number, used ONLY by
   * Test Mode (see lib/automations/actions.ts's sendAutomationTestMessage)
   * to send a clearly-labeled test message to the owner themselves, never
   * to a real customer. Optional — Test Mode is simply unavailable until
   * this is set. */
  phone: string;
}

/** Updates the current user's own business row — scoped by owner_id from the
 * session, so there's no way to pass a business_id and edit someone else's. */
export async function updateBusinessProfile(
  input: UpdateBusinessProfileInput
): Promise<{ error?: string }> {
  // Phase 15 — business settings are owner-only.
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  if (!input.name.trim()) {
    return { error: "Business name can't be empty." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name: input.name.trim(),
      business_type: input.businessType.trim() || null,
      city: input.city.trim() || null,
      owner_name: input.ownerName.trim() || null,
      phone: input.phone.trim() || null,
    })
    .eq("id", membership.business.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}
