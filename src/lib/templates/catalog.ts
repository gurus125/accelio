/**
 * Milestone 2 — the default WhatsApp message templates every business gets.
 *
 * WhatsApp only lets a business start a conversation (or message someone
 * whose last message was more than 24 hours ago) with a template Meta has
 * approved. Inside that 24-hour window free-form text is fine. See
 * src/lib/templates/plan.ts for the decision.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the seeded templates.
 * supabase/migrations/0020_m2_message_templates.sql contains the SQL
 * generated from it (src/lib/templates/seed-sql.ts); scripts/templates-tests.ts
 * fails if the two drift apart and prints the SQL to paste in.
 *
 * Rules every body follows (Meta's template guidelines):
 *   - variables are {{1}}, {{2}}, ... numbered in the order they appear;
 *   - a body never starts or ends with a variable;
 *   - marketing bodies tell people how to stop messages (STOP).
 *
 * Pure (no Supabase import).
 */

export const TEMPLATE_KEYS = [
  "return_reminder",
  "offer",
  "review_request",
  "whatsapp_bill",
  "owner_daily_digest",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LANGUAGES = ["en", "hi", "hinglish"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export const TEMPLATE_LANGUAGE_LABELS: Record<TemplateLanguage, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  hinglish: "Hinglish",
};

/** Meta has no "Hinglish" language — Hinglish templates are registered as
 * English ("en") under their own template name. */
export const META_LANGUAGE_CODE: Record<TemplateLanguage, string> = {
  en: "en",
  hi: "hi",
  hinglish: "en",
};

export type TemplateVariant = "standard" | "discreet";
export type TemplateCategory = "marketing" | "utility";
export type TemplateStatus = "draft" | "submitted" | "approved" | "rejected" | "paused";

/** Every value a template body can ask for. Filled from real records only
 * (src/lib/templates/render.ts); `offer_text` is the ONE slot free text
 * (an owner's or AI's wording) may go into. */
export const TEMPLATE_VARIABLES = [
  "customer_first_name",
  "business_name",
  "service",
  "offer_text",
  "bill_items",
  "bill_total",
  "bill_date",
  "owner_first_name",
  "due_count",
  "estimated_amount",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** Example values Meta requires when a template is submitted for review. */
export const VARIABLE_EXAMPLES: Record<TemplateVariable, string> = {
  customer_first_name: "Priya",
  business_name: "Style Studio",
  service: "haircut",
  offer_text: "20% off on hair spa this week",
  bill_items: "Haircut ₹300, Beard trim ₹100",
  bill_total: "400",
  bill_date: "26 Nov 2026",
  owner_first_name: "Ravi",
  due_count: "12",
  estimated_amount: "4,800",
};

export interface TemplateDefinition {
  key: TemplateKey;
  language: TemplateLanguage;
  variant: TemplateVariant;
  /** Name registered with Meta (lowercase, underscores). */
  name: string;
  category: TemplateCategory;
  body: string;
  /** variables[i] fills {{i+1}}. */
  variables: TemplateVariable[];
}

export function templateName(key: TemplateKey, language: TemplateLanguage, variant: TemplateVariant): string {
  return ["accelio", key, variant === "discreet" ? "discreet" : null, language === "hinglish" ? "hinglish" : null, "v1"]
    .filter(Boolean)
    .join("_");
}

type Body = { body: string; variables: TemplateVariable[] };
type Bodies = Record<TemplateLanguage, Body>;

const STOP_EN = "Reply STOP to stop these messages.";
const STOP_HI = "मैसेज बंद करने के लिए STOP भेजें।";
const STOP_HINGLISH = "Messages band karne ke liye STOP bhejein.";

const RETURN_REMINDER: Bodies = {
  en: {
    body: `Hi {{1}}, it's been a while since your last {{2}} at {{3}}. Reply to this message to book your next visit. ${STOP_EN}`,
    variables: ["customer_first_name", "service", "business_name"],
  },
  hi: {
    body: `नमस्ते {{1}}, {{2}} पर आपकी पिछली {{3}} को काफ़ी समय हो गया है। अगली विज़िट बुक करने के लिए इस मैसेज का जवाब दें। ${STOP_HI}`,
    variables: ["customer_first_name", "business_name", "service"],
  },
  hinglish: {
    body: `Hi {{1}}, aapka last {{2}} {{3}} par kaafi din pehle hua tha. Agla visit book karne ke liye is message ka reply karein. ${STOP_HINGLISH}`,
    variables: ["customer_first_name", "service", "business_name"],
  },
};

/** Parlour "discreet" mode: the reminder never names the service. */
const RETURN_REMINDER_DISCREET: Bodies = {
  en: {
    body: `Hi {{1}}, it's time for your next visit at {{2}}. Reply to this message to book a slot. ${STOP_EN}`,
    variables: ["customer_first_name", "business_name"],
  },
  hi: {
    body: `नमस्ते {{1}}, {{2}} पर आपकी अगली विज़िट का समय हो गया है। स्लॉट बुक करने के लिए इस मैसेज का जवाब दें। ${STOP_HI}`,
    variables: ["customer_first_name", "business_name"],
  },
  hinglish: {
    body: `Hi {{1}}, {{2}} par aapke agle visit ka time ho gaya hai. Slot book karne ke liye is message ka reply karein. ${STOP_HINGLISH}`,
    variables: ["customer_first_name", "business_name"],
  },
};

const OFFER: Bodies = {
  en: {
    body: `Hi {{1}}, {{2}} has a special offer for you: {{3}}. Reply to this message to book. ${STOP_EN}`,
    variables: ["customer_first_name", "business_name", "offer_text"],
  },
  hi: {
    body: `नमस्ते {{1}}, {{2}} की ओर से आपके लिए खास ऑफ़र: {{3}}। बुक करने के लिए इस मैसेज का जवाब दें। ${STOP_HI}`,
    variables: ["customer_first_name", "business_name", "offer_text"],
  },
  hinglish: {
    body: `Hi {{1}}, {{2}} ki taraf se aapke liye special offer: {{3}}. Book karne ke liye is message ka reply karein. ${STOP_HINGLISH}`,
    variables: ["customer_first_name", "business_name", "offer_text"],
  },
};

const REVIEW_REQUEST: Bodies = {
  en: {
    body: "Hi {{1}}, thank you for visiting {{2}}. How was your experience? Reply with a rating from 1 to 5. Your feedback helps us serve you better.",
    variables: ["customer_first_name", "business_name"],
  },
  hi: {
    body: "नमस्ते {{1}}, {{2}} आने के लिए धन्यवाद। आपका अनुभव कैसा रहा? 1 से 5 के बीच रेटिंग भेजें। आपकी राय से हमें बेहतर सेवा देने में मदद मिलती है।",
    variables: ["customer_first_name", "business_name"],
  },
  hinglish: {
    body: "Hi {{1}}, {{2}} aane ke liye shukriya! Aapka experience kaisa raha? 1 se 5 ke beech rating bhejein. Aapke feedback se hum aur behtar service de paayenge.",
    variables: ["customer_first_name", "business_name"],
  },
};

const WHATSAPP_BILL: Bodies = {
  en: {
    body: "Hi {{1}}, thank you for visiting {{2}}. Your bill: {{3}}. Total: ₹{{4}} on {{5}}. Please keep this message for your records.",
    variables: ["customer_first_name", "business_name", "bill_items", "bill_total", "bill_date"],
  },
  hi: {
    body: "नमस्ते {{1}}, {{2}} आने के लिए धन्यवाद। आपका बिल: {{3}}। कुल: ₹{{4}}, तारीख़ {{5}}। कृपया यह मैसेज अपने रिकॉर्ड के लिए रखें।",
    variables: ["customer_first_name", "business_name", "bill_items", "bill_total", "bill_date"],
  },
  hinglish: {
    body: "Hi {{1}}, {{2}} aane ke liye shukriya. Aapka bill: {{3}}. Total: ₹{{4}}, date {{5}}. Ye message apne record ke liye rakh lijiye.",
    variables: ["customer_first_name", "business_name", "bill_items", "bill_total", "bill_date"],
  },
};

const OWNER_DAILY_DIGEST: Bodies = {
  en: {
    body: "Good morning {{1}}. {{2}} customers of {{3}} are due to return today, worth about ₹{{4}}. Open Accelio to review and send their reminders.",
    variables: ["owner_first_name", "due_count", "business_name", "estimated_amount"],
  },
  hi: {
    body: "सुप्रभात {{1}}। आज {{2}} के {{3}} ग्राहक दोबारा आने वाले हैं, लगभग ₹{{4}} के। रिमाइंडर देखने और भेजने के लिए Accelio खोलें।",
    variables: ["owner_first_name", "business_name", "due_count", "estimated_amount"],
  },
  hinglish: {
    body: "Good morning {{1}}. Aaj {{2}} ke {{3}} customers wapas aane wale hain, lagbhag ₹{{4}} ke. Reminders dekhne aur bhejne ke liye Accelio kholiye.",
    variables: ["owner_first_name", "business_name", "due_count", "estimated_amount"],
  },
};

const GROUPS: { key: TemplateKey; variant: TemplateVariant; category: TemplateCategory; bodies: Bodies }[] = [
  { key: "return_reminder", variant: "standard", category: "marketing", bodies: RETURN_REMINDER },
  { key: "return_reminder", variant: "discreet", category: "marketing", bodies: RETURN_REMINDER_DISCREET },
  { key: "offer", variant: "standard", category: "marketing", bodies: OFFER },
  { key: "review_request", variant: "standard", category: "marketing", bodies: REVIEW_REQUEST },
  { key: "whatsapp_bill", variant: "standard", category: "utility", bodies: WHATSAPP_BILL },
  { key: "owner_daily_digest", variant: "standard", category: "utility", bodies: OWNER_DAILY_DIGEST },
];

export const DEFAULT_TEMPLATES: TemplateDefinition[] = GROUPS.flatMap((group) =>
  TEMPLATE_LANGUAGES.map((language) => ({
    key: group.key,
    language,
    variant: group.variant,
    name: templateName(group.key, language, group.variant),
    category: group.category,
    body: group.bodies[language].body,
    variables: group.bodies[language].variables,
  }))
);

export const TEMPLATE_KEY_LABELS: Record<TemplateKey, string> = {
  return_reminder: "Return reminder",
  offer: "Offer",
  review_request: "Feedback / review request",
  whatsapp_bill: "WhatsApp bill",
  owner_daily_digest: "Owner daily digest",
};
