import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser, getCurrentMembership } from "@/lib/business/queries";
import { NewAutomationWizard } from "@/components/automations/new-automation-wizard";

export default async function NewAutomationPage() {
  if (!isSupabaseConfigured) {
    notFound();
  }

  const membership = await getCurrentMembership();
  if (membership && membership.role !== "owner") redirect("/dashboard");

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="New automation" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="New automation" />
      <NewAutomationWizard />
    </>
  );
}
