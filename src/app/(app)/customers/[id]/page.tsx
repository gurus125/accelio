import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Repeat, Wallet, Check, CheckCheck, Send } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { deriveCustomerStatus } from "@/lib/customers/status";
import { MessageComposer } from "@/components/message-composer";
import { SendWhatsappButton } from "@/components/send-whatsapp-button";
import { Card } from "@/components/ui/card";
import { getCustomerById, CUSTOMERS, ACTIVITY_FEED } from "@/lib/mock-data";
import { getOpportunityForCustomer } from "@/lib/opportunity-engine";
import { formatDaysAgo, formatINR, formatPhone } from "@/lib/utils";
import type { CommunicationStatus } from "@/types";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCustomer, listEventsForCustomer } from "@/lib/customers/queries";
import { computeCustomerStats, formatLastVisit } from "@/lib/customers/mappers";
import { EditCustomerButton } from "@/components/customers/customer-form";
import { DeleteCustomerDialog } from "@/components/customers/delete-customer-dialog";
import { AddActivityButton } from "@/components/customers/customer-event-form";
import { RecurringScheduleManager } from "@/components/customers/recurring-schedule-manager";
import { getOpportunityForCustomer as getRealOpportunityForCustomer } from "@/lib/opportunities/queries";
import { listRecurringSchedulesForCustomer } from "@/lib/recurring-schedules/queries";
import { Badge } from "@/components/ui/badge";
import type { OpportunityType } from "@/lib/opportunities/types";
import { getCommunicationTimelineForCustomer } from "@/lib/whatsapp/queries";
import { getCustomerAnalyticsSummary } from "@/lib/analytics/customers";
import { REACTIVATION_ATTRIBUTION_DAYS } from "@/lib/analytics/reactivation";
import { isEligibleToday } from "@/lib/recommendations/filters";
import { deriveOutreachContextFromTimeline } from "@/lib/recommendations/utils";
import { listCampaignActivityForCustomer } from "@/lib/campaigns/queries";
import type { CampaignRecipientStatus } from "@/lib/campaigns/types";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { CommunicationHistory } from "@/components/customers/communication-history";

const CAMPAIGN_RECIPIENT_STATUS_LABEL: Record<CampaignRecipientStatus, string> = {
  selected: "Selected",
  ready: "Sending...",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  replied: "Replied",
  failed: "Couldn't send",
  skipped: "Skipped",
};

const OPPORTUNITY_TONE: Record<OpportunityType, "warning" | "danger" | "default" | "muted"> = {
  high_value_inactive: "danger",
  due_to_return: "warning",
  service_reminder: "default",
  inactive: "muted",
  follow_up: "muted",
};

const STATUS_ICON: Record<CommunicationStatus, typeof Check> = {
  sent: Send,
  delivered: Check,
  read: CheckCheck,
  replied: CheckCheck,
};

const STATUS_LABEL: Record<CommunicationStatus, string> = {
  sent: "Message sent",
  delivered: "Delivered",
  read: "Read",
  replied: "Replied",
};

