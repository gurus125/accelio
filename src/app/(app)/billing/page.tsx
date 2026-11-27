import { CreditCard } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured } from "@/lib/config";
import { getCurrentMembership } from "@/lib/business/queries";
import { getBillingSnapshotForBusiness } from "@/lib/billing/subscription";
import { listBillingEventsForBusiness } from "@/lib/billing/queries";
import {
  countActiveAutomations,
  countAiGenerationsSince,
  countCampaignsCreatedSince,
  countCustomersForBusiness,
  countStaffSeatsUsed,
  countWhatsAppMessagesSince,
  resolvePeriodStart,
} from "@/lib/billing/usage";
import { PLANS, PLAN_ORDER, formatPlanPrice } from "@/lib/billing/plans";
import { UsageBar } from "@/components/billing/usage-bar";
import { PlanCheckoutButton } from "@/components/billing/plan-checkout-button";
import { CancelSubscriptionButton } from "@/components/billing/cancel-subscription-button";
import type { SubscriptionStatus } from "@/types/database";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "Free trial",
  active: "Active",
  past_due: "Payment issue",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_BADGE_VARIANT: Record<SubscriptionStatus, "muted" | "success" | "warning" | "danger"> = {
  trial: "muted",
  active: "success",
  past_due: "warning",
  cancelled: "danger",
  expired: "danger",
};

export default async function BillingPage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar title="Billing" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">This feature isn&apos;t available yet.</p>
        </div>
      </>
    );
  }

  const membership = await getCurrentMembership();
  if (!membership) {
    return (
      <>
        <TopBar title="Billing" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Set up your business profile first.</p>
        </div>
      </>
    );
  }

  const isOwner = membership.role === "owner";
  const snapshot = await getBillingSnapshotForBusiness(membership.business.id);

  if (!snapshot) {
    return (
      <>
        <TopBar title="Billing" />
        <div className="flex-1 p-4 sm:p-8">
          <p className="text-sm text-muted-foreground">Your billing couldn&apos;t be found. Please contact support.</p>
        </div>
      </>
    );
  }

  // Phase 16 — billing management is owner-only, even though staff share
  // business membership (same boundary as WhatsApp config, automations,
  // and business settings). Staff still see their plan/status read-only —
  // useful context for why an action might be blocked — with a friendly
  // explanation instead of a dead end.
  if (!isOwner) {
    return (
      <>
        <TopBar title="Billing" />
        <div className="mx-auto w-full max-w-lg flex-1 p-4 sm:p-8">
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <CreditCard className="h-6 w-6 text-muted-foreground" />
            <p className="font-medium">Your business owner manages the subscription.</p>
            <p className="text-sm text-muted-foreground">
              You&apos;re on the <span className="font-medium text-foreground">{snapshot.plan.name}</span> plan (
              {STATUS_LABEL[snapshot.effectiveStatus].toLowerCase()}).
            </p>
          </Card>
        </div>
      </>
    );
  }

  const periodStart = resolvePeriodStart(snapshot.subscription);
  const [customers, staff, aiGenerations, whatsappMessages, campaigns, activeAutomations, history] = await Promise.all([
    countCustomersForBusiness(membership.business.id),
    countStaffSeatsUsed(membership.business.id),
    countAiGenerationsSince(membership.business.id, periodStart),
    countWhatsAppMessagesSince(membership.business.id, periodStart),
    countCampaignsCreatedSince(membership.business.id, periodStart),
    countActiveAutomations(membership.business.id),
    listBillingEventsForBusiness(membership.business.id),
  ]);

  const otherPlans = PLAN_ORDER.filter((id) => id !== snapshot.plan.id).map((id) => PLANS[id]);
  const isPaid = Boolean(snapshot.subscription.provider_subscription_id);
  const canManage = snapshot.effectiveStatus !== "cancelled" && snapshot.effectiveStatus !== "expired";

  return (
    <>
      <TopBar title="Billing" subtitle={`${snapshot.plan.name} plan · ${STATUS_LABEL[snapshot.effectiveStatus]}`} />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-8">
        {snapshot.effectiveStatus === "past_due" && (
          <Card className="border-warning-200 bg-warning-50/50 p-4">
            <p className="text-sm font-medium text-warning-700">There&apos;s a problem with your last payment.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Please update your payment method with Razorpay, or your access may be paused soon. Nothing has been
              deleted — this only affects new sends and generations.
            </p>
          </Card>
        )}

        {(snapshot.effectiveStatus === "cancelled" || snapshot.effectiveStatus === "expired") && (
          <Card className="border-danger-200 bg-danger-50/50 p-4">
            <p className="text-sm font-medium text-danger-700">Your subscription has ended.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your data is safe and nothing has been deleted. Choose a plan below to continue — or pick Free to keep
              using Accelio at no cost, with no time limit.
            </p>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{snapshot.plan.name}</CardTitle>
                <CardDescription>
                  {formatPlanPrice(snapshot.plan)} / month
                  {snapshot.effectiveStatus === "trial" && snapshot.trialDaysRemaining !== null
                    ? ` · ${snapshot.trialDaysRemaining} day${snapshot.trialDaysRemaining === 1 ? "" : "s"} left in trial`
                    : ""}
                  {snapshot.subscription.cancel_at_period_end && snapshot.subscription.current_period_end
                    ? ` · Ends ${new Date(snapshot.subscription.current_period_end).toLocaleDateString()}`
                    : ""}
                </CardDescription>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[snapshot.effectiveStatus]}>
                {STATUS_LABEL[snapshot.effectiveStatus]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar label="Customers" used={customers} limit={snapshot.plan.limits.maxCustomers} />
            <UsageBar label="Staff seats" used={staff} limit={snapshot.plan.limits.maxStaff} />
            <UsageBar label="AI-generated messages this period" used={aiGenerations} limit={snapshot.plan.limits.maxAiGenerationsPerMonth} />
            <UsageBar label="WhatsApp messages this period" used={whatsappMessages} limit={snapshot.plan.limits.maxWhatsappMessagesPerMonth} />
            <UsageBar label="Campaigns this period" used={campaigns} limit={snapshot.plan.limits.maxCampaignsPerMonth} />
            <UsageBar label="Active automations" used={activeAutomations} limit={snapshot.plan.limits.maxActiveAutomations} />
          </CardContent>
        </Card>

        {canManage && !snapshot.subscription.cancel_at_period_end && otherPlans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Change plan</CardTitle>
              <CardDescription>
                {snapshot.plan.id === "free"
                  ? "Upgrade whenever you need more than the Free plan includes."
                  : "Switch to a different plan at any time."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {otherPlans.map((plan) => (
                <div key={plan.id} className="space-y-1">
                  <PlanCheckoutButton
                    planId={plan.id}
                    planName={plan.name}
                    variant="secondary"
                    label={plan.id === "free" ? "Downgrade to Free" : `Switch to ${plan.name} — ${formatPlanPrice(plan)}/month`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Choose a plan</CardTitle>
              <CardDescription>Pick up right where you left off — none of your data was touched.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PLAN_ORDER.map((planId) => (
                <PlanCheckoutButton key={planId} planId={planId} planName={PLANS[planId].name} />
              ))}
            </CardContent>
          </Card>
        )}

        {isPaid && canManage && !snapshot.subscription.cancel_at_period_end && (
          <div className="flex justify-end">
            <CancelSubscriptionButton />
          </div>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Billing history</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {history.map((event) => (
                <div key={event.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground">{event.event_type.replace(/[._]/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
