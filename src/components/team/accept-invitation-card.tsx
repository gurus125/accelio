"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { acceptInvitation } from "@/lib/team/actions";

export function AcceptInvitationCard({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    const result = await acceptInvitation(token);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAccepted(true);
    router.push("/dashboard");
    router.refresh();
  };

  if (accepted) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm font-medium text-success-600">
        <CheckCircle2 className="h-4 w-4" /> You&apos;re in! Redirecting...
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <InlineError message={error} />
      <Button className="w-full" onClick={handleAccept} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? "Joining..." : "Accept invitation"}
      </Button>
    </div>
  );
}
