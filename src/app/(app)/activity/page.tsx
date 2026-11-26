import { Send, CheckCheck, Check, Reply, MessageCircle } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ACTIVITY_FEED, ACTIVITY_SUMMARY, getCustomerById, ANCHOR_DATE } from "@/lib/mock-data";
import type { CommunicationStatus } from "@/types";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCustomers } from "@/lib/customers/queries";
import {
  getCommunicationSummaryForBusiness,
  listRecentCommunicationForBusiness,
  listUnknownSendersForBusiness,
} from "@/lib/whatsapp/queries";
import { AddUnknownSenderButton } from "@/components/activity/add-unknown-sender-button";

const STATUS_ICON: Record<CommunicationStatus, typeof Send> = {
  sent: Send,
  delivered: Check,
  read: CheckCheck,
  replied: Reply,
};

const STATUS_LABEL: Record<CommunicationStatus, string> = {
  sent: "Message sent",
  delivered: "Delivered",
  read: "Message read",
  replied: "Replied",
};

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export default async function ActivityPage() {
  if (isSupabaseConfigured) {
    return <RealActivityPage />;
  }
  return <MockActivityPage />;
}

/**
 * Phase 9 — real WhatsApp activity for the signed-in business: a lightweight
 * summary (sent/delivered/read/replies/failed), a merged recent feed, and
 * any inbound messages that couldn't be matched to a known customer. No
 * time-series charts, no per-campaign breakdowns — see the Phase 9 spec's
 * warning against overbuilding this page.
 */
async function RealActivityPage() {
  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="Activity" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        </div>
      </>
    );
  }

  const [summary, recent, unknownSenders, customers] = await Promise.all([
    getCommunicationSummaryForBusiness(business.id),
    listRecentCommunicationForBusiness(business.id),
    listUnknownSendersForBusiness(business.id),
    listCustomers(business.id),
  ]);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));

  const summaryTiles = [
    { label: "Sent", value: summary.sent },
    { label: "Delivered", value: summary.delivered },
    { label: "Read", value: summary.read },
    { label: "Replies", value: summary.replies },
    { label: "Failed", value: summary.failed },
  ];

  return (
    <>
      <TopBar title="Activity" />
      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {summaryTiles.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-white p-4 text-center">
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {unknownSenders.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unknown WhatsApp senders
            </p>
            <Card className="divide-y divide-border p-0">
              {unknownSenders.map((message) => (
                <div key={message.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{message.from_phone}</p>
                    <p className="truncate text-xs text-muted-foreground">{message.content ?? "(non-text message)"}</p>
                  </div>
                  <AddUnknownSenderButton customerMessageId={message.id} fromPhone={message.from_phone} />
                </div>
              ))}
            </Card>
          </div>
        )}

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
          {recent.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No communication yet.</Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {recent.map((entry) => {
                const name = entry.customerId ? customerNameById.get(entry.customerId) ?? "Unknown customer" : "Unknown customer";
                const label =
                  entry.direction === "inbound"
                    ? "Customer replied"
                    : entry.message.status === "failed"
                      ? "Couldn't send"
                      : entry.message.status === "read"
                        ? "Read"
                        : entry.message.status === "delivered"
                          ? "Delivered"
                          : entry.message.status === "sent"
                            ? "Sent"
                            : "Sending";
                return (
                  <div key={`${entry.direction}-${entry.message.id}`} className="flex items-center gap-3 p-4">
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">{label}</p>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/** Unchanged Phase 1–3 mock version, used only when Supabase isn't configured yet. */
function MockActivityPage() {
  const today = ACTIVITY_FEED.filter((e) => isSameDay(new Date(e.timestamp), ANCHOR_DATE));
  const earlier = ACTIVITY_FEED.filter((e) => !isSameDay(new Date(e.timestamp), ANCHOR_DATE));

  const summary = [
    { label: "Sent", value: ACTIVITY_SUMMARY.sent },
    { label: "Delivered", value: ACTIVITY_SUMMARY.delivered },
    { label: "Read", value: ACTIVITY_SUMMARY.read },
    { label: "Replies", value: ACTIVITY_SUMMARY.replies },
  ];

  const renderGroup = (label: string, events: typeof ACTIVITY_FEED) => {
    if (events.length === 0) return null;
    return (
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Card className="divide-y divide-border p-0">
          {events.map((event) => {
            const customer = getCustomerById(event.customerId);
            const Icon = STATUS_ICON[event.status];
            return (
              <div key={event.id} className="flex items-center gap-3 p-4">
                <Avatar name={customer?.name ?? "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{customer?.name ?? "Unknown customer"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {event.campaignName ? `${event.campaignName} · ` : ""}
                    {STATUS_LABEL[event.status]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Icon className={event.status === "replied" ? "h-3.5 w-3.5 text-brand-600" : "h-3.5 w-3.5"} />
                  {new Date(event.timestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    );
  };

  return (
    <>
      <TopBar title="Activity" />
      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-white p-4 text-center">
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-8">
          {renderGroup("Today", today)}
          {renderGroup("Earlier", earlier)}
        </div>
      </div>
    </>
  );
}