export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) {
    return <MockCustomerProfile id={params.id} />;
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar
          title="Customer"
          subtitle={
            <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to customers
            </Link>
          }
        />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        </div>
      </>
    );
  }

  const customer = await getCustomer(business.id, params.id);
  if (!customer) notFound();

  const events = await listEventsForCustomer(customer.id);
  const stats = computeCustomerStats(events);
  const opportunity = await getRealOpportunityForCustomer(customer.id);
  const timeline = await getCommunicationTimelineForCustomer(customer.id);
  const campaignActivity = await listCampaignActivityForCustomer(customer.id);
  const analyticsSummary = await getCustomerAnalyticsSummary(business.id, customer.id);
  const recurringSchedules = await listRecurringSchedulesForCustomer(business.id, customer.id);
  // Phase 12 — "Recommended today" indicator, reusing the exact same
  // eligibility rule `lib/recommendations` applies on the dashboard (no
  // second rule set) against data this page already fetched above, so no
  // extra business-wide query is needed just to check one customer.
  const isRecommendedToday = Boolean(
    opportunity && isEligibleToday(opportunity, deriveOutreachContextFromTimeline(timeline))
  );
  const normalizedPhone = normalizePhoneForWhatsApp(customer.phone);
  const whatsappDeepLink = normalizedPhone ? `https://wa.me/${normalizedPhone}` : null;

  return (
    <>
      <TopBar
        title={customer.name}
        subtitle={
          <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to customers
          </Link>
        }
        action={
          <div className="flex gap-2">
            <EditCustomerButton
              customerId={customer.id}
              initial={{
                name: customer.name,
                phone: customer.phone,
                notes: customer.notes ?? "",
                whatsappConsent: customer.whatsapp_consent === true,
                optedOutAt: customer.opted_out_at ?? null,
              }}
            />
            <DeleteCustomerDialog customerId={customer.id} customerName={customer.name} redirectTo="/customers" />
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={customer.name} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{customer.name}</h2>
                  <StatusBadge status={deriveCustomerStatus(opportunity, stats.visitCount)} />
                  {timeline.some((entry) => entry.direction === "inbound") && (
                    <Badge variant="success">Customer replied</Badge>
                  )}
                  {customer.opted_out_at ? (
                    <Badge variant="danger">WhatsApp: opted out</Badge>
                  ) : customer.whatsapp_consent ? (
                    <Badge variant="success">WhatsApp: agreed</Badge>
                  ) : (
                    <Badge variant="warning">WhatsApp: no consent yet</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{formatPhone(customer.phone)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <CalendarDays aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Last visit</p>
                <p className="font-medium">{formatLastVisit(stats.lastVisitAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Repeat aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Total visits</p>
                <p className="font-medium">{stats.visitCount}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Wallet aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Total spent</p>
                <p className="font-medium">{formatINR(stats.totalSpent)}</p>
              </div>
            </div>
          </div>
          {customer.notes && (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{customer.notes}</p>
          )}
        </Card>

        <Card className="p-5">
          {opportunity ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Accelio recommendation
                </h3>
                <Badge variant={OPPORTUNITY_TONE[opportunity.type]}>{opportunity.title}</Badge>
                {isRecommendedToday && <Badge variant="success">Recommended today</Badge>}
              </div>
              <p className="mt-1.5 text-base">{opportunity.explanation}</p>
              <div className="mt-3">
                <Link href={`/opportunities/${customer.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                  Review this opportunity →
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground">Accelio recommendation</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {stats.visitCount === 0
                  ? "No action recommended right now — not enough visit history yet."
                  : "No action recommended right now."}
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-muted-foreground">Communication &amp; reactivation</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Messages sent</p>
              <p className="font-medium">{analyticsSummary.messagesSent}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Replies</p>
              <p className="font-medium">{analyticsSummary.repliesTotal}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last outreach</p>
              <p className="font-medium">
                {analyticsSummary.lastOutreachAt
                  ? new Date(analyticsSummary.lastOutreachAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last reply</p>
              <p className="font-medium">
                {analyticsSummary.lastReplyAt
                  ? new Date(analyticsSummary.lastReplyAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  : "—"}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            {analyticsSummary.returnedAfterOutreach ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">Returned after outreach</Badge>
                <span className="text-sm text-muted-foreground">
                  Outreach:{" "}
                  {analyticsSummary.outreachAt &&
                    new Date(analyticsSummary.outreachAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {" · "}Return:{" "}
                  {analyticsSummary.returnAt &&
                    new Date(analyticsSummary.returnAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {analyticsSummary.revenue !== null ? ` · ${formatINR(analyticsSummary.revenue)}` : ""}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No qualifying return recorded within {REACTIVATION_ATTRIBUTION_DAYS} days of outreach yet.
              </p>
            )}
          </div>
        </Card>

        {campaignActivity.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-muted-foreground">Campaign activity</h3>
            <ul className="mt-2 divide-y divide-border">
              {campaignActivity.map((activity) => (
                <li key={`${activity.campaignId}-${activity.updatedAt}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/campaigns/${activity.campaignId}`} className="truncate font-medium text-brand-600 hover:underline">
                    {activity.campaignName}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {CAMPAIGN_RECIPIENT_STATUS_LABEL[activity.status]} ·{" "}
                    {new Date(activity.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Customer history</h3>
              <AddActivityButton customerId={customer.id} />
            </div>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No activity logged yet — add the first visit.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{event.service ?? (event.event_type === "note" ? "Note" : "Activity")}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.occurred_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {event.notes ? ` · ${event.notes}` : ""}
                      </p>
                    </div>
                    {event.amount != null && <p className="font-medium">{formatINR(event.amount)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">Communication history</h3>
            <CommunicationHistory timeline={timeline} whatsappDeepLink={whatsappDeepLink} />
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold">Recurring reminders</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Calendar-based reminders (like a monthly fee) — separate from Accelio&apos;s automatic visit-pattern
            recommendations above.
          </p>
          <div className="mt-3">
            <RecurringScheduleManager customerId={customer.id} schedules={recurringSchedules} />
          </div>
        </Card>
      </div>
    </>
  );
}

/** Unchanged Phase 1–3 mock version, used only when Supabase isn't configured yet. */
function MockCustomerProfile({ id }: { id: string }) {
  const customer = getCustomerById(id);
  if (!customer) notFound();

  const opportunity = getOpportunityForCustomer(customer);
  const events = ACTIVITY_FEED.filter((e) => e.customerId === customer.id);

  return (
    <>
      <TopBar
        title={customer.name}
        subtitle={
          <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to customers
          </Link>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={customer.name} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{customer.name}</h2>
                  <StatusBadge status={customer.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{formatPhone(customer.phone)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <CalendarDays aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Last visit</p>
                <p className="font-medium">{formatDaysAgo(customer.lastVisitDaysAgo)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Repeat aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Total visits</p>
                <p className="font-medium">{customer.visitCount}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Wallet aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <div>
                <p className="text-xs text-muted-foreground">Total spent</p>
                <p className="font-medium">{formatINR(customer.totalSpent)}</p>
              </div>
            </div>
          </div>
        </Card>

        {opportunity && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Why Accelio recommends contacting {customer.name.split(" ")[0]}
            </h3>
            <p className="mt-1.5 text-base">{opportunity.explanation}</p>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Recommended message</p>
              <MessageComposer initialMessage={opportunity.suggestedMessage} />
              <div className="mt-3">
                <SendWhatsappButton />
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-semibold">Customer history</h3>
            <ul className="mt-3 divide-y divide-border">
              {customer.history.map((visit) => (
                <li key={visit.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{visit.service}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(visit.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <p className="font-medium">{formatINR(visit.amount)}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">Communication history</h3>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No messages sent yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((event) => {
                  const Icon = STATUS_ICON[event.status];
                  return (
                    <li key={event.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className={event.status === "replied" ? "h-3.5 w-3.5 text-brand-600" : "h-3.5 w-3.5 text-muted-foreground"} />
                      </div>
                      <div>
                        <p className="font-medium">
                          {event.campaignName ? `${event.campaignName} — ` : ""}
                          {STATUS_LABEL[event.status]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
