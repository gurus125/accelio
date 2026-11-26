import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatINR } from "@/lib/utils";
import { PRIORITY_LABEL } from "@/lib/recommendations/ranking";
import { RecommendationActions } from "./recommendation-actions";
import type { DailyRecommendation } from "@/lib/recommendations/types";
import type { OpportunityType } from "@/lib/opportunities/types";
import type { RecommendationPriority } from "@/lib/recommendations/types";

const TYPE_TONE: Record<OpportunityType, "warning" | "danger" | "default" | "muted"> = {
  high_value_inactive: "danger",
  due_to_return: "warning",
  service_reminder: "default",
  inactive: "muted",
  follow_up: "muted",
};

const PRIORITY_TONE: Record<RecommendationPriority, "danger" | "default" | "muted"> = {
  high: "danger",
  recommended: "default",
  lower: "muted",
};

interface RecommendationCardProps {
  recommendation: DailyRecommendation;
  /** Stagger the entrance animation so cards cascade in rather than
   * popping in all at once — purely cosmetic, safe to omit. */
  index?: number;
}

/**
 * One row of "Today's recommendations" — business language only (Phase 12
 * spec section 7/24: no internal rule names, no "will probably return,"
 * just what was observed). The only action is `RecommendationActions`,
 * which reuses the existing AI + WhatsApp flow rather than building a
 * second one.
 */
export function RecommendationCard({ recommendation, index = 0 }: RecommendationCardProps) {
  const { opportunity } = recommendation;

  return (
    <Card
      className="animate-fade-in-up p-4 sm:p-5 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Avatar name={opportunity.customerName} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/customers/${opportunity.customerId}`} className="truncate font-semibold hover:underline">
                {opportunity.customerName}
              </Link>
              <Badge variant={TYPE_TONE[opportunity.type]}>{opportunity.title}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{opportunity.explanation}</p>
          </div>
        </div>
        <Badge variant={PRIORITY_TONE[recommendation.priority]} className="shrink-0">
          {PRIORITY_LABEL[recommendation.priority]}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Last visit</dt>
          <dd className="font-medium">{opportunity.daysSinceLastVisit === null ? "—" : `${opportunity.daysSinceLastVisit}d ago`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Visits</dt>
          <dd className="font-medium">{opportunity.visitCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Spent</dt>
          <dd className="font-medium">{formatINR(opportunity.totalSpent)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">Recommended: </span>
        <span className="font-medium">{recommendation.recommendedAction}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RecommendationActions
          customerId={opportunity.customerId}
          customerName={opportunity.customerName}
          opportunityType={opportunity.type}
          whatsappConnected={recommendation.whatsappConnected}
          customerPhoneDisplay={recommendation.customerPhoneDisplay}
        />
        <Link
          href={`/opportunities/${opportunity.customerId}`}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          View details
        </Link>
      </div>
    </Card>
  );
}
