import Link from "next/link";
import { ArrowRight, CalendarClock, UserX, MessageSquare, Tag, Users, UserCheck, Clock } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { countCustomersByStatus, deriveCustomerStatus } from "@/lib/customers/status";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { getAllOpportunities, getOpportunityCounts } from "@/lib/opportunity-engine";
import { getCustomerById } from "@/lib/mock-data";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCustomers, listEventsForBusiness } from "@/lib/customers/queries";
import { calculateOpportunities, groupEventsByCustomer } from "@/lib/opportunities/calculate";
import { listServiceBaselines } from "@/lib/opportunities/baselines";
import { getDashboardAnalyticsSummary } from "@/lib/analytics/dashboard";
import { UserCheck as ReturnedIcon, MessageSquare as RepliesIcon, CheckCheck, Eye } from "lucide-react";
import { getDailyRecommendations } from "@/lib/recommendations/dailyRecommendations";
import { TodaysRecommendations } from "@/components/recommendations/todays-recommendations";
import { listLeadsForBusiness } from "@/lib/leads/queries";
import { buildLeadFollowUps } from "@/lib/leads/priority";
import { MAX_LEAD_FOLLOWUPS_SHOWN } from "@/lib/leads/constants";
import { WebsiteLeadFollowUps } from "@/components/leads/website-lead-follow-ups";
import { AutomationsSummaryCard } from "@/components/automations/automations-summary-card";
import { getAutomationDashboardSummary } from "@/lib/automations/queries";
import { getBusinessTimeZone } from "@/lib/dates";

