"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/inline-error";
import { inviteStaffMember } from "@/lib/team/actions";

export function InviteStaffDialog({ seatsRemaining }: { seatsRemaining: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ inviteLink: string; emailSent: boolean } | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const outcome = await inviteStaffMember({ email, name: name.trim() || undefined });
    setLoading(false);

    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setResult({ inviteLink: outcome.inviteLink ?? "", emailSent: Boolean(outcome.emailSent) });
  };

  const handleCopyLink = async () => {
    if (!result?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(result.inviteLink);
    } catch {
      // Non-fatal — the link is still shown on screen to copy manually.
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={seatsRemaining <= 0}>
        <UserPlus className="h-4 w-4" />
        Invite staff
      </Button>

      <Modal
        open={open}
        onClose={handleClose}
        title={result ? "Invitation sent" : "Invite a staff member"}
        description={
          result
            ? undefined
            : "They'll get access to customers, leads, and daily recommendations — not your business settings."
        }
      >
        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.emailSent
                ? "We've emailed them a link to join. You can also share this link directly:"
                : "We couldn't send the email automatically — share this link with them directly:"}
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.inviteLink} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" size="sm" onClick={handleCopyLink}>
                Copy
              </Button>
            </div>
            <Button type="button" className="w-full" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <InlineError message={error} />
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-name">
                Name
              </label>
              <Input
                id="invite-name"
                placeholder="Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-email">
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder="rahul@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending invitation..." : "Send invitation"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
