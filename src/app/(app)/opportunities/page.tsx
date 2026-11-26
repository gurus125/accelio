import { Suspense } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/topbar";
import { OpportunitiesContent } from "@/components/opportunities/opportunities-content";
import { RealOpportunitiesContent } from "@/components/opportunities/real-opportunities-content";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCustomers, listEventsForBusiness } from "@/lib/customers/queries";
import { calculateOpportunities, groupEventsByCustomer } from "@/lib/opportunities/calculate";
import { listServiceBaselines } from "@/lib/opportunities/baselines";
import { computeVisitPattern } from "@/lib/opportunities/stats";

export default async function OpportunitiesPage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Customer opportunities" subtitle="People who may be worth contacting today." />
        <Suspense fallback={null}>
          <OpportunitiesContent />
        </Suspense>
      </>
    );
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="Customer opportunities" subtitle="People who may be worth contacting today." />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">
            Finish setting up your business in{" "}
            <Link href="/settings" className="text-brand-600 hover:underline">
              Settings
            </Link>{" "}
            first.
          </p>
        </div>
      </>
    );
  }

  const [customers, events, serviceBaselines] = await Promise.all([
    listCustomers(business.id),
    listEventsForBusiness(business.id),
    listServiceBaselines(business.id),
  ]);
  const eventsByCustomerId = groupEventsByCustomer(events);
  const opportunities = calculateOpportunities(customers, eventsByCustomerId, business, serviceBaselines);
  const hasEvaluableCustomers = customers.some(
    (c) => computeVisitPattern(c.id, eventsByCustomerId.get(c.id) ?? []).visitCount > 0
  );

  return (
    <>
      <TopBar title="Customer opportunities" subtitle="People who may be worth contacting today." />
      <RealOpportunitiesContent opportunities={opportunities} hasEvaluableCustomers={hasEvaluableCustomers} />
    </>
  );
}
