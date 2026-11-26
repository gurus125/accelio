"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { requireOwner } from "@/lib/auth/access";
import { verifyPhoneNumberId } from "./client";
import { normalizeIndianMobile } from "@/lib/phone";

export interface ConnectWhatsAppInput {
  phoneNumberId: string;
  businessAccountId: string;
}

/**
 * Connects the current business to a WhatsApp phone number — but only
 * after actually verifying that number is real and reachable with the
 * server's Meta access token. Never marks a connection "connected" without
 * that check, per the Phase 8 rule against faking a successful connection.
 */
export async function connectWhatsApp(input: ConnectWhatsAppInput): Promise<{ error?: string }> {
  // Phase 15 — WhatsApp configuration/credentials are owner-only.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const phoneNumberId = input.phoneNumberId.trim();
  const businessAccountId = input.businessAccountId.trim();

  if (!phoneNumberId) {
    return { error: "Phone Number ID is required." };
  }

  const verification = await verifyPhoneNumberId(phoneNumberId);
  const supabase = createClient();

  if (!verification.ok) {
    // Record the attempt as errored rather than silently doing nothing —
    // the Settings screen can then show "last attempt failed."
    await supabase.from("whatsapp_connections").upsert(
      {
        business_id: business.id,
        phone_number_id: phoneNumberId,
        business_account_id: businessAccountId || null,
        connection_status: "error",
      },
      { onConflict: "business_id" }
    );
    revalidatePath("/settings");
    return { error: verification.error };
  }

  const { error } = await supabase.from("whatsapp_connections").upsert(
    {
      business_id: business.id,
      phone_number_id: phoneNumberId,
      business_account_id: businessAccountId || null,
      display_phone_number: verification.displayPhoneNumber,
      connection_status: "connected",
    },
    { onConflict: "business_id" }
  );

  if (error) return { error: "Couldn't save your WhatsApp connection. Please try again." };

  revalidatePath("/settings");
  return {};
}

export async function disconnectWhatsApp(): Promise<{ error?: string }> {
  // Phase 15 — WhatsApp configuration/credentials are owner-only.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("whatsapp_connections")
    .update({ connection_status: "not_connected" })
    .eq("business_id", business.id);

  if (error) return { error: "Couldn't disconnect. Please try again." };

  revalidatePath("/settings");
  return {};
}

/**
 * Phase 9 — turns an "unknown sender" inbound message into a real
 * customer, then attaches every message from that phone number to the new
 * customer record. Always an explicit owner action (a button click) — see
 * the Phase 9 spec's rule against silently creating customers from
 * inbound WhatsApp traffic.
 */
export async function addCustomerFromUnknownSender(
  customerMessageId: string,
  name: string
): Promise<{ error?: string }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "Set up your business profile first." };
  }

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "A name is required." };

  const supabase = createClient();

  const { data: unknownMessage, error: findError } = await supabase
    .from("customer_messages")
    .select("id, from_phone, customer_id")
    .eq("id", customerMessageId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (findError || !unknownMessage) {
    return { error: "This message could not be found." };
  }
  if (unknownMessage.customer_id) {
    return { error: "This sender is already linked to a customer." };
  }

  const phone = normalizeIndianMobile(unknownMessage.from_phone);
  if (!phone) {
    return { error: "This sender's number isn't a valid Indian mobile number, so it can't be saved as a customer." };
  }

  const { data: newCustomer, error: createError } = await supabase
    .from("customers")
    .insert({
      business_id: business.id,
      name: trimmedName,
      phone,
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !newCustomer) {
    if (createError?.code === "23505") {
      return { error: "A customer with this phone number already exists." };
    }
    return { error: "Couldn't create the customer. Please try again." };
  }

  const { error: attachError } = await supabase
    .from("customer_messages")
    .update({ customer_id: newCustomer.id })
    .eq("business_id", business.id)
    .eq("from_phone", unknownMessage.from_phone)
    .is("customer_id", null);

  if (attachError) {
    // The customer was created successfully; failing to backfill older
    // messages from the same number is non-fatal and safe to ignore here —
    // worst case, the owner sees the conversation start one message later.
    console.error("[whatsapp] Failed to attach unknown sender's messages.", attachError.message);
  }

  revalidatePath("/activity");
  revalidatePath(`/customers/${newCustomer.id}`);
  revalidatePath("/customers");
  return {};
}
