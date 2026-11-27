import Link from "next/link";
import { TopBar } from "@/components/layout/topbar";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { TrendBarChart } from "@/components/analytics/trend-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, CheckCheck, Eye, MessageSquare, RotateCcw, Globe, UserPlus, CheckCircle2 } from "lucide-react";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { isSupabaseConfigured } from "@/lib/config";
import { resolveAnalyticsDateRange } from "@/lib/analytics/date-range";
import { getBusinessTimeZone } from "@/lib/dates";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getAnalyticsTrends } from "@/lib/analytics/trends";
import { getOpportunityTypeAnalytics } from "@/lib/analytics/opportunities";
import { getRecentlyReturnedCustomers } from "@/lib/analytics/customers";
import { getCampaignAnalytics } from "@/lib/analytics/campaigns";
import { listCampaignsForBusiness } from "@/lib/campaigns/queries";
import { CAMPAIGN_TYPE_LABELS } from "@/lib/campaigns/types";
import { formatINR } from "@/lib/utils";
import { REACTIVATION_ATTRIBUTION_DAYS } from "@/lib/analytics/reactivation";
import { getLeadAnalyticsSummary, getLeadSourceBreakdown } from "@/lib/analytics/leads";
import { getAutomationAnalyticsForBusiness } from "@/lib/automations/queries";
import { Zap } from "lucide-react";

