import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessInvitationRow } from "@/types/database";

/** Pending invitations for a business (Team page). Revoked/expired/accepted
 * ones are intentionally excluded — once resolved, an invitation isn't
 * actionable anymore and doesn't need to stay in the owner's view. */
export async function listPendingInvitations(businessId: string): Promise<BusinessInvitationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_invitations")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessInvitationRow[];
}

/** Active staff (excludes the owner) + pending invitations for staff, for
 * enforcing `MAX_STAFF_PER_BUSINESS`. */
export async function countStaffSeatsUsed(businessId: string): Promise<number> {
  const supabase = createClient();

  const [{ count: activeCount, error: activeError }, { count: pendingCount, error: pendingError }] =
    await Promise.all([
      supabase
        .from("business_members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "active")
        .eq("role", "staff"),
      supabase
        .from("business_invitations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending")
        .eq("role", "staff"),
    ]);

  if (activeError) throw new Error(activeError.message);
  if (pendingError) throw new Error(pendingError.message);
  return (activeCount ?? 0) + (pendingCount ?? 0);
}

/**
 * Looks up an invitation by its token for the accept flow. Uses the admin
 * (service-role) client deliberately: the person opening this link is, by
 * definition, not yet a member of the target business, so no RLS policy
 * could ever let their own session read this row — the token itself (an
 * unguessable uuid, delivered only via the invite link) is what authorizes
 * this one lookup, not a Postgres role.
 */
export async function getInvitationByToken(token: string): Promise<BusinessInvitationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BusinessInvitationRow | null;
}

/** Same lookup as `getInvitationByToken`, plus the business's display name
 * — used by the public `/invite/[token]` landing page, which needs to show
 * "You've been invited to join X" before the person has even signed in. */
export async function getInvitationDetailsByToken(
  token: string
): Promise<{ invitation: BusinessInvitationRow; businessName: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_invitations")
    .select("*, business:businesses(name)")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { business, ...invitation } = data as BusinessInvitationRow & { business: { name: string } | null };
  return { invitation: invitation as BusinessInvitationRow, businessName: business?.name ?? "this business" };
}

