/**
 * Phase 10 — sends one approved campaign's messages. Deliberately reuses
 * every piece of Phase 8/9 infrastructure (message records, the Meta
 * dispatch call, duplicate-send protection, status tracking) rather than
 * inventing a parallel send/tracking system — a campaign send is just many
 * individual, per-recipient `/api/whatsapp/send`-equivalent sends, run
 * server-side in one batch instead of one click each.
 *
 * Runs synchronously within the server action's request — there is no
 * background job queue in this deployment. For very large recipient lists
 * this risks the request's own timeout; see the batching/concurrency
 * limit below and the Phase 10 report for the documented scaling
 * limitation (per the spec's instruction to document rather than invent
 * an unreliable queue).
 */

import { createClient } from "@/lib/supabase/server";
import type { BusinessRow } from "@/types/database";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";
import {
  getWhatsAppConnection,
  reserveWhatsAppMessage,
  markMessageSent,
  markMessageFailed,
} from "@/lib/whatsapp/queries";
import { decideSendMode, dispatchWhatsAppMessage } from "@/lib/whatsapp/send";
import { getRemainingWhatsAppMessageQuota, getWhatsAppReservationContext } from "@/lib/billing/limits";
import { listRecipientsWithCustomers } from "./queries";
import { personalizeMessage } from "./personalize";
import type { CampaignRow } from "./types";

/** How many recipients are sent concurrently at once — bounded so a large
 * campaign never fires an unbounded `Promise.all` at Meta's API (see the
 * Phase 10 spec's rate-safety rule). Sequential batches, not a queue. */
const SEND_CONCURRENCY = 3;

export async function sendCampaignMessages(
  business: BusinessRow,
  campaign: CampaignRow
): Promise<{ error?: string }> {
  if (!campaign.message_template) {
    return { error: "This campaign has no message." };
  }

  const connection = await getWhatsAppConnection(business.id);
  if (!isWhatsAppEnvConfigured || !connection || connection.connection_status !== "connected" || !connection.phone_number_id) {
    return { error: "WhatsApp isn't connected." };
  }

  const supabase = createClient();
  const allRecipients = await listRecipientsWithCustomers(campaign.id);
  const pending = allRecipients.filter((r) => r.status === "selected" || r.status === "ready");

  if (pending.length === 0) {
    return { error: "There are no pending recipients to send to." };
  }

  // Phase 16 — checked before any Meta call for this send. A campaign
  // send is an explicit, all-at-once action, so if the plan's WhatsApp
  // allowance is already used up, block the whole send with one clear
  // message rather than silently sending some and skipping the rest.
  // This is a fast pre-check only — the real, race-safe enforcement for
  // each individual recipient is the atomic reservation below (Phase 19).
  let whatsappQuotaRemaining = await getRemainingWhatsAppMessageQuota(business.id);
  if (whatsappQuotaRemaining <= 0) {
    return { error: "Your plan's WhatsApp message limit has been reached for this billing period. Upgrade your plan to send this campaign." };
  }
  const reservationContext = await getWhatsAppReservationContext(business.id);
  if (!reservationContext) {
    return { error: "Your business's billing couldn't be verified. Please contact support." };
  }

  await supabase
    .from("campaigns")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", campaign.id);

  const decision = decideSendMode();

  for (let i = 0; i < pending.length; i += SEND_CONCURRENCY) {
    const batch = pending.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(
      batch.map(async (recipient) => {
        // Ran out of quota partway through the campaign — leave the rest
        // as "skipped" (not "failed": nothing went wrong, there's simply
        // no allowance left) so they can be resent once the plan allows.
        // This local counter is an optimization (skip the round trip once
        // we already know we're empty) — the atomic reservation below is
        // what actually enforces the limit under concurrency, since
        // SEND_CONCURRENCY batches multiple recipients at once and this
        // in-memory count alone can't prevent them all reading "room" in
        // the same tick (Phase 19 finding).
        if (whatsappQuotaRemaining <= 0) {
          await supabase.from("campaign_recipients").update({ status: "skipped" }).eq("id", recipient.id);
          return;
        }

        // Milestone 1 — consent is re-checked at send time: a customer
        // may have replied STOP after being added to the audience.
        if (!recipient.customerCanMessage) {
          await supabase.from("campaign_recipients").update({ status: "skipped" }).eq("id", recipient.id);
          return;
        }

        const normalizedPhone = normalizePhoneForWhatsApp(recipient.customerPhone);
        if (!normalizedPhone) {
          await supabase.from("campaign_recipients").update({ status: "failed" }).eq("id", recipient.id);
          return;
        }

        const content = personalizeMessage(campaign.message_template as string, {
          customerName: recipient.customerName,
          businessName: business.name,
        });

        const reservation = await reserveWhatsAppMessage({
          businessId: business.id,
          customerId: recipient.customer_id,
          opportunityType: `campaign:${campaign.campaign_type}`,
          messageType: decision.messageType,
          templateName: decision.templateName,
          content,
          periodStart: reservationContext.periodStart,
          limit: reservationContext.limit,
        });
        if (!reservation) {
          await supabase.from("campaign_recipients").update({ status: "skipped" }).eq("id", recipient.id);
          whatsappQuotaRemaining = 0;
          return;
        }
        if (!reservation.isNewReservation) {
          await supabase
            .from("campaign_recipients")
            .update({ message_id: reservation.message.id, status: mapMessageStatusToRecipientStatus(reservation.message.status) })
            .eq("id", recipient.id);
          return;
        }

        const draft = reservation.message;
        await supabase.from("campaign_recipients").update({ message_id: draft.id, status: "ready" }).eq("id", recipient.id);

        const result = await dispatchWhatsAppMessage({
          phoneNumberId: connection.phone_number_id as string,
          to: normalizedPhone,
          content,
          customerFirstName: recipient.customerName.split(" ")[0] || recipient.customerName,
          businessName: business.name,
          decision,
        });

        if (!result.ok) {
          await markMessageFailed(draft.id, result.error);
          await supabase.from("campaign_recipients").update({ status: "failed" }).eq("id", recipient.id);
          return;
        }

        await markMessageSent(draft.id, result.providerMessageId);
        await supabase.from("campaign_recipients").update({ status: "sent" }).eq("id", recipient.id);
        whatsappQuotaRemaining -= 1;
      })
    );
  }

  await supabase
    .from("campaigns")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", campaign.id);

  return {};
}

function mapMessageStatusToRecipientStatus(status: string): "sent" | "delivered" | "read" | "failed" {
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "failed") return "failed";
  return "sent";
}
