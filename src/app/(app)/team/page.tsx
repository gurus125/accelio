import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/config";
import { getCurrentMembership, listBusinessMembers } from "@/lib/business/queries";
import { listPendingInvitations } from "@/lib/team/queries";
import { getEffectiveStaffLimit } from "@/lib/billing/limits";
import { TeamMemberRow } from "@/components/team/team-member-row";
import { PendingInvitationRow } from "@/components/team/pending-invitation-row";
import { InviteStaffDialog } from "@/components/team/invite-staff-dialog";

export default async function TeamPage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Team" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">This feature isn&apos;t available yet.</p>
        </div>
      </>
    );
  }

  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding");

  const isOwner = membership.role === "owner";
  const [members, invitations] = await Promise.all([
    listBusinessMembers(membership.business.id),
    isOwner ? listPendingInvitations(membership.business.id) : Promise.resolve([]),
  ]);

  const activeMembers = members.filter((m) => m.status === "active");
  const staffSeatsUsed = activeMembers.filter((m) => m.role === "staff").length + invitations.length;
  // Phase 16 — the real ceiling is plan-driven now; see `lib/billing/limits.ts`.
  const staffSeatLimit = isOwner ? await getEffectiveStaffLimit(membership.business.id) : 0;

  return (
    <>
      <TopBar
        title="Team"
        subtitle={
          isOwner
            ? `${activeMembers.length} member${activeMembers.length === 1 ? "" : "s"} · ${staffSeatsUsed}/${staffSeatLimit} staff seats used`
            : undefined
        }
        action={isOwner ? <InviteStaffDialog seatsRemaining={Math.max(0, staffSeatLimit - staffSeatsUsed)} /> : undefined}
      />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 sm:p-8">
        {!isOwner && (
          <p className="text-sm text-muted-foreground">
            You&apos;re a staff member on this team. Only the owner can invite or remove people.
          </p>
        )}

        <Card className="divide-y divide-border overflow-hidden p-0">
          {activeMembers.map((member) => (
            <TeamMemberRow key={member.id} member={member} isOwnerView={isOwner} currentUserId={undefined} />
          ))}
        </Card>

        {isOwner && invitations.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pending invitations
            </p>
            <Card className="divide-y divide-border overflow-hidden p-0">
              {invitations.map((invitation) => (
                <PendingInvitationRow key={invitation.id} invitation={invitation} />
              ))}
            </Card>
          </div>
        )}

        {isOwner && activeMembers.length === 1 && invitations.length === 0 && (
          <Card className="flex flex-col items-center gap-2 border-dashed p-8 text-center text-sm text-muted-foreground">
            <UserCog className="h-6 w-6 text-muted-foreground" />
            <p>It&apos;s just you so far. Invite your first staff member to share the daily work.</p>
          </Card>
        )}
      </div>
    </>
  );
}
