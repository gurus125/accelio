import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import type { Opportunity, OpportunityType } from "@/lib/opportunities/types";

interface RealOpportunityCardProps {
  opportunity: Opportunity;
}

const TYPE_TONE: Record<OpportunityType, "warning" | "danger" | "default" | "muted"> = {
  high_value_inactive: "danger",
  due_to_return: "warning",
  service_reminder: "default",
  inactive: "muted",
  follow_up: "muted",
};

/**
 * The real, rule-based opportunity card. Deliberately does NOT include an
 * AI-generated message or a "Send WhatsApp" action — Phase 6 is about
 * surfacing *who* is worth contacting and *why*, not sending anything.
 * That's future-phase work.
 */
export function RealOpportunityCard({ opportunity }: RealOpportunityCardProps) {
  const firstName = opportunity.customerName.split(" ")[0];

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Avatar name={opportunity.customerName} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/customers/${opportunity.customerId}`} className="font-semibold hover:underline">
                {opportunity.customerName}
              </Link>
              <Badge variant={TYPE_TONE[opportunity.type]}>{opportunity.title}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Last visit</dt>
                <dd className="font-medium">
                  {opportunity.daysSinceLastVisit === null ? "—" : `${opportunity.daysSinceLastVisit}d ago`}
                </dd>
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
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">Why contact {firstName}?</p>
        <p className="mt-1 text-sm">{opportunity.explanation}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/opportunities/${opportunity.customerId}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Review
        </Link>
        <Link
          href={`/customers/${opportunity.customerId}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          View customer
        </Link>
      </div>
    </Card>
  );
}
