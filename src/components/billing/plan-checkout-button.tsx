"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { startCheckoutForPlan, verifyCheckoutPayment, changePlan } from "@/lib/billing/actions";
import { openRazorpayCheckout } from "./razorpay-checkout";
import type { PlanId } from "@/lib/billing/plans";

interface PlanCheckoutButtonProps {
  planId: PlanId;
  planName: string;
  variant?: "default" | "secondary";
  label?: string;
}

/**
 * One button, for any plan change (Free -> paid, paid -> paid, paid ->
 * Free alike) — it always asks `changePlan` first and reacts to whichever
 * shape comes back:
 *  - `applied`: the change is already done (an instant move onto Free, or
 *    a downgrade to Free scheduled for the end of the current paid
 *    period — `message`, when present, explains which).
 *  - `checkoutNeeded`: Razorpay Checkout must run. `scheduledStartAt:
 *    null` means bill today (Free -> paid, nothing to wait out);
 *    otherwise the new plan is authorized now but its first real charge
 *    is deferred to exactly when the current paid period ends.
 * `changePlan` itself is what decides which of these applies — this
 * component never guesses based on the current plan.
 */
export function PlanCheckoutButton({ planId, planName, variant = "default", label }: PlanCheckoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const runCheckout = async (scheduledStartAt?: string) => {
    const result = await startCheckoutForPlan(planId, scheduledStartAt);
    if (result.error || !result.checkout) {
      setError(result.error ?? "Couldn't start checkout. Please try again.");
      setLoading(false);
      return;
    }

    try {
      await openRazorpayCheckout({
        razorpayKeyId: result.checkout.razorpayKeyId,
        razorpaySubscriptionId: result.checkout.razorpaySubscriptionId,
        planName: result.checkout.planName,
        onSuccess: async (response) => {
          const verifyResult = await verifyCheckoutPayment({
            planId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySubscriptionId: response.razorpay_subscription_id,
            razorpaySignature: response.razorpay_signature,
          });
          setLoading(false);
          if (verifyResult.error) {
            setError(verifyResult.error);
            return;
          }
          router.refresh();
        },
        onDismiss: () => setLoading(false),
      });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Couldn't open the payment form. Please try again.");
    }
  };

  const handleClick = async () => {
    setError(null);
    setNote(null);
    setLoading(true);

    const result = await changePlan(planId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result.applied) {
      setLoading(false);
      if (result.message) setNote(result.message);
      router.refresh();
      return;
    }
    if (result.checkoutNeeded) {
      if (result.checkoutNeeded.scheduledStartAt) {
        setNote(
          `Your current plan stays active until ${new Date(result.checkoutNeeded.scheduledStartAt).toLocaleDateString()}; ${planName} starts right after.`
        );
      }
      await runCheckout(result.checkoutNeeded.scheduledStartAt ?? undefined);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="space-y-1.5">
      <Button onClick={handleClick} disabled={loading} variant={variant} className="w-full">
        {loading ? "Please wait..." : label ?? `Switch to ${planName}`}
      </Button>
      {note && !error && <p className="text-xs text-muted-foreground">{note}</p>}
      <InlineError message={error} />
    </div>
  );
}
