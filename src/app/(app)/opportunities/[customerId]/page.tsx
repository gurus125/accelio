import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Repeat, Wallet } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCustomer } from "@/lib/customers/queries";
import { formatINR, formatPhone } from "@/lib/utils";
import { getOpportunityForCustomer } from "@/lib/opportunities/queries";
import { getRecommendedAction } from "@/lib/opportunities/recommended-action";
import { MessageGenerator } from "@/components/ai/message-generator";
import { getWhatsAppConnection } from "@/lib/whatsapp/queries";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";
import { normalizePhoneForWhatsApp, formatNormalizedPhoneForDisplay } from "@/lib/whatsapp/phone";
import { getCommunicationTimelineForCustomer } from "@/lib/whatsapp/queries";
import type { OpportunityType } from "@/lib/opportunities/types";

const TYPE_TONE: Record<OpportunityType, "warning" | "danger" | "default" | "muted"> = {
  high_value_inactive: "danger",
  due_to_return: "warning",
  service_reminder: "default",
  inactive: "muted",
  follow_up: "muted",
};

export default async function OpportunityDetailPage({ params }: { params: { customerId: string } }) {
  if (!isSupabaseConfigured) {
    notFound();
  }

  const business = await getBusinessForCurrentUser();
  if (!business) notFound();

  const customer = await getCustomer(business.id, params.customerId);
  if (!customer) notFound();

  const opportunity = await getOpportunityForCustomer(params.customerId);

  const connection = await getWhatsAppConnection(business.id);
  const whatsappConnected = Boolean(isWhatsAppEnvConfigured && connection?.connection_status === "connected");
  const normalizedPhone = normalizePhoneForWhatsApp(customer.phone);
  const customerPhoneDisplay = normalizedPhone ? formatNormalizedPhoneForDisplay(normalizedPhone) : null;

  const timeline = await getCommunicationTimelineForCustomer(customer.id);
  const latestOutbound = timeline.find((entry) => entry.direction === "outbound");
  const hasReply = timeline.some((entry) => entry.direction === "inbound");

  return (
    <>
      <TopBar
        title="Opportunity"
        subtitle={
          <Link
            href="/opportunities"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to opportunities
          </Link>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={customer.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{customer.name}</h2>
                {opportunity && <Badge variant={TYPE_TONE[opportunity.type]}>{opportunity.title}</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{formatPhone(customer.phone)}</p>
            </div>
          </div>
        </Card>

        {opportunity ? (
          <>
            <Card className="p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-2.5">
                  <CalendarDays aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last visit</p>
                    <p className="font-medium">
                      {opportunity.daysSinceLastVisit === null ? "—" : `${opportunity.daysSinceLastVisit} days ago`}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Repeat aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total visits</p>
                    <p className="font-medium">{opportunity.visitCount}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Wallet aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total spent</p>
                    <p className="font-medium">{formatINR(opportunity.totalSpent)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Why Reelo flagged {customer.name.split(" ")[0]}
                </h3>
                <p className="mt-1.5 text-base">{opportunity.explanation}</p>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold text-muted-foreground">Recommended action</h3>
              <p className="mt-1.5 text-base font-medium">{getRecommendedAction(opportunity.type)}</p>

              <div className="mt-5 border-t border-border pt-5">
                <h3 className="font-semibold">Suggested message</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reelo can draft a message for this — review it, edit it if you like, then send it on WhatsApp
                  when you&apos;re ready.
                </p>
                <div className="mt-4">
                  <MessageGenerator
                    customerId={customer.id}
                    customerName={customer.name}
                    opportunityType={opportunity.type}
                    whatsappConnected={whatsappConnected}
                    customerPhoneDisplay={customerPhoneDisplay}
                  />
                </div>

                {latestOutbound && latestOutbound.direction === "outbound" && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                    <p className="text-muted-foreground">
                      Last message:{" "}
                      <span className="font-medium text-foreground">
                        {{
                          draft: "Draft",
                          approved: "Approved",
                          sending: "Sending...",
                          sent: "Sent",
                          delivered: "Delivered",
                          read: "Read",
                          failed: "Couldn't send",
                        }[latestOutbound.message.status]}
                      </span>
                      {hasReply && <span className="ml-2 font-medium text-success-600">Customer replied</span>}
                    </p>
                    <Link href={`/customers/${customer.id}`} className="font-medium text-brand-600 hover:underline">
                      View conversation →
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-5">
            <p className="font-medium">No action recommended right now</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Reelo doesn&apos;t see anything worth flagging for {customer.name.split(" ")[0]} at the moment.
            </p>
          </Card>
        )}

        <div>
          <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-brand-600 hover:underline">
            View full customer profile →
          </Link>
        </div>
      </div>
    </>
  );
}
