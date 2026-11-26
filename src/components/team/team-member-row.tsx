"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { removeStaffMember } from "@/lib/team/actions";
import type { BusinessMemberRow } from "@/types/database";

interface TeamMemberRowProps {
  member: BusinessMemberRow;
  /** Whether the person viewing this row is the owner (controls whether
   * the "Remove" action shows at all). */
  isOwnerView: boolean;
  currentUserId?: string;
}

export function TeamMemberRow({ member, isOwnerView }: TeamMemberRowProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const displayName = member.name?.trim() || member.email;

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    const result = await removeStaffMember(member.id);
    setRemoving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={displayName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
        <Badge variant={member.role === "owner" ? "default" : "muted"} className="capitalize">
          {member.role}
        </Badge>
        <Badge variant="success">Active</Badge>

        {isOwnerView && member.role !== "owner" && (
          <>
            {confirming ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="destructive" onClick={handleRemove} disabled={removing}>
                  {removing ? "Removing..." : "Confirm"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={removing}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="sm:col-span-2">
          <InlineError message={error} />
        </div>
      )}
    </div>
  );
}
