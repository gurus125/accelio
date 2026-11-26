import Link from "next/link";
import { TopBar } from "@/components/layout/topbar";
import { CustomersContent } from "@/components/customers/customers-content";
import { RealCustomersContent } from "@/components/customers/real-customers-content";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCustomerPhoneIssues, listCustomers, listEventsForBusiness } from "@/lib/customers/queries";
import { PhoneIssuesCard } from "@/components/customers/phone-issues-card";
import { computeCustomerStats } from "@/lib/customers/mappers";
import { buttonVariants } from "@/components/ui/button";
import type { CustomerEventRow } from "@/types/database";
import type { RealCustomer } from "@/types/database";

export default async function CustomersPage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Customers" />
        <CustomersContent />
      </>
    );
  }

  const business = await getBusinessForCurrentUser();

  if (!business) {
    return (
      <>
        <TopBar title="Customers" />
        <div className="flex-1 p-4 sm:p-8">
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="font-medium">Your business profile isn&apos;t set up yet.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Finish the quick setup steps first — it only takes a minute, and then you can import or add customers.
            </p>
            <Link href="/onboarding" className={buttonVariants({ size: "sm", className: "mt-4" })}>
              Finish setting up
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [rows, events, phoneIssues] = await Promise.all([
    listCustomers(business.id),
    listEventsForBusiness(business.id),
    listCustomerPhoneIssues(business.id),
  ]);

  const eventsByCustomer = new Map<string, CustomerEventRow[]>();
  for (const event of events) {
    const list = eventsByCustomer.get(event.customer_id) ?? [];
    list.push(event);
    eventsByCustomer.set(event.customer_id, list);
  }

  const customers: RealCustomer[] = rows.map((row) => ({
    ...row,
    ...computeCustomerStats(eventsByCustomer.get(row.id) ?? []),
  }));

  return (
    <>
      <TopBar title="Customers" />
      {phoneIssues.length > 0 && (
        <div className="px-4 pt-4 sm:px-8 sm:pt-8">
          <PhoneIssuesCard issues={phoneIssues} />
        </div>
      )}
      <RealCustomersContent customers={customers} />
    </>
  );
}
