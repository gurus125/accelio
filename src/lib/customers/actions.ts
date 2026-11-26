"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { requireOwner, getCurrentUser } from "@/lib/auth/access";
import { assertCanAddCustomer } from "@/lib/billing/limits";
import type { CustomerStatus } from "@/types";
import type { CustomerEventType } from "@/types/database";

export interface CustomerInput {
  name: string;
  phone: string;
  status: CustomerStatus;
  notes?: string;
}

/** Every mutation below derives `business_id` from the authenticated
 * session via `requireBusinessForCurrentUser()` — it is never accepted as an
 * argument from the caller, so a client can't spoof it. Row Level Security
 * on the database enforces the same rule independently, as a second layer. */

export async function createCustomer(input: CustomerInput): Promise<{ error?: string; id?: string }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "Set up your business profile before adding customers." };
  }

  if (!input.name.trim()) return { error: "Customer name is required." };
  if (!input.phone.trim()) return { error: "Phone number is required." };

  // Phase 16 — pre-flight, before the row is ever inserted.
  try {
    await assertCanAddCustomer(business.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You've reached your plan's customer limit." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      business_id: business.id,
      name: input.name.trim(),
      phone: input.phone.trim(),
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A customer with this phone number already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateCustomer(customerId: string, input: CustomerInput): Promise<{ error?: string }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "You need a business profile to do that." };
  }

  if (!input.name.trim()) return { error: "Customer name is required." };
  if (!input.phone.trim()) return { error: "Phone number is required." };

  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      phone: input.phone.trim(),
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", customerId)
    .eq("business_id", business.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Another customer already has this phone number." };
    }
    return { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function deleteCustomer(customerId: string): Promise<{ error?: string }> {
  // Phase 15 — deleting a customer record is owner-only; staff can add
  // customers/activity but not permanently remove history.
  let business;
  try {
    business = (await requireOwner()).business;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("business_id", business.id);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return {};
}

export interface CustomerEventInput {
  eventType: CustomerEventType;
  service?: string;
  amount?: number;
  occurredAt?: string;
  notes?: string;
}

export async function addCustomerEvent(
  customerId: string,
  input: CustomerEventInput
): Promise<{ error?: string }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "You need a business profile to do that." };
  }

  const supabase = createClient();

  // Confirm the customer actually belongs to this business before writing.
  // RLS enforces this too, but checking here produces a clean error message
  // instead of a raw database error bubbling up to the UI.
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!customer) return { error: "Customer not found." };

  const currentUser = await getCurrentUser();

  const { error } = await supabase.from("customer_events").insert({
    business_id: business.id,
    customer_id: customerId,
    event_type: input.eventType,
    service: input.service?.trim() || null,
    amount: input.amount ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    notes: input.notes?.trim() || null,
    // Phase 15 — who logged this, so the owner can see "added by Priya —
    // Staff" on the customer's activity timeline.
    created_by: currentUser?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return {};
}
