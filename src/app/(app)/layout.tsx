import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { BUSINESS } from "@/lib/mock-data";
import { getCurrentMembership } from "@/lib/business/queries";
import { BillingStatusBanner } from "@/components/billing/billing-status-banner";
import type { BusinessMemberRole } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware already redirects unauthenticated requests away from this
  // group — this is a second, server-rendered check (defense in depth) so a
  // protected page never even briefly renders without a valid session.
  //
  // When Supabase isn't configured yet, skip the check entirely (same
  // graceful-degradation rule the health check uses) so the mock dashboard
  // stays reachable before a real project exists.
  let email: string | undefined;
  let businessName: string | undefined;
  let role: BusinessMemberRole | undefined;
  let businessId: string | undefined;

  if (isSupabaseConfigured) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    email = user.email;

    // Phase 15 — the real business + role, via business_members. Falls
    // back to the signup-time metadata name only for a brand new owner who
    // hasn't finished onboarding yet (no business row exists at all).
    const membership = await getCurrentMembership();
    if (membership) {
      businessName = membership.business.name;
      role = membership.role;
      businessId = membership.business.id;
    } else if (typeof user.user_metadata?.business_name === "string" && user.user_metadata.business_name) {
      businessName = user.user_metadata.business_name;
    }
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar businessName={businessName ?? BUSINESS.name} email={email} role={role} />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {businessId && role && <BillingStatusBanner businessId={businessId} isOwner={role === "owner"} />}
        {children}
      </div>
      <MobileNav role={role} />
    </div>
  );
}
