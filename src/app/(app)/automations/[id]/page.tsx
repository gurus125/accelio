import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser, getCurrentMembership } from "@/lib/business/queries";
import { getAutomation, listRecentRunsForAutomation } from "@/lib/automations/queries";
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_RUN_STATUS_LABELS,
  AUTOMATION_STATUS_LABELS,
  AUTOMATION_TYPE_LABELS,
  describeAutomationInPlainLanguage,
} from "@/lib/automations/labels";
import { AutomationActions } from "@/components/automations/automation-actions";
import type { AutomationRow, AutomationRunStatus } from "@/lib/automations/types";

const STATUS_TONE: Record<AutomationRow["status"], "success" | "muted" | "warning" | "outline"> = {
  active: "success",
  paused: "warning",
  draft: "muted",
  archived: "outline",
};

const RUN_STATUS_TONE: Record<AutomationRunStatus, "success" | "default" | "muted" | "outline" | "danger" | "warning"> = {
  sent: "success",
  skipped: "muted",
  failed: "danger",
  eligible: "default",
};

export default async function AutomationDetailPage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) notFound();

  const membership = await getCurrentMembership();
  if (membership && membership.role !== "owner") redirect("/dashboard");

  const business = await getBusinessForCurrentUser();
  if (!business) notFound();

  const automation = await getAutomation(business.id, params.id);
  if (!automation) notFound();

  const runs = await listRecentRunsForAutomation(business.id, automation.id, 50);
  const sentCount = runs.filter((r) => r.status === "sent").length;
  const skippedCount = runs.filter((r) => r.status === "skipped").length;
  const failedCount = runs.filter((r) => r.status === "failed").length;

  return (
    <>
      <TopBar
        title={automation.name}
        subtitle={
          <Link href="/automations" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to automations
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-8">
        <Card className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{AUTOMATION_TYPE_LABELS[automation.automation_type]}</p>
              <p className="mt-1 text-base font-medium">
                {describeAutomationInPlainLanguage({
                  automationType: automation.automation_type,
                  actionType: automation.action_type,
                  delayMinutes: automation.delay_minutes,
                })}
              </p>
            </div>
            <Badge variant={STATUS_TONE[automation.status]}>{AUTOMATION_STATUS_LABELS[automation.status]}</Badge>
          </div>

          {automation.message_template && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">{automation.message_template}</div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Action</dt>
              <dd>{AUTOMATION_ACTION_LABELS[automation.action_type]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{new Date(automation.created_at).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last ran</dt>
              <dd>{automation.last_run_at ? new Date(automation.last_run_at).toLocaleString() : "Never yet"}</dd>
            </div>
          </dl>

          <AutomationActions automation={automation} />
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">
              {sentCount} sent - {skippedCount} skipped - {failedCount} failed
            </p>
          </div>

          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet — this shows up once the automation runs.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p>{run.reason ?? AUTOMATION_RUN_STATUS_LABELS[run.status]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(run.executed_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={RUN_STATUS_TONE[run.status]}>{AUTOMATION_RUN_STATUS_LABELS[run.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
