import Link from "next/link";
import { Users, Send, MessageSquare, CheckCircle2, UserPlus } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { StatCard } from "@/components/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { describeLeadRequest } from "@/lib/leads/priority";
import { describeLeadSource } from "@/lib/leads/labels";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listLeadsForBusiness, countLeadsByStatus } from "@/lib/leads/queries";

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

/**
 * /leads — the Phase 13 dashboard for everyone who's expressed interest
 * through the website but isn't (yet) an established customer. Deliberately
 * a plain list, not a drag-and-drop sales pipeline (Phase 13 spec step 14).
 */
export default async function LeadsPage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Website leads" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">This feature isn&apos;t available yet.</p>
        </div>
      </>
    );
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="Website leads" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Set up your business profile first.</p>
        </div>
      </>
    );
  }

  const leads = await listLeadsForBusiness(business.id);
  const counts = countLeadsByStatus(leads);

  return (
    <>
      <TopBar
        title="Website leads"
        subtitle="People who asked for information through your website — not yet established customers."
      />

      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} value={counts.new} label="New leads" tone="warning" />
          <StatCard icon={Send} value={counts.contacted} label="Contacted" tone="brand" />
          <StatCard icon={MessageSquare} value={counts.replied} label="Replied" tone="muted" />
          <StatCard icon={CheckCircle2} value={counts.converted} label="Converted" tone="muted" />
        </div>

        {leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <UserPlus className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium">No website leads yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the lead capture form to your website from{" "}
              <Link href="/settings" className="text-brand-600 hover:underline">
                Settings
              </Link>{" "}
              to start collecting them here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <ul className="divide-y divide-border">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                    <Avatar name={lead.name || lead.phone || "Lead"} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{lead.name || "Unnamed lead"}</span>
                        <LeadStatusBadge status={lead.status} />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {describeLeadRequest(lead)} · {describeLeadSource(lead.source)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">Captured {timeAgo(lead.captured_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
