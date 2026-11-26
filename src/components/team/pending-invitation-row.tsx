"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { resendInvitation, revokeInvitation } from "@/lib/team/actions";
import type { BusinessInvitationRow } from "@/types/database";

export function PendingInvitationRow({ invitation }: { invitation: BusinessInvitationRow }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState<"resend" | "revoke" | null>(null);

  const displayName = invitation.name?.trim() || invitation.email;
  const expired = new Date(invitation.expires_at) < new Date();

  const handleResend = async () => {
    setBusy("resend");
    setError(null);
    setCopied(false);
    const result = await resendInvitation(invitation.id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.inviteLink) {
      try {
        await navigator.clipboard.writeText(result.inviteLink);
        setCopied(true);
      } catch {
        // Clipboard access can fail (permissions/non-HTTPS) — not fatal,
        // the invitation itself was still resent successfully.
      }
    }
    router.refresh();
  };

  const handleRevoke = async () => {
    setBusy("revoke");
    setError(null);
    const result = await revokeInvitation(invitation.id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={displayName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
        <Badge variant={expired ? "warning" : "muted"}>{expired ? "Expired" : "Invitation pending"}</Badge>
        <Button size="sm" variant="ghost" onClick={handleResend} disabled={busy !== null}>
          {busy === "resend" ? "Sending..." : copied ? "Link copied!" : "Resend"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleRevoke} disabled={busy !== null}>
          {busy === "revoke" ? "Revoking..." : "Revoke"}
        </Button>
      </div>

      {error && (
        <div className="sm:w-full">
          <InlineError message={error} />
        </div>
      )}
    </div>
  );
}
