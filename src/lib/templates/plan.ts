/**
 * Milestone 2 — how a WhatsApp message actually goes out.
 *
 *   1. Inside the 24-hour customer service window (the customer messaged
 *      us within the last 24h) the reviewed free-form text is sent as is.
 *   2. Otherwise WhatsApp only accepts an APPROVED template. We pick the
 *      template for the message's purpose, in the business's language
 *      (falling back to English), and fill its variables from real data.
 *      Free text (an owner's or AI's wording) may only fill a template's
 *      `offer_text` slot — never replace the approved body.
 *   3. Parlour "discreet" mode: reminders use the discreet template (no
 *      service slot), and a free-form reminder that names a service is
 *      refused rather than sent.
 *
 * Every send path (manual send, campaigns, automations, test sends) goes
 * through `planWhatsAppSend`. Pure (no Supabase import), unit-tested in
 * scripts/send-plan-tests.ts.
 */

import { META_LANGUAGE_CODE, TEMPLATE_KEY_LABELS, type TemplateKey, type TemplateLanguage, type TemplateVariable } from "./catalog";
import { buildTemplateParameters, renderTemplateBody, sanitizeTemplateParameter, type TemplateValues } from "./render";
import type { MessageTemplateRow } from "@/types/database";

/** WhatsApp's customer service window is 24h after the customer's last
 * message. We stop free-form 15 minutes early so a message composed at
 * 23h59m doesn't get rejected by the time it reaches Meta. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SERVICE_WINDOW_SAFETY_MS = 15 * 60 * 1000;

export function isInsideServiceWindow(lastInboundAt: string | null | undefined, now: Date): boolean {
  if (!lastInboundAt) return false;
  const at = new Date(lastInboundAt).getTime();
  if (Number.isNaN(at) || at > now.getTime() + 60_000) return false;
  return now.getTime() - at < SERVICE_WINDOW_MS - SERVICE_WINDOW_SAFETY_MS;
}

/** True when `text` names one of `services` (case-insensitive, whole
 * words). Used to keep discreet-mode reminders from naming the service. */
export function mentionsService(text: string, services: (string | null | undefined)[]): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  for (const service of services) {
    const needle = (service ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (needle.length >= 3 && haystack.includes(` ${needle} `)) return service as string;
  }
  return null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces any of `services` named in `text` (whole words, any case) with
 * a neutral word — for discreet mode, before text reaches the AI and on
 * whatever comes back. */
export function redactServiceNames(text: string, services: (string | null | undefined)[], replacement = "visit"): string {
  let out = text;
  const names = services
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "giu"), `$1${replacement}`);
  }
  return out;
}

export type PlannerTemplate = Pick<
  MessageTemplateRow,
  "key" | "language" | "variant" | "name" | "meta_language_code" | "body" | "variables" | "status"
>;

export interface PlanInput {
  now: Date;
  /** When the recipient last messaged this business (null = never). */
  lastInboundAt: string | null;
  purpose: TemplateKey;
  /** The reviewed free-form text (owner's or AI's), if any. */
  freeformText?: string | null;
  language: TemplateLanguage;
  discreet: boolean;
  templates: PlannerTemplate[];
  /** Real values for template variables (never invented). */
  values: TemplateValues;
  /** Services this customer has had — for the discreet-mode check. */
  serviceNames?: (string | null | undefined)[];
  /** Force a template even inside the window (e.g. bills, digests). */
  forceTemplate?: boolean;
}

export type SendPlan =
  | { ok: true; mode: "freeform"; text: string }
  | {
      ok: true;
      mode: "template";
      templateName: string;
      languageCode: string;
      templateLanguage: TemplateLanguage;
      parameters: string[];
      /** Exactly what the customer will see — for previews and history. */
      renderedText: string;
      /** True when the business's language wasn't approved and English was used. */
      usedFallbackLanguage: boolean;
      /** True when free text was supplied but this template has no slot for it. */
      ignoredFreeformText: boolean;
    }
  | { ok: false; error: string; code: "discreet_service_named" | "no_approved_template" | "missing_variable" | "empty_message" };

