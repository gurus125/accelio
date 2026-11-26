import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { Campaign } from "@/types";
import type { CampaignResultCounts, CampaignRow, CampaignStatus } from "@/lib/campaigns/types";
import { CAMPAIGN_TYPE_LABELS } from "@/lib/campaigns/types";

const STATUS_TONE_MOCK: Record<Campaign["status"], "success" | "default" | "muted" | "outline"> = {
  active: "success",
  sent: "default",
  draft: "muted",
  completed: "outline",
};

const STATUS_TONE_REAL: Record<CampaignStatus, "success" | "default" | "muted" | "outline" | "danger" | "warning"> = {
  draft: "muted",
  review: "muted",
  approved: "warning",
  sending: "default",
  completed: "success",
  failed: "danger",
  cancelled: "outline",
};

const STATUS_LABEL_REAL: Record<CampaignStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  sending: "Sending...",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

type CampaignCardProps = { campaign: Campaign } | { campaign: CampaignRow; counts: CampaignResultCounts };

function isRealCampaign(props: CampaignCardProps): props is { campaign: CampaignRow; counts: CampaignResultCounts } {
  return "counts" in props;
}

export function CampaignCard(props: CampaignCardProps) {
  if (isRealCampaign(props)) {
    const { campaign, counts } = props;
    return (
      <Link href={`/campaigns/${campaign.id}`}>
        <Card className="flex flex-col justify-between p-5 transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold leading-snug">{campaign.name}</h3>
              <Badge variant={STATUS_TONE_REAL[campaign.status]}>{STATUS_LABEL_REAL[campaign.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{CAMPAIGN_TYPE_LABELS[campaign.campaign_type]}</p>
            <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {counts.total} customer{counts.total === 1 ? "" : "s"}
            </div>
            {counts.total > 0 && counts.sent > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {counts.sent} sent · {counts.delivered} delivered · {counts.read} read · {counts.replied} replied
                {counts.failed > 0 && ` · ${counts.failed} failed`}
              </p>
            )}
          </div>
        </Card>
      </Link>
    );
  }

  const { campaign } = props;
  return (
    <Card className="flex flex-col justify-between p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">{campaign.name}</h3>
          <Badge variant={STATUS_TONE_MOCK[campaign.status]}>{campaign.statusLabel}</Badge>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {campaign.audienceSize} customers
        </div>
      </div>
    </Card>
  );
}
