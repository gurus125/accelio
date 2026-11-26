"use client";

import * as React from "react";
import { CheckCircle2, UserPlus, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { setLeadStatus, convertLeadToCustomer } from "@/lib/leads/actions";
import type { LeadStatus } from "@/types/database";

interface LeadStatusActionsProps {
  leadId: string;
  status: LeadStatus;
  /** False when the lead has no usable phone number — conversion needs one
   * to find-or-create the matching customer (see lib/leads/actions.ts). */
  canConvert: boolean;
}

/**
 * Only shows the actions that make sense for the lead's CURRENT status
 * (Phase 13 spec step 15) — a converted or lost lead has nothing left to
 * do here, a brand-new lead has no "mark converted" until it's at least
 * qualified, etc.
 */
export function LeadStatusActions({ leadId, status, canConvert }: LeadStatusActionsProps) {
  const [pending, setPending] = React.useState<LeadStatus | "convert" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runStatusChange = async (next: LeadStatus) => {
    setPending(next);
    setError(null);
    const result = await setLeadStatus(leadId, next);
    setPending(null);
    if (result.error) setError(result.error);
  };

  const runConvert = async () => {
    setPending("convert");
    setError(null);
    const result = await convertLeadToCustomer(leadId);
    setPending(null);
    if (result.error) setError(result.error);
  };

  if (status === "converted" || status === "lost") {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "qualified" && (
          <Button size="sm" variant="secondary" onClick={() => runStatusChange("qualified")} disabled={pending !== null}>
            {pending === "qualified" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Mark qualified
          </Button>
        )}
        <Button
          size="sm"
          variant="success"
          onClick={runConvert}
          disabled={pending !== null || !canConvert}
          title={canConvert ? undefined : "This lead needs a valid phone number to convert."}
        >
          {pending === "convert" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Convert to customer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => runStatusChange("lost")} disabled={pending !== null}>
          {pending === "lost" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Mark lost
        </Button>
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}
