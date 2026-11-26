import Link from "next/link";
import { Globe, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { describeLeadRequest, type LeadFollowUp } from "@/lib/leads/priority";
import { describeLeadSource } from "@/lib/leads/labels";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const REASON_TONE: Record<LeadFollowUp["reason"], "warning" | "success" | "default"> = {
  new: "warning",
  replied: "success",
  needs_follow_up: "default",
};

/**
 * Phase 13's dashboard entry point (spec step 16/28) — "here's a website
 * lead worth following up today," in the same plain-language spirit as
 * Phase 12's `TodaysRecommendations`. Deliberately its own small section
 * rather than merged into that component's internals, since a lead isn't
 * an `Opportunity` and shouldn't be forced to look like one.
 */
export function WebsiteLeadFollowUps({ followUps, totalLeads }: { followUps: LeadFollowUp[]; totalLeads: number }) {
  if (followUps.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Website leads to follow up
          </h2>
          <p className="text-sm text-muted-foreground">
            {totalLeads} lead{totalLeads === 1 ? "" : "s"} captured from your website{followUps.length < totalLeads ? ` — showing ${followUps.length}` : ""}
          </p>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
          View all leads
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {followUps.map(({ lead, reason, label }) => (
          <Card key={lead.id} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <Avatar name={lead.name || lead.phone || "Lead"} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/leads/${lead.id}`} className="truncate font-semibold hover:underline">
                      {lead.name || "Unnamed lead"}
                    </Link>
                    <Badge variant={REASON_TONE[reason]}>{label}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {describeLeadRequest(lead)} · {describeLeadSource(lead.source)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Captured {timeAgo(lead.captured_at)}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                Follow up on WhatsApp
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
