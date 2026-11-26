/**
 * Decides HOW a message actually goes out — template vs. free-form — and
 * dispatches it. Kept separate from the API route so the decision logic is
 * independently readable and testable.
 *
 * V1 policy: if an approved template is configured (`WHATSAPP_TEMPLATE_NAME`),
 * always use it — filling only its approved variables (customer first name,
 * business name), never the AI-composed sentence, since an approved
 * template's body text is fixed by Meta and can't be replaced with
 * arbitrary content. Without a configured template, fall back to sending
 * the exact reviewed/edited message as free-form text, which Meta will
 * only actually deliver within an open customer-service window (or after
 * the customer has messaged the business) — outside that window Meta
 * itself rejects it, which `client.ts` maps to a friendly error.
 */

import { whatsappEnv } from "./config";
import { sendWhatsAppTemplate, sendWhatsAppText } from "./client";
import type { MetaSendResult, SendDecision } from "./types";

export function decideSendMode(): SendDecision {
  if (whatsappEnv.templateName) {
    return { messageType: "template", templateName: whatsappEnv.templateName };
  }
  return { messageType: "freeform", templateName: null };
}

export async function dispatchWhatsAppMessage(params: {
  phoneNumberId: string;
  to: string;
  content: string;
  customerFirstName: string;
  businessName: string;
  decision: SendDecision;
}): Promise<MetaSendResult> {
  if (params.decision.messageType === "template") {
    return sendWhatsAppTemplate(params.phoneNumberId, {
      to: params.to,
      templateName: params.decision.templateName,
      languageCode: whatsappEnv.templateLanguage,
      bodyParameters: [params.customerFirstName, params.businessName],
    });
  }

  return sendWhatsAppText(params.phoneNumberId, { to: params.to, body: params.content });
}
