import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCampaign, listRecipientsWithCustomers, getCampaignResultCounts } from "@/lib/campaigns/queries";
import { CAMPAIGN_TYPE_LABELS } from "@/lib/campaigns/types";
import type { CampaignRecipientStatus, CampaignStatus } from "@/lib/campaigns/types";
import { CampaignActions } from "@/components/campaigns/campaign-actions";

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

const RECIPIENT_STATUS_LABEL: Record<CampaignRecipientStatus, string> = {
  selected: "Selected",
  ready: "Sending...",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  replied: "Replied",
  failed: "Couldn't send",
  skipped: "Skipped",
};

const RECIPIENT_STATUS_TONE: Record<CampaignRecipientStatus, "success" | "default" | "muted" | "outline" | "danger" | "warning"> = {
  selected: "muted",
  ready: "default",
  sent: "default",
  delivered: "success",
  read: "success",
  replied: "warning",
  failed: "danger",
  skipped: "outline",
};

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) notFound();

  const business = await getBusinessForCurrentUser();
  if (!business) notFound();

  const campaign = await getCampaign(business.id, params.id);
  if (!campaign) notFound();

  const [recipients, counts] = await Promise.all([
    listRecipientsWithCustomers(campaign.id),
    getCampaignResultCounts(campaign.id),
  ]);

  const deliveryRate = counts.sent > 0 ? Math.round((counts.delivered / counts.sent) * 100) : null;
  const replyRate = counts.delivered > 0 ? Math.round((counts.replied / counts.delivered) * 100) : null;

  return (
    <>
      <TopBar
        title="Campaign"
        subtitle={
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to campaigns
          </Link>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{campaign.name}</h2>
                <Badge variant={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {CAMPAIGN_TYPE_LABELS[campaign.campaign_type]} · {counts.total} recipient{counts.total === 1 ? "" : "s"}
              </p>
            </div>
            <CampaignActions campaignId={campaign.id} status={campaign.status} recipientCount={counts.total} />
          </div>

          {campaign.message_template && (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-muted-foreground">Message</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-base">{campaign.message_template}</p>
            </div>
          )}
        </Card>

        {counts.total > 0 && (counts.sent > 0 || counts.failed > 0) && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-muted-foreground">Results</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <ResultTile label="Sent" value={counts.sent} />
              <ResultTile label="Delivered" value={counts.delivered} />
              <ResultTile label="Read" value={counts.read} />
              <ResultTile label="Replies" value={counts.replied} />
              <ResultTile label="Failed" value={counts.failed} tone={counts.failed > 0 ? "danger" : undefined} />
            </div>
            {(deliveryRate !== null || replyRate !== null) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {deliveryRate !== null && `Delivery rate: ${deliveryRate}% of sent`}
                {deliveryRate !== null && replyRate !== null && " · "}
                {replyRate !== null && `Reply rate: ${replyRate}% of delivered`}
              </p>
            )}
            {counts.total > 0 && counts.sent === 0 && counts.failed === counts.total && (
              <p className="mt-3 text-sm text-danger-600">All recipients failed — check your WhatsApp connection in Settings.</p>
            )}
          </Card>
        )}

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipients</h3>
          {recipients.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No recipients selected yet.</Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {recipients.map((r) => (
                <Link
                  key={r.id}
                  href={`/customers/${r.customer_id}`}
                  className="flex items-center justify-between gap-3 p-4 text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.customerPhone}</p>
                  </div>
                  <Badge variant={RECIPIENT_STATUS_TONE[r.status]}>{RECIPIENT_STATUS_LABEL[r.status]}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function ResultTile({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 text-center">
      <p className={`text-xl font-semibold ${tone === "danger" && value > 0 ? "text-danger-600" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
