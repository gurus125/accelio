/**
 * Milestone 2 — server-side glue: gathers what `planWhatsAppSend` needs for
 * one recipient (templates, last inbound message, services, business
 * settings) and returns the plan. Used by every send path so they can't
 * drift apart.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { planWhatsAppSend, type SendPlan } from "./plan";
import { firstName, type TemplateValues } from "./render";
import { getLastInboundAt, getLastVisitService, listMessageTemplates, listServiceNamesForCustomer } from "./queries";
import { TEMPLATE_LANGUAGES, type TemplateKey, type TemplateLanguage } from "./catalog";
import type { BusinessRow, MessageTemplateRow } from "@/types/database";

export function businessTemplateLanguage(business: Pick<BusinessRow, "whatsapp_language">): TemplateLanguage {
  const lang = business.whatsapp_language;
  return lang && (TEMPLATE_LANGUAGES as readonly string[]).includes(lang) ? lang : "en";
}

/** Greeting name when a lead left no name ("Hi there"). */
function fallbackName(language: TemplateLanguage): string {
  return language === "hi" ? "जी" : "there";
}

export interface PrepareSendParams {
  business: BusinessRow;
  recipient: { customerId?: string | null; leadId?: string | null; name: string | null };
  purpose: TemplateKey;
  freeformText?: string | null;
  /** Service to name in a (non-discreet) reminder; looked up when omitted. */
  service?: string | null;
  /** Extra real values (bill/digest fields). */
  extraValues?: TemplateValues;
  forceTemplate?: boolean;
  now?: Date;
  supabase?: SupabaseClient;
  /** Preloaded for batch sends (campaigns, automations). */
  templates?: MessageTemplateRow[];
  /** Preloaded; `undefined` means "look it up". */
  lastInboundAt?: string | null;
}

export async function prepareWhatsAppSend(params: PrepareSendParams): Promise<SendPlan> {
  const supabase = params.supabase ?? createClient();
  const now = params.now ?? new Date();
  const language = businessTemplateLanguage(params.business);
  const discreet = params.business.discreet_reminders === true;
  const customerId = params.recipient.customerId ?? null;

  const [templates, lastInboundAt] = await Promise.all([
    params.templates ?? listMessageTemplates(params.business.id, supabase),
    params.lastInboundAt !== undefined
      ? Promise.resolve(params.lastInboundAt)
      : getLastInboundAt(params.business.id, { customerId, leadId: params.recipient.leadId }, supabase),
  ]);

  let service = params.service ?? null;
  if (params.purpose === "return_reminder" && !discreet && !service && customerId) {
    service = await getLastVisitService(customerId, supabase);
  }
  const serviceNames =
    discreet && params.purpose === "return_reminder" && customerId
      ? [service, ...(await listServiceNamesForCustomer(customerId, supabase))]
      : [];

  return planWhatsAppSend({
    now,
    lastInboundAt,
    purpose: params.purpose,
    freeformText: params.freeformText,
    language,
    discreet,
    templates,
    serviceNames,
    forceTemplate: params.forceTemplate,
    values: {
      customer_first_name: firstName(params.recipient.name) || fallbackName(language),
      business_name: params.business.name,
      // "your last visit" reads naturally when the service isn't known.
      service: service ?? (language === "hi" ? "विज़िट" : "visit"),
      ...params.extraValues,
    },
  });
}
