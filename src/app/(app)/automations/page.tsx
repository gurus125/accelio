import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Zap, Pause, CheckCircle2 } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { AutomationCard } from "@/components/automations/automation-card";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser, getCurrentMembership } from "@/lib/business/queries";
import { listAutomationsForBusiness } from "@/lib/automations/queries";

/**
 * /automations — Phase 14's list page. Deliberately a flat list of at most
 * a handful of cards, never a workflow canvas: the spec's own bar is that
 * an owner understands each automation in one sentence (see
 * `describeAutomationInPlainLanguage`), so the list itself needs no more
 * structure than "Active" and "Paused" summary tiles plus one card per
 * automation.
 */
export default async function AutomationsPage() {
  // Phase 15 — automation management is owner-only (staff never see this
  // in the nav, but the server enforces it too, not just the UI).
  if (isSupabaseConfigured) {
    const membership = await getCurrentMembership();
    if (membership && membership.role !== "owner") redirect("/dashboard");
  }

  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Automations" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">This feature isn&apos;t available yet.</p>
        </div>
      </>
    );
  }

  const business = await getBusinessForCurrentUser();
  if (!business) {
    return (
      <>
        <TopBar title="Automations" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Set up your business profile first.</p>
        </div>
      </>
    );
  }

  const automations = await listAutomationsForBusiness(business.id);
  const activeCount = automations.filter((a) => a.status === "active").length;
  const pausedCount = automations.filter((a) => a.status === "paused").length;
  const draftCount = automations.filter((a) => a.status === "draft").length;

  return (
    <>
      <TopBar
        title="Automations"
        subtitle="Simple, transparent WhatsApp follow-ups you turn on — Accelio never messages anyone without a rule you set up and approved."
        action={
          <Link href="/automations/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            New automation
          </Link>
        }
      />

      <div className="flex-1 space-y-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={CheckCircle2} value={activeCount} label="Active" tone="brand" />
          <StatCard icon={Pause} value={pausedCount} label="Paused" tone="warning" />
          <StatCard icon={Zap} value={draftCount} label="Drafts" tone="muted" />
        </div>

        {automations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <Zap className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium">No automations yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up a simple, safe rule like &quot;When a new website lead arrives, follow up on WhatsApp after 10
              minutes.&quot;
            </p>
            <Link href="/automations/new" className={buttonVariants({ size: "sm", className: "mt-4" })}>
              <Plus className="h-4 w-4" />
              New automation
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {automations.map((automation) => (
              <AutomationCard key={automation.id} automation={automation} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
