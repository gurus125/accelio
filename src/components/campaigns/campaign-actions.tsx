"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, X, Check, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/inline-error";
import { approveCampaign, cancelCampaign } from "@/lib/campaigns/actions";
import type { CampaignStatus } from "@/lib/campaigns/types";

interface SendResponse {
  ok: boolean;
  error?: string;
}

/**
 * The campaign detail page's action bar. Every state-changing action here
 * requires an explicit click — approving and sending are always separate,
 * deliberate steps (see the Phase 10 spec's rule against sending on
 * creation or approval alone).
 */
export function CampaignActions({
  campaignId,
  status,
  recipientCount,
}: {
  campaignId: string;
  status: CampaignStatus;
  recipientCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingSend, setConfirmingSend] = React.useState(false);

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    const result = await approveCampaign(campaignId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleCancel = async () => {
    setBusy(true);
    setError(null);
    const result = await cancelCampaign(campaignId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleSend = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const json = (await response.json()) as SendResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "The campaign couldn't be sent.");
        setBusy(false);
        return;
      }
      setConfirmingSend(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("The campaign couldn't be sent. Please try again.");
      setBusy(false);
    }
  };

  const canCancel = status === "draft" || status === "review" || status === "approved";

  return (
    <div className="space-y-2">
      <InlineError message={error} />
      <div className="flex flex-wrap gap-2">
        {status === "review" && (
          <Button size="sm" onClick={handleApprove} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Approve campaign
          </Button>
        )}
        {status === "approved" && (
          <Button size="sm" onClick={() => setConfirmingSend(true)} disabled={busy}>
            <MessageCircle className="h-3.5 w-3.5" />
            Send campaign
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="secondary" onClick={handleCancel} disabled={busy}>
            <Ban className="h-3.5 w-3.5" />
            Cancel campaign
          </Button>
        )}
      </div>

      <Modal
        open={confirmingSend}
        onClose={() => !busy && setConfirmingSend(false)}
        title={`Send this campaign to ${recipientCount} customer${recipientCount === 1 ? "" : "s"}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You are about to send this message to {recipientCount} customer{recipientCount === 1 ? "" : "s"} on
            WhatsApp. Each message is sent individually and tracked — this can&apos;t be undone once it starts.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmingSend(false)} disabled={busy}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageCircle className="h-3.5 w-3.5" />
                  Send to {recipientCount} customers
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
