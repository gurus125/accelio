import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { WhatsappBubble } from "@/components/whatsapp-bubble";
import { SendWhatsappButton } from "@/components/send-whatsapp-button";
import { formatDaysAgo, formatINR } from "@/lib/utils";
import type { Customer, Opportunity } from "@/types";

interface OpportunityCardProps {
  customer: Customer;
  opportunity: Opportunity;
}

const REASON_TONE: Record<Opportunity["reason"], "warning" | "danger" | "default" | "muted"> = {
  due_to_return: "warning",
  inactive: "danger",
  follow_up: "muted",
  offer: "default",
};

export function OpportunityCard({ customer, opportunity }: OpportunityCardProps) {
  return (
    <Card className="p-5 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Avatar name={customer.name} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/customers/${customer.id}`} className="font-semibold hover:underline">
                {customer.name}
              </Link>
              <Badge variant={REASON_TONE[opportunity.reason]}>{opportunity.reasonLabel}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Last visit</dt>
                <dd className="font-medium">{formatDaysAgo(customer.lastVisitDaysAgo)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Usually returns</dt>
                <dd className="font-medium">Every ~{customer.averageReturnDays} days</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Spent</dt>
                <dd className="font-medium">{formatINR(customer.totalSpent)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Why contact {customer.name.split(" ")[0]}?
        </p>
        <p className="mt-1 text-sm">{opportunity.explanation}</p>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Suggested message</p>
        <WhatsappBubble message={opportunity.suggestedMessage} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/customers/${customer.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Review
        </Link>
        <SendWhatsappButton size="sm" />
      </div>
    </Card>
  );
}
