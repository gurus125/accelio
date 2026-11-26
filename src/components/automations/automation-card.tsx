import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AutomationRow } from "@/lib/automations/types";
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_STATUS_LABELS,
  AUTOMATION_TYPE_LABELS,
  describeAutomationInPlainLanguage,
} from "@/lib/automations/labels";

const STATUS_TONE: Record<AutomationRow["status"], "success" | "muted" | "warning" | "outline"> = {
  active: "success",
  paused: "warning",
  draft: "muted",
  archived: "outline",
};

/** One card per automation on the /automations list — a one-sentence
 * plain-language summary is the headline, per the spec's "an owner must be
 * able to understand an automation in one sentence" bar. No jargon, no
 * "workflow" or "trigger" language shown to the owner. */
export function AutomationCard({ automation }: { automation: AutomationRow }) {
  return (
    <Link href={`/automations/${automation.id}`}>
      <Card className="flex flex-col justify-between p-5 transition-shadow hover:shadow-md">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-snug">{automation.name}</h3>
            <Badge variant={STATUS_TONE[automation.status]}>{AUTOMATION_STATUS_LABELS[automation.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{AUTOMATION_TYPE_LABELS[automation.automation_type]}</p>
          <p className="mt-3 text-sm text-foreground">
            {describeAutomationInPlainLanguage({
              automationType: automation.automation_type,
              actionType: automation.action_type,
              delayMinutes: automation.delay_minutes,
            })}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{AUTOMATION_ACTION_LABELS[automation.action_type]}</p>
        </div>
        {automation.last_run_at && (
          <p className="mt-4 text-xs text-muted-foreground">
            Last ran {new Date(automation.last_run_at).toLocaleString()}
          </p>
        )}
      </Card>
    </Link>
  );
}
