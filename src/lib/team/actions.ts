"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner, getCurrentUser } from "@/lib/auth/access";
import { getInvitationByToken } from "@/lib/team/queries";
import { getSiteOrigin } from "@/lib/site";
import { INVITATION_EXPIRY_DAYS } from "@/lib/team/constants";
import { assertCanAddStaffSeat } from "@/lib/billing/limits";
import type { TeamAuditEventType } from "@/types/database";

/**
 * Every mutation here derives `business_id` from the authenticated owner's
 * own session via `requireOwner()` — never from a client-supplied argument
 * — and every table it touches also carries RLS enforcing the same rule
 * independently (see the Phase 15 migration). `acceptInvitation` is the one
 * exception: it uses the service-role client, because the person accepting
 * is by definition not yet a member of the business they're joining (see
 * `getInvitationByToken`'s comment).
 */

async function logTeamEvent(input: {
  businessId: string;
  actorId: string | null;
  eventType: TeamAuditEventType;
  targetEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createClient();
  // Best-effort — a failed audit write should never block the real action.
  await supabase.from("team_audit_log").insert({
    business_id: input.businessId,
    actor_id: input.actorId,
    event_type: input.eventType,
    target_email: input.targetEmail ?? null,
    metadata: input.metadata ?? {},
  });
}

export interface InviteStaffInput {
  email: string;
  name?: string;
}

export interface InviteStaffResult {
  error?: string;
  /** The link the owner can share directly (WhatsApp/SMS/etc.) as a
   * fallback for whenever Supabase's own invite email doesn't land —
   * unconfigured email provider, spam filtering, an already-registered
   * address, and so on. */
  inviteLink?: string;
  emailSent?: boolean;
}

export async function inviteStaffMember(input: InviteStaffInput): Promise<InviteStaffResult> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Please sign in again and retry." };
  }
  if (currentUser.email?.toLowerCase() === email) {
    return { error: "You can't invite yourself." };
  }

  const supabase = createClient();

  const { data: existingMember } = await supabase
    .from("business_members")
    .select("id")
    .eq("business_id", membership.business.id)
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();

  if (existingMember) {
    return { error: "This person is already on your team." };
  }

  // Phase 16 — staff-seat limits are now plan-driven. Reuses Phase 15's
  // exact `countStaffSeatsUsed` counting logic; only the ceiling it's
  // compared against moved into `lib/billing/limits.ts`.
  try {
    await assertCanAddStaffSeat(membership.business.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You've reached your plan's staff limit." };
  }

  const { data: invitation, error: insertError } = await supabase
    .from("business_invitations")
    .insert({
      business_id: membership.business.id,
      email,
      name,
      role: "staff",
      invited_by: currentUser.id,
      expires_at: new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  if (insertError || !invitation) {
    if (insertError?.code === "23505") {
      return { error: "An invitation is already pending for this email." };
    }
    return { error: insertError?.message ?? "Couldn't create the invitation." };
  }

  const origin = getSiteOrigin();
  const inviteLink = `${origin}/invite/${invitation.token}`;

  let emailSent = false;
  try {
    const admin = createAdminClient();
    const { error: emailError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/invite/${invitation.token}`,
    });
    emailSent = !emailError;
  } catch {
    // Already-registered email, no email provider configured, rate limits,
    // etc. — non-fatal. The owner can still share `inviteLink` directly.
    emailSent = false;
  }

  await logTeamEvent({
    businessId: membership.business.id,
    actorId: currentUser.id,
    eventType: "staff_invited",
    targetEmail: email,
  });

  revalidatePath("/team");
  return { inviteLink, emailSent };
}

export async function resendInvitation(invitationId: string): Promise<{ error?: string; inviteLink?: string }> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { data: invitation, error: fetchError } = await supabase
    .from("business_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("business_id", membership.business.id)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!invitation) return { error: "Invitation not found." };
  if (invitation.status !== "pending") return { error: "This invitation can't be resent." };

  const newExpiry = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabase
    .from("business_invitations")
    .update({ expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateError) return { error: updateError.message };

  const origin = getSiteOrigin();
  try {
    const admin = createAdminClient();
    await admin.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: `${origin}/auth/callback?next=/invite/${invitation.token}`,
    });
  } catch {
    // Non-fatal — see inviteStaffMember.
  }

  const currentUser = await getCurrentUser();
  await logTeamEvent({
    businessId: membership.business.id,
    actorId: currentUser?.id ?? null,
    eventType: "invitation_resent",
    targetEmail: invitation.email,
  });

  revalidatePath("/team");
  return { inviteLink: `${origin}/invite/${invitation.token}` };
}

export async function revokeInvitation(invitationId: string): Promise<{ error?: string }> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { data: invitation, error: fetchError } = await supabase
    .from("business_invitations")
    .select("id, email, status")
    .eq("id", invitationId)
    .eq("business_id", membership.business.id)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!invitation) return { error: "Invitation not found." };

  const { error: updateError } = await supabase
    .from("business_invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateError) return { error: updateError.message };

  const currentUser = await getCurrentUser();
  await logTeamEvent({
    businessId: membership.business.id,
    actorId: currentUser?.id ?? null,
    eventType: "invitation_revoked",
    targetEmail: invitation.email,
  });

  revalidatePath("/team");
  return {};
}

export async function removeStaffMember(memberId: string): Promise<{ error?: string }> {
  let membership;
  try {
    membership = await requireOwner();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "You don't have permission to do that." };
  }

  const supabase = createClient();
  const { data: member, error: fetchError } = await supabase
    .from("business_members")
    .select("id, role, status, email, user_id")
    .eq("id", memberId)
    .eq("business_id", membership.business.id)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!member) return { error: "Team member not found." };

  if (member.role === "owner") {
    // Step 34 — never leave a business without an owner, even if a future
    // UI change ever tries to route an owner-removal through this action.
    const { count } = await supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", membership.business.id)
      .eq("role", "owner")
      .eq("status", "active");

    if ((count ?? 0) <= 1) {
      return { error: "You can't remove the only owner. Add another owner first." };
    }
  }

  const { error: updateError } = await supabase
    .from("business_members")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (updateError) return { error: updateError.message };

  const currentUser = await getCurrentUser();
  await logTeamEvent({
    businessId: membership.business.id,
    actorId: currentUser?.id ?? null,
    eventType: "staff_removed",
    targetEmail: member.email,
  });

  revalidatePath("/team");
  return {};
}

export interface AcceptInvitationResult {
  error?: string;
  accepted?: boolean;
}

/**
 * Completes an invitation the invited person opened via `/invite/[token]`.
 * They must already be signed in (the page handles bouncing them to
 * login/signup first) — `business_id` and `role` always come from the
 * invitation row itself, resolved server-side, never from anything the
 * client could supply.
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Please sign in to accept this invitation." };
  }

  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    return { error: "This invitation link isn't valid." };
  }

  if (invitation.status === "accepted") {
    return { error: "This invitation has already been accepted." };
  }
  if (invitation.status === "revoked") {
    return { error: "This invitation has been revoked." };
  }

  const admin = createAdminClient();

  if (invitation.status === "expired" || new Date(invitation.expires_at) < new Date()) {
    if (invitation.status !== "expired") {
      await admin.from("business_invitations").update({ status: "expired" }).eq("id", invitation.id);
    }
    return { error: "This invitation has expired. Ask the business owner to send a new one." };
  }

  if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      error: `This invitation was sent to ${invitation.email}. Please sign in with that email address to accept it.`,
    };
  }

  const { error: memberError } = await admin.from("business_members").upsert(
    {
      business_id: invitation.business_id,
      user_id: user.id,
      role: invitation.role,
      status: "active",
      name: invitation.name,
      email: invitation.email,
      invited_by: invitation.invited_by,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,user_id" }
  );

  if (memberError) {
    return { error: "Couldn't add you to the team. Please try again." };
  }

  await admin
    .from("business_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  await admin.from("team_audit_log").insert({
    business_id: invitation.business_id,
    actor_id: user.id,
    event_type: "invitation_accepted",
    target_email: invitation.email,
  });

  revalidatePath("/dashboard");
  revalidatePath("/team");
  return { accepted: true };
}
