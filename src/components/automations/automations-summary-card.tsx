import Link from "next/link";
import { Zap, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { AutomationDashboardSummary } from "@/lib/automations/queries";

/**
 * Phase 14's dashboard summary (spec step 28) — deliberately small and
 * secondary. `TodaysRecommendations` (Phase 12) stays the dashboard's
 * primary action area; this is a single compact row underneath it, not a
 * competing hero section.
 */
export function AutomationsSummaryCard({ summary }: { summary: AutomationDashboardSummary }) {
  if (summary.activeCount === 0 && summary.sentToday === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Zap className="h-4 w-4 text-brand-600" />
        <span>
          <strong className="text-foreground">{summary.activeCount}</strong> active ·{" "}
          <strong className="text-foreground">{summary.sentToday}</strong> automated follow-up
          {summary.sentToday === 1 ? "" : "s"} today
          {summary.skippedToday > 0 && (
            <>
              {" "}
              · <strong className="text-foreground">{summary.skippedToday}</strong> skipped
            </>
          )}
        </span>
      </div>
      <Link href="/automations" className={buttonVariants({ size: "sm", variant: "secondary" })}>
        Manage automations
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
