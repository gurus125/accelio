"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { cancelSubscription } from "@/lib/billing/actions";

/**
 * Always cancel-at-period-end (see `cancelSubscription`'s own comment) —
 * there is no immediate-cancellation path in this UI, matching the spec's
 * required "remains active until [date]" messaging. Cancelling a paid
 * plan never fully locks a business out: it lands them on the permanent
 * Free plan once the current period ends, never a dead "cancelled" state.
 * No business data is ever touched by this action.
 */
export function CancelSubscriptionButton() {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    const result = await cancelSubscription();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Cancel subscription
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-danger-200 bg-danger-50/50 p-4">
      <p className="text-sm font-medium">Cancel your subscription?</p>
      <p className="text-sm text-muted-foreground">
        You&apos;ll keep full access to your current plan until the end of this billing period, then move to the
        Free plan — free forever, no card needed. Nothing is removed: none of your customers, messages, or
        campaigns are ever deleted.
      </p>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="destructive" onClick={handleCancel} disabled={loading}>
          {loading ? "Cancelling..." : "Confirm cancellation"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={loading}>
          Never mind
        </Button>
      </div>
      <InlineError message={error} />
    </div>
  );
}