const VARIABLE_LABELS: Record<TemplateVariable, string> = {
  customer_first_name: "customer's name",
  business_name: "business name",
  service: "service",
  offer_text: "offer text",
  bill_items: "bill items",
  bill_total: "bill total",
  bill_date: "bill date",
  owner_first_name: "owner's name",
  due_count: "number of customers due",
  estimated_amount: "estimated amount",
};

export function planWhatsAppSend(input: PlanInput): SendPlan {
  const freeform = (input.freeformText ?? "").trim();
  const isReminder = input.purpose === "return_reminder";
  const inWindow = isInsideServiceWindow(input.lastInboundAt, input.now);

  if (input.discreet && isReminder && freeform && inWindow) {
    const named = mentionsService(freeform, input.serviceNames ?? []);
    if (named) {
      return {
        ok: false,
        code: "discreet_service_named",
        error: `Discreet mode is on, so reminders can't name the service ("${named}"). Remove it from the message and try again.`,
      };
    }
  }

  if (inWindow && !input.forceTemplate) {
    if (!freeform) return { ok: false, code: "empty_message", error: "Write a message first." };
    return { ok: true, mode: "freeform", text: freeform };
  }

  const variant = input.discreet && isReminder ? "discreet" : "standard";
  const approved = (language: TemplateLanguage) =>
    input.templates.find(
      (t) => t.key === input.purpose && t.variant === variant && t.language === language && t.status === "approved"
    );
  const preferred = approved(input.language);
  const template = preferred ?? approved("en");
  if (!template) {
    const label = TEMPLATE_KEY_LABELS[input.purpose];
    return {
      ok: false,
      code: "no_approved_template",
      error:
        `This customer hasn't messaged you in the last 24 hours, so WhatsApp only allows an approved template — ` +
        `and the "${label}${variant === "discreet" ? " (discreet)" : ""}" template isn't approved yet. ` +
        `Approve it in Settings → WhatsApp templates.`,
    };
  }

  const variables = template.variables as TemplateVariable[];
  const values: TemplateValues = { ...input.values };
  if (variables.includes("offer_text") && !values.offer_text && freeform) {
    values.offer_text = sanitizeTemplateParameter(freeform);
  }
  if (variant === "discreet") delete values.service; // never sent, even by mistake

  const built = buildTemplateParameters(variables, values);
  if (!built.ok) {
    return {
      ok: false,
      code: "missing_variable",
      error: `Can't fill the "${TEMPLATE_KEY_LABELS[input.purpose]}" template: missing ${built.missing.map((v) => VARIABLE_LABELS[v]).join(", ")}.`,
    };
  }

  return {
    ok: true,
    mode: "template",
    templateName: template.name,
    languageCode: template.meta_language_code || META_LANGUAGE_CODE[template.language],
    templateLanguage: template.language,
    parameters: built.parameters,
    renderedText: renderTemplateBody(template.body, built.parameters),
    usedFallbackLanguage: !preferred,
    ignoredFreeformText: Boolean(freeform) && !variables.includes("offer_text"),
  };
}

/** The text stored in message history / shown in previews. */
export function planText(plan: Extract<SendPlan, { ok: true }>): string {
  return plan.mode === "freeform" ? plan.text : plan.renderedText;
}

export interface SendPlanPreview {
  mode: "freeform" | "template";
  /** Exactly what the customer will receive. */
  text: string;
  /** Plain-language note for the owner explaining what's happening. */
  note: string | null;
}

/** Owner-facing summary of a plan, for the "Send this message?" dialog. */
export function describePlan(plan: Extract<SendPlan, { ok: true }>): SendPlanPreview {
  if (plan.mode === "freeform") {
    return { mode: "freeform", text: plan.text, note: "They messaged you in the last 24 hours, so your message is sent as written." };
  }
  const notes = ["They haven't messaged you in the last 24 hours, so WhatsApp requires your approved template."];
  if (plan.ignoredFreeformText) notes.push("Your written message isn't used — the template's fixed wording is sent instead.");
  if (plan.usedFallbackLanguage) notes.push("Your chosen language isn't approved yet, so the English template is used.");
  return { mode: "template", text: plan.renderedText, note: notes.join(" ") };
}