const OPPORTUNITY_LABELS: Record<string, string> = {
  due_to_return: "Due to return",
  high_value_inactive: "High-value inactive",
  inactive: "Inactive customer",
  service_reminder: "Service reminder",
  follow_up: "Follow-up",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function RevenueValue({ available, amount }: { available: boolean; amount: number | null }) {
  if (!available) {
    return <span className="text-base font-medium text-muted-foreground">Revenue tracking unavailable</span>;
  }
  return <span className="text-2xl font-semibold tracking-tight">{formatINR(amount ?? 0)}</span>;
}

interface AnalyticsPageProps {
  searchParams: { range?: string; from?: string; to?: string };
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  // Without Supabase configured there's no data to analyse — show a calm
  // notice instead of crashing (this also lets `next build` prerender the
  // page in an environment with no Supabase env vars).
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Analytics" />
        <div className="flex-1 p-4 sm:p-8">
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="font-medium">Analytics needs your Supabase project connected.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Add your Supabase settings (see .env.example), then your real numbers will show here.
            </p>
          </div>
        </div>
      </>
    );
  }

  const business = await requireBusinessForCurrentUser();
  const range = resolveAnalyticsDateRange(searchParams, getBusinessTimeZone(business));

  const [overview, trends, opportunityStats, recentlyReturned, campaigns, leadSummary, leadSources, automationAnalytics] = await Promise.all([
    getAnalyticsOverview(business.id, range),
    getAnalyticsTrends(business.id, range),
    getOpportunityTypeAnalytics(business.id, range),
    getRecentlyReturnedCustomers(business.id, range, 10),
    listCampaignsForBusiness(business.id),
    getLeadAnalyticsSummary(business.id, range),
    getLeadSourceBreakdown(business.id, range),
    getAutomationAnalyticsForBusiness(business.id),
  ]);

  const campaignAnalytics = await Promise.all(
    campaigns.map(async (campaign) => ({ campaign, analytics: await getCampaignAnalytics(business.id, campaign) }))
  );

  const { messages, reactivation, totalCustomers } = overview;

  return (
    <>
      <TopBar
        title="Analytics"
        subtitle="Is Accelio actually helping you bring customers back? Every number below comes from your real WhatsApp and visit records."
      />

      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <DateRangeFilter activeKey={range.key} from={searchParams.from} to={searchParams.to} />

        {/* OVERVIEW */}
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Overview</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Users} value={totalCustomers} label="Total customers" tone="muted" />
            <StatCard icon={Send} value={messages.customersContacted} label="Customers contacted" tone="brand" />
            <StatCard icon={Send} value={messages.sent} label="Messages sent" tone="brand" />
            <StatCard icon={CheckCheck} value={messages.delivered} label="Delivered" tone="muted" />
            <StatCard icon={Eye} value={messages.read} label="Read" tone="muted" />
            <StatCard icon={MessageSquare} value={messages.customersReplied} label="Customers replied" tone="brand" />
          </div>
        </section>

        {/* WHATSAPP ENGAGEMENT */}
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">WhatsApp engagement</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Delivery rate = delivered ÷ sent. Read rate = read ÷ delivered. Reply rate = unique customers who replied ÷
            unique customers contacted.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-2xl font-semibold tracking-tight">{messages.sent}</p>
                <p className="mt-1 text-sm text-muted-foreground">Sent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-2xl font-semibold tracking-tight">
                  {messages.delivered} <span className="text-sm font-normal text-muted-foreground">({messages.deliveryRate.display})</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-2xl font-semibold tracking-tight">
                  {messages.read} <span className="text-sm font-normal text-muted-foreground">({messages.readRate.display})</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Read</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-2xl font-semibold tracking-tight">
                  {messages.repliesTotal} <span className="text-sm font-normal text-muted-foreground">({messages.replyRate.display})</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Replies <span className="text-xs">· {messages.customersReplied} customers</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CUSTOMER REACTIVATION */}
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Customer reactivation</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            A customer counts as &ldquo;returned after outreach&rdquo; when they recorded a visit within{" "}
            {REACTIVATION_ATTRIBUTION_DAYS} days of a WhatsApp message from Accelio. This is observational — it does not
            claim the message caused the visit.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-600">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tracking-tight">{reactivation.returnedCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Customers returned after outreach</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue from customers who returned after outreach</CardTitle>
              </CardHeader>
              <CardContent>
                <RevenueValue available={reactivation.revenueTrackingAvailable} amount={reactivation.revenueTotal} />
                {!reactivation.revenueTrackingAvailable && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Add visit/transaction amounts to customer activity to measure revenue.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Recently returned after outreach</h3>
            {recentlyReturned.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers have returned after outreach in this period.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <ul className="divide-y divide-border">
                  {recentlyReturned.map((r) => (
                    <li key={r.customerId}>
                      <Link
                        href={`/customers/${r.customerId}`}
                        className="flex flex-col gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-medium">{r.customerName}</span>
                        <span className="text-muted-foreground">
                          Outreach: {formatDate(r.outreachAt)} · Return: {formatDate(r.returnAt)}
                          {r.revenue !== null ? ` · ${formatINR(r.revenue)}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* CAMPAIGN PERFORMANCE */}
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Campaign performance</h2>
          {campaignAnalytics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
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
                    <th className="px-4 py-3 font-medium">Returned</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaignAnalytics.map(({ campaign, analytics }) => (
                    <tr key={campaign.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Link href={`/campaigns/${campaign.id}`} className="font-medium text-brand-600 hover:underline">
                          {campaign.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{CAMPAIGN_TYPE_LABELS[campaign.campaign_type]}</p>
                      </td>
                      <td className="px-4 py-3">{analytics.recipients}</td>
                      <td className="px-4 py-3">{analytics.sent}</td>
                      <td className="px-4 py-3">{analytics.delivered}</td>
                      <td className="px-4 py-3">{analytics.read}</td>
                      <td className="px-4 py-3">{analytics.repliesTotal}</td>
                      <td className="px-4 py-3">{analytics.returnedAfterOutreach}</td>
                      <td className="px-4 py-3">
                        {analytics.revenueTrackingAvailable ? formatINR(analytics.revenueTotal ?? 0) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* OPPORTUNITY PERFORMANCE */}
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Opportunity performance</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Factual counts per opportunity type — not a ranking or recommendation.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Opportunity type</th>
                  <th className="px-4 py-3 font-medium">Contacted</th>
                  <th className="px-4 py-3 font-medium">Replies</th>
                  <th className="px-4 py-3 font-medium">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {opportunityStats.map((stat) => (
                  <tr key={stat.type}>
                    <td className="px-4 py-3 font-medium">{OPPORTUNITY_LABELS[stat.type] ?? stat.type}</td>
                    <td className="px-4 py-3">{stat.contacted}</td>
                    <td className="px-4 py-3">{stat.customersReplied}</td>
                    <td className="px-4 py-3">{stat.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* WEBSITE LEADS */}
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Website leads</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Conversion rate = leads converted to customers ÷ leads captured, both within this period.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Globe} value={leadSummary.totalLeads} label="Website leads" tone="brand" />
            <StatCard icon={UserPlus} value={leadSummary.newLeads} label="New" tone="warning" />
            <StatCard icon={MessageSquare} value={leadSummary.repliedLeads} label="Replied" tone="muted" />
            <StatCard icon={CheckCircle2} value={leadSummary.convertedLeads} label="Converted" tone="muted" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="text-2xl font-semibold tracking-tight">{leadSummary.conversionRate.display}</p>
                <p className="mt-1 text-sm text-muted-foreground">Lead → customer conversion rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Leads by source</CardTitle>
              </CardHeader>
              <CardContent>
                {leadSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No website leads captured in this period.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {leadSources.map((row) => (
                      <li key={row.source} className="flex items-center justify-between">
                        <span>{row.label}</span>
                        <span className="font-medium">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* AUTOMATIONS — Phase 14. Factual counts only: how many automated
            messages were sent/delivered/read/skipped/failed. Deliberately
            NO attributed revenue figure here ("automation generated ₹X")
            since this product has no real basis to attribute a visit or
            sale to one specific automated message versus everything else
            that happened around it — see the Phase 14 report's note on
            this. */}
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Automations</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Automated WhatsApp follow-ups your active automations have sent, all time — not scoped to the date range
            above.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Zap} value={automationAnalytics.automatedMessagesSent} label="Automated messages sent" tone="brand" />
            <StatCard icon={CheckCheck} value={automationAnalytics.delivered} label="Delivered" tone="muted" />
            <StatCard icon={Eye} value={automationAnalytics.read} label="Read" tone="muted" />
            <StatCard icon={MessageSquare} value={automationAnalytics.skipped} label="Skipped (safety rules)" tone="warning" />
          </div>
        </section>

        {/* TRENDS */}
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Trends</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <TrendBarChart title="Messages sent" points={trends.messagesSent} color="#3b6ef6" />
            <TrendBarChart title="Customer replies" points={trends.replies} color="#10b981" />
            <TrendBarChart title="Returned after outreach" points={trends.returns} color="#f59e0b" />
          </div>
        </section>
      </div>
    </>
  );
}
