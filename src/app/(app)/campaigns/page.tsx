import Link from "next/link";
import { Plus } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CAMPAIGNS } from "@/lib/mock-data";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCampaignsForBusiness } from "@/lib/campaigns/queries";
import type { CampaignStatus } from "@/lib/campaigns/types";
import { getCampaignAnalytics } from "@/lib/analytics/campaigns";

const STATUS_TONE: Record<CampaignStatus, "success" | "default" | "muted" | "outline" | "danger" | "warning"> = {
  draft: "muted",
  review: "muted",
  approved: "warning",
  sending: "default",
  completed: "success",
  failed: "danger",
  cancelled: "outline",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  sending: "Sending...",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function CampaignsPage() {
  if (isSupabaseConfigured) {
    return <RealCampaignsPage />;
  }
  return <MockCampaignsPage />;
}

/**
 * Phase 11 section 18 — upgraded from a card grid to a results table so
 * every campaign's real numbers (recipients, sent, delivered, read,
 * replies, returns) are visible at a glance without opening each one.
 * Every column reuses `lib/analytics/campaigns.ts` — no separate counting
 * logic lives here.
 */
async function RealCampaignsPage() {
  const business = await getBusinessForCurrentUser();

  const campaigns = business ? await listCampaignsForBusiness(business.id) : [];
  const campaignsWithAnalytics = business
    ? await Promise.all(
        campaigns.map(async (campaign) => ({ campaign, analytics: await getCampaignAnalytics(business.id, campaign) }))
      )
    : [];

  return (
    <>
      <TopBar
        title="Campaigns"
        action={
          <Link href="/campaigns/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        }
      />
      <div className="flex-1 p-4 sm:p-8">
        {!business ? (
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        ) : campaignsWithAnalytics.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-medium">No campaigns yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a campaign to reach a group of customers at once — Accelio will show you exactly who before
              anything is sent.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Delivered</th>
                  <th className="px-4 py-3 font-medium">Read</th>
                  <th className="px-4 py-3 font-medium">Replies</th>
                  <th className="px-4 py-3 font-medium">Returns</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaignsWithAnalytics.map(({ campaign, analytics }) => (
                  <tr key={campaign.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${campaign.id}`} className="font-medium text-brand-600 hover:underline">
                        {campaign.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{analytics.recipients}</td>
                    <td className="px-4 py-3">{analytics.sent}</td>
                    <td className="px-4 py-3">{analytics.delivered}</td>
                    <td className="px-4 py-3">{analytics.read}</td>
                    <td className="px-4 py-3">{analytics.repliesTotal}</td>
                    <td className="px-4 py-3">{analytics.returnedAfterOutreach}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** Unchanged Phase 1 mock version, used only when Supabase isn't configured yet. */
function MockCampaignsPage() {
  return (
    <>
      <TopBar
        title="Campaigns"
        action={
          <Link href="/campaigns/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        }
      />
      <div className="flex-1 p-4 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGNS.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      </div>
    </>
  );
}
