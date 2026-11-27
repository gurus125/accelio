/**
 * Dispatches a planned WhatsApp message (see src/lib/templates/plan.ts for
 * how free-form vs template is decided). Kept separate from the callers so
 * every send path dispatches the same way.
 */

import { sendWhatsAppTemplate, sendWhatsAppText } from "./client";
import type { MetaSendResult } from "./types";
import type { SendPlan } from "@/lib/templates/plan";

export type ReadySendPlan = Extract<SendPlan, { ok: true }>;

/** What gets recorded on the `messages` row for this plan. */
export function messageRecordFields(plan: ReadySendPlan): { messageType: "template" | "freeform"; templateName: string | null } {
  return plan.mode === "template"
    ? { messageType: "template", templateName: plan.templateName }
    : { messageType: "freeform", templateName: null };
}

export async function dispatchWhatsAppMessage(params: {
  phoneNumberId: string;
  to: string;
  plan: ReadySendPlan;
}): Promise<MetaSendResult> {
  if (params.plan.mode === "template") {
    return sendWhatsAppTemplate(params.phoneNumberId, {
      to: params.to,
      templateName: params.plan.templateName,
      languageCode: params.plan.languageCode,
      bodyParameters: params.plan.parameters,
    });
  }
  return sendWhatsAppText(params.phoneNumberId, { to: params.to, body: params.plan.text });
}