export default async function DashboardPage() {
  if (!isSupabaseConfigured) {
    return <MockDashboard />;
  }

  const business = await getBusinessForCurrentUser();

  if (!business) {
    return (
      <>
        <TopBar title="Welcome to Reelo" subtitle="Finish setting up your business to see your dashboard." />
        <div className="flex-1 p-4 sm:p-8">
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">Your business profile isn&apos;t set up yet.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Go to{" "}
              <Link href="/settings" className="text-brand-600 hover:underline">
                Settings
              </Link>{" "}
              to finish setting up your business.
            </p>
          </div>
        </div>
      </>
    );
  }

  const [customers, events, analyticsSummary, dailyRecommendations, leads, automationsSummary, serviceBaselines] = await Promise.all([
    listCustomers(business.id),
    listEventsForBusiness(business.id),
    getDashboardAnalyticsSummary(business.id, getBusinessTimeZone(business)),
    getDailyRecommendations(business),
    listLeadsForBusiness(business.id),
    getAutomationDashboardSummary(business.id, undefined, undefined, getBusinessTimeZone(business)),
    listServiceBaselines(business.id),
  ]);
  const leadFollowUps = buildLeadFollowUps(leads).slice(0, MAX_LEAD_FOLLOWUPS_SHOWN);
  const eventsByCustomerId = groupEventsByCustomer(events);
  const opportunities = calculateOpportunities(customers, eventsByCustomerId, business, serviceBaselines);

  // Milestone 1 — statuses come from the engine, never the old dropdown.
  const opportunityByCustomer = new Map(opportunities.map((o) => [o.customerId, o]));
  const statusOf = (customerId: string) =>
    deriveCustomerStatus(
      opportunityByCustomer.get(customerId),
      (eventsByCustomerId.get(customerId) ?? []).filter((e) => e.event_type === "visit").length
    );
  const statusCounts = countCustomersByStatus(customers.map((c) => statusOf(c.id)));
  const counts = {
    total: customers.length,
    active: statusCounts.active,
    due: statusCounts.due,
    inactive: statusCounts.inactive,
    followUp: statusCounts.follow_up,
  };
  const recent = customers.slice(0, 5);
  const opportunityCounts = {
    total: opportunities.length,
    dueToReturn: opportunities.filter((o) => o.type === "due_to_return").length,
    highValueInactive: opportunities.filter((o) => o.type === "high_value_inactive").length,
    inactive: opportunities.filter((o) => o.type === "inactive").length,
    serviceReminder: opportunities.filter((o) => o.type === "service_reminder").length,
  };

  return (
    <>
      <TopBar title="Welcome back 👋" subtitle="Here's an overview of your customers." />

      <div className="flex-1 space-y-8 p-4 sm:p-8">
        {/* Phase 12 — the dashboard's primary action area: "here's what
            you should do today," ranked from the same Phase 6 opportunity
            engine the rest of the app already uses, filtered down to what's
            actually worth a fresh nudge (see lib/recommendations). */}
        <TodaysRecommendations result={dailyRecommendations} />

        {/* Phase 13 — website leads sit alongside Phase 12's customer
            recommendations as their own actionable "today" item, since a
            lead isn't a customer opportunity and shouldn't be merged into
            one (see lib/leads/priority.ts). */}
        <WebsiteLeadFollowUps followUps={leadFollowUps} totalLeads={leads.length} />

        {/* Phase 14 — a single compact row, secondary to Phase 12's
            recommendations above: what automations are doing, not another
            "what to do today" section competing for attention. */}
        <AutomationsSummaryCard summary={automationsSummary} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} value={counts.total} label="Total customers" tone="brand" />
          <StatCard icon={Clock} value={opportunityCounts.dueToReturn} label="Due to return" tone="warning" />
          <StatCard icon={UserX} value={opportunityCounts.inactive + opportunityCounts.highValueInactive} label="Inactive" tone="danger" />
          <StatCard icon={UserCheck} value={counts.active} label="Active" tone="muted" />
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Customer reactivation (last 30 days)</h2>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              View full analytics
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Users} value={analyticsSummary.contacted} label="Contacted" tone="brand" />
            <StatCard icon={ReturnedIcon} value={analyticsSummary.returnedAfterOutreach} label="Returned after outreach" tone="muted" />
            <StatCard icon={RepliesIcon} value={analyticsSummary.repliesTotal} label="Replies" tone="muted" />
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={CheckCheck} value={analyticsSummary.delivered} label="Delivered" tone="muted" />
              <StatCard icon={Eye} value={analyticsSummary.read} label="Read" tone="muted" />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recently added customers</h2>
            <Link
              href="/customers"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              View all customers
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers yet — add your first one from the{" "}
              <Link href="/customers" className="text-brand-600 hover:underline">
                Customers
              </Link>{" "}
              page.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <ul className="divide-y divide-border">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="font-medium">{c.name}</span>
                      <StatusBadge status={statusOf(c.id)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Unchanged Phase 1–3 mock version, used only when Supabase isn't configured yet. */
function MockDashboard() {
  const opportunities = getAllOpportunities();
  const counts = getOpportunityCounts();
  const featured = opportunities.slice(0, 8);

  return (
    <>
      <TopBar title="Good morning 👋" subtitle="Here are today's customer opportunities." />

      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-6">
          <p className="text-2xl font-semibold tracking-tight text-brand-800 sm:text-3xl">
            {counts.total} customers are worth contacting today
          </p>
          <p className="mt-1.5 text-sm text-brand-700/80">
            Reelo scanned your customer list and found people who are overdue, going quiet, or worth a timely offer.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Link href="/opportunities?filter=due_to_return">
            <StatCard icon={CalendarClock} value={counts.dueToReturn} label="Customers due to return" tone="warning" />
          </Link>
          <Link href="/opportunities?filter=inactive">
            <StatCard icon={UserX} value={counts.inactive} label="Inactive customers" tone="danger" />
          </Link>
          <Link href="/opportunities?filter=follow_up">
            <StatCard icon={MessageSquare} value={counts.followUp} label="Follow-ups" tone="muted" />
          </Link>
          <Link href="/opportunities?filter=offer">
            <StatCard icon={Tag} value={counts.offer} label="Relevant offers" tone="brand" />
          </Link>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Today&apos;s opportunities</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {featured.map((opp) => {
              const customer = getCustomerById(opp.customerId);
              if (!customer) return null;
              return <OpportunityCard key={opp.id} customer={customer} opportunity={opp} />;
            })}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              View all opportunities
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
