import { createClient } from "@/lib/supabase/server";
import type { BusinessMemberRole, BusinessMemberRow, BusinessRow } from "@/types/database";

export interface CurrentMembership {
  business: BusinessRow;
  role: BusinessMemberRole;
  membershipId: string;
}

/**
 * Phase 15 — resolves the current session to (business, role) via
 * `business_members`, the new single source of truth for who can access
 * which business. This replaces the Phase 4 `owner_id = auth.uid()` lookup,
 * but keeps the exact same exported shape everywhere else in the app
 * expects (`getBusinessForCurrentUser` / `requireBusinessForCurrentUser`
 * below are unchanged in signature) — every existing call site (customers,
 * leads, opportunities, analytics, campaigns, automations, WhatsApp...)
 * automatically becomes staff-aware with zero changes to those files.
 *
 * A user could in principle belong to more than one business (e.g. staff at
 * one, owner of another). Accelio has no business-switcher UI yet, so this
 * deterministically picks their oldest active membership — in practice
 * every real user has exactly one.
 */
export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("business_members")
    .select("id, role, status, business:businesses(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.business) return null;

  return {
    business: data.business as unknown as BusinessRow,
    role: data.role as BusinessMemberRole,
    membershipId: data.id as string,
  };
}

/**
 * The current user's business row, or null if they aren't a member of one
 * yet (haven't finished onboarding, or aren't signed in). Always scoped by
 * the authenticated user's own session — never by a client-supplied id.
 */
export async function getBusinessForCurrentUser(): Promise<BusinessRow | null> {
  const membership = await getCurrentMembership();
  return membership?.business ?? null;
}

/** Same as `getBusinessForCurrentUser`, but throws when there isn't one yet —
 * for call sites (mutations) that can't proceed without a business. */
export async function requireBusinessForCurrentUser(): Promise<BusinessRow> {
  const business = await getBusinessForCurrentUser();
  if (!business) {
    throw new Error("No business found for the current user.");
  }
  return business;
}

/** The current user's role at their business ("owner" | "staff"), or null
 * if they have no active membership anywhere. */
export async function getCurrentRole(): Promise<BusinessMemberRole | null> {
  const membership = await getCurrentMembership();
  return membership?.role ?? null;
}

/** All active + suspended members of a business (Team page). Callers are
 * expected to already be a member of `businessId` — RLS enforces this
 * independently either way. */
export async function listBusinessMembers(businessId: string): Promise<BusinessMemberRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("*")
    .eq("business_id", businessId)
    .order("role", { ascending: true }) // owner first
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessMemberRow[];
}
