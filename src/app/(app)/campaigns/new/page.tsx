import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { listCustomers } from "@/lib/customers/queries";
import { getAudienceCountsForBusiness } from "@/lib/campaigns/audience";
import { NewCampaignWizard } from "@/components/campaigns/new-campaign-wizard";

export default async function NewCampaignPage() {
  if (!isSupabaseConfigured) {
    notFound();
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="New campaign" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        </div>
      </>
    );
  }

  const [audienceCounts, customers] = await Promise.all([
    getAudienceCountsForBusiness(business.id),
    listCustomers(business.id),
  ]);

  return (
    <>
      <TopBar title="New campaign" />
      <NewCampaignWizard
        audienceCounts={audienceCounts}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        businessName={business.name}
      />
    </>
  );
}
