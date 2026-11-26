import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getBillingSnapshotForBusiness } from "@/lib/billing/subscription";

const TRIAL_WARNING_THRESHOLD_DAYS = 3;

/**
 * A deliberately quiet, slim strip — per the spec's own guidance that
 * billing should stay invisible while everything is working and only
 * surface when the owner actually needs to act. Renders nothing at all
 * unless the trial is about to end, a payment has failed, or access has
 * already lapsed; day-to-day plan/usage details live on `/billing` only.
 * Shown to the owner only — they're the one who can act on it.
 */
export async function BillingStatusBanner({ businessId, isOwner }: { businessId: string; isOwner: boolean }) {
  if (!isOwner) return null;

  const snapshot = await getBillingSnapshotForBusiness(businessId).catch(() => null);
  if (!snapshot) return null;

  let message: string | null = null;
  if (snapshot.effectiveStatus === "trial" && snapshot.trialDaysRemaining !== null && snapshot.trialDaysRemaining <= TRIAL_WARNING_THRESHOLD_DAYS) {
    message =
      snapshot.trialDaysRemaining === 0
        ? "Your free trial ends today."
        : `Your free trial ends in ${snapshot.trialDaysRemaining} day${snapshot.trialDaysRemaining === 1 ? "" : "s"}.`;
  } else if (snapshot.effectiveStatus === "past_due") {
    message = "There's a problem with your last payment.";
  } else if (snapshot.effectiveStatus === "cancelled" || snapshot.effectiveStatus === "expired") {
    message = "Your subscription has ended.";
  }

  if (!message) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warning-50 px-4 py-2 text-center text-sm text-warning-700">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
      <Link href="/billing" className="font-medium underline underline-offset-2">
        Manage billing
      </Link>
    </div>
  );
}
