import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getInvitationDetailsByToken } from "@/lib/team/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { AcceptInvitationCard } from "@/components/team/accept-invitation-card";

/**
 * Public landing page for a Phase 15 staff invite link. Deliberately
 * outside the `(app)` route group (no sidebar, may be visited signed-out)
 * — mirrors `/login` and `/signup`'s standalone layout.
 */
export default async function InviteAcceptPage({ params }: { params: { token: string } }) {
  if (!isSupabaseConfigured) {
    return (
      <CenteredShell>
        <p className="text-sm text-muted-foreground">This feature isn&apos;t available yet.</p>
      </CenteredShell>
    );
  }

  const details = await getInvitationDetailsByToken(params.token);

  if (!details) {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Invitation not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invite link isn&apos;t valid. Ask the business owner to send you a new one.
        </p>
      </CenteredShell>
    );
  }

  const { invitation, businessName } = details;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextParam = `/invite/${params.token}`;

  if (invitation.status === "accepted") {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Already accepted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation has already been accepted.{" "}
          <Link href="/dashboard" className="font-medium text-brand-600 hover:underline">
            Go to your dashboard
          </Link>
          .
        </p>
      </CenteredShell>
    );
  }

  if (invitation.status === "revoked") {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Invitation revoked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation is no longer active. Ask the business owner to send you a new one.
        </p>
      </CenteredShell>
    );
  }

  const expired = invitation.status === "expired" || new Date(invitation.expires_at) < new Date();
  if (expired) {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Invitation expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation has expired. Ask the business owner to send you a new one.
        </p>
      </CenteredShell>
    );
  }

  if (!user) {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Join {businessName} on Reelo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invitation.name ? `${invitation.name}, y` : "Y"}ou&apos;ve been invited as staff. Sign in or create an
          account with <span className="font-medium text-foreground">{invitation.email}</span> to accept.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?next=${encodeURIComponent(nextParam)}`}
            className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Log in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(nextParam)}&invitedEmail=${encodeURIComponent(invitation.email)}`}
            className="flex-1 rounded-lg border border-border bg-white px-4 py-2 text-center text-sm font-medium transition-colors hover:bg-muted"
          >
            Create account
          </Link>
        </div>
      </CenteredShell>
    );
  }

  if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <CenteredShell>
        <h1 className="text-xl font-semibold">Wrong account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation was sent to <span className="font-medium text-foreground">{invitation.email}</span>, but
          you&apos;re signed in as {user.email}. Log out and sign in with the invited email to accept.
        </p>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell>
      <h1 className="text-xl font-semibold">Join {businessName} on Reelo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;ve been invited as staff. Accept below to get access.
      </p>
      <AcceptInvitationCard token={params.token} />
    </CenteredShell>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Reelo</span>
        </Link>
        <div className="rounded-2xl border border-border bg-white p-7 shadow-card">{children}</div>
      </div>
    </div>
  );
}
