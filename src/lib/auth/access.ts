import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership, type CurrentMembership } from "@/lib/business/queries";

/**
 * Phase 15 — centralized server-side authorization. The goal is that no
 * file anywhere has to write `if (role === "owner")` or `if (user.email ===
 * ...)` inline; every owner-only mutation calls `requireOwner()` and every
 * operational one calls `requireStaffOrOwner()` (or, for read paths that
 * were already open to any business member, nothing extra at all — see
 * `@/lib/business/queries`).
 *
 * These throw plain `Error`s with user-safe messages — the same convention
 * every existing server action in this codebase already uses (they're
 * caught at the call site and turned into `{ error }` results, never a raw
 * stack trace shown to the user).
 */

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Throws if the signed-in user isn't an active member of any business. */
export async function requireStaffOrOwner(): Promise<CurrentMembership> {
  const membership = await getCurrentMembership();
  if (!membership) {
    throw new Error("You need to be part of a business to do that.");
  }
  return membership;
}

/** Throws unless the signed-in user is the OWNER of an active business
 * membership. This is the real security boundary for administrative
 * actions (invite/remove staff, business settings, WhatsApp config,
 * automations, billing) — RLS enforces the same rule again at the
 * database layer, independently, as defense in depth. */
export async function requireOwner(): Promise<CurrentMembership> {
  const membership = await requireStaffOrOwner();
  if (membership.role !== "owner") {
    throw new Error("Only the business owner can do that.");
  }
  return membership;
}
