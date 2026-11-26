import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { CustomerImportWizard } from "@/components/import/customer-import-wizard";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";

export default async function CustomersImportPage() {
  const backLink = (
    <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to customers
    </Link>
  );

  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Import customers" subtitle={backLink} />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">
            Connect Supabase (see Settings) before importing real customer data.
          </p>
        </div>
      </>
    );
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="Import customers" subtitle={backLink} />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Finish setting up your business in Settings first.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Import customers" subtitle={backLink} />
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-8">
        <CustomerImportWizard />
      </div>
    </>
  );
}
