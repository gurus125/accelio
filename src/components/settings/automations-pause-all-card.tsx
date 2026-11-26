"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/inline-error";
import { pauseAllAutomationsAction, resumeAllAutomationsAction } from "@/lib/automations/actions";

interface AutomationsPauseAllCardProps {
  isPaused: boolean;
  activeAutomationCount: number;
}

/**
 * Settings -> Automations -> "Pause all automations" — the spec's mandated
 * business-level emergency stop (step 24). Deliberately its own small
 * control, separate from any individual automation's Edit/Pause — this
 * stops EVERY future automated send at once without touching any
 * automation's own status.
 */
export function AutomationsPauseAllCard({ isPaused, activeAutomationCount }: AutomationsPauseAllCardProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleToggle = async () => {
    setLoading(true);
    setError(null);
    const result = isPaused ? await resumeAllAutomationsAction() : await pauseAllAutomationsAction();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <InlineError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isPaused ? (
            <Badge variant="warning">All automations paused</Badge>
          ) : (
            <Badge variant="success">{activeAutomationCount} active</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/automations">
            <Button size="sm" variant="secondary">
              Manage automations
            </Button>
          </Link>
          <Button size="sm" variant={isPaused ? "default" : "destructive"} onClick={handleToggle} disabled={loading}>
            {loading ? "Working..." : isPaused ? "Resume all automations" : "Pause all automations"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        {isPaused
          ? "No automation will send anything until you resume. Messages already sent are unaffected."
          : "Immediately stops every automation from sending, without changing any automation's own on/off status. Use this if something looks wrong and you want to stop right away."}
      </p>
    </div>
  );
}
