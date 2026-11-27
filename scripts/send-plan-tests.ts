/**
 * Milestone 2 — free-form vs approved template, AI/owner text only in
 * variable slots, discreet mode, languages. Run with `npm test`.
 */
import { DEFAULT_TEMPLATES } from "@/lib/templates/catalog";
import { describePlan, isInsideServiceWindow, mentionsService, planWhatsAppSend, redactServiceNames, type PlanInput, type PlannerTemplate } from "@/lib/templates/plan";
import { buildUserPrompt } from "@/lib/ai/prompts";
import { purposeForAutomationType, purposeForCampaignType, purposeForOpportunityType } from "@/lib/templates/purpose";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date("2026-11-27T06:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const all = (status: PlannerTemplate["status"]): PlannerTemplate[] =>
  DEFAULT_TEMPLATES.map((t) => ({ ...t, meta_language_code: t.language === "hi" ? "hi" : "en", status }));
const approved = all("approved");

const base: PlanInput = {
  now: NOW,
  lastInboundAt: null,
  purpose: "return_reminder",
  freeformText: "Hi Priya! Your haircut is due — come in this week?",
  language: "en",
  discreet: false,
  templates: approved,
  values: { customer_first_name: "Priya", business_name: "Style Studio", service: "haircut" },
  serviceNames: ["Haircut"],
};

// 24h window.
eq(isInsideServiceWindow(hoursAgo(2), NOW), true, "2h ago: inside window");
eq(isInsideServiceWindow(hoursAgo(23.9), NOW), false, "23h54m ago: outside (15-min safety margin)");
eq(isInsideServiceWindow(hoursAgo(25), NOW), false, "25h ago: outside");
eq(isInsideServiceWindow(null, NOW), false, "never messaged: outside");

// Inside window -> free-form exactly as reviewed.
const inside = planWhatsAppSend({ ...base, lastInboundAt: hoursAgo(1) });
eq(inside.ok && inside.mode === "freeform" ? inside.text : null, base.freeformText, "inside window: free-form text sent as written");

// Outside window -> approved template, AI text NOT used for a reminder.
const outside = planWhatsAppSend(base);
eq(outside.ok && outside.mode, "template", "outside window: template");
if (outside.ok && outside.mode === "template") {
  eq(outside.templateName, "accelio_return_reminder_v1", "return reminder template chosen");
  eq(outside.parameters, ["Priya", "haircut", "Style Studio"], "variables mapped from real data");
  eq(outside.ignoredFreeformText, true, "AI/owner text is not sent — the approved body is");
  eq(outside.renderedText.includes("Your haircut is due"), false, "rendered text has no AI wording");
}

// Offer template: free text fills ONLY the offer slot.
const offer = planWhatsAppSend({ ...base, purpose: "offer", freeformText: "20% off hair spa\nthis week only" });
eq(
  offer.ok && offer.mode === "template" ? offer.parameters : null,
  ["Priya", "Style Studio", "20% off hair spa this week only"],
  "offer: free text goes into {{3}} only, sanitised for Meta"
);
eq(
  offer.ok && offer.mode === "template" ? offer.renderedText.startsWith("Hi Priya, Style Studio has a special offer for you: 20% off") : null,
  true,
  "offer body stays the approved wording around the slot"
);

// Nothing approved -> clear error, nothing sent.
const none = planWhatsAppSend({ ...base, templates: all("draft") });
eq(none.ok ? null : none.code, "no_approved_template", "draft templates can't be used outside the window");
const noneInside = planWhatsAppSend({ ...base, templates: all("draft"), lastInboundAt: hoursAgo(3) });
eq(noneInside.ok && noneInside.mode, "freeform", "...but free-form still works inside the window");
const pending = planWhatsAppSend({ ...base, templates: all("submitted") });
eq(pending.ok, false, "submitted (not yet approved) templates are not used");

// Languages.
const hindi = planWhatsAppSend({ ...base, language: "hi" });
eq(hindi.ok && hindi.mode === "template" ? [hindi.languageCode, hindi.templateLanguage, hindi.usedFallbackLanguage] : null, ["hi", "hi", false], "Hindi template when Hindi is approved");
const hinglish = planWhatsAppSend({ ...base, language: "hinglish" });
eq(hinglish.ok && hinglish.mode === "template" ? [hinglish.templateName, hinglish.languageCode] : null, ["accelio_return_reminder_hinglish_v1", "en"], "Hinglish = its own template name, Meta code en");
const onlyEnglish = approved.map((t) => (t.language === "en" ? t : { ...t, status: "draft" as const }));
const fallback = planWhatsAppSend({ ...base, language: "hi", templates: onlyEnglish });
eq(fallback.ok && fallback.mode === "template" ? [fallback.templateLanguage, fallback.usedFallbackLanguage] : null, ["en", true], "falls back to approved English");

// Discreet mode.
const discreet = planWhatsAppSend({ ...base, discreet: true });
eq(discreet.ok && discreet.mode === "template" ? discreet.templateName : null, "accelio_return_reminder_discreet_v1", "discreet: discreet template");
eq(discreet.ok && discreet.mode === "template" ? discreet.renderedText.toLowerCase().includes("haircut") : null, false, "discreet: service never appears");
const discreetFree = planWhatsAppSend({ ...base, discreet: true, lastInboundAt: hoursAgo(1), freeformText: "Your waxing is due!", serviceNames: ["Waxing"] });
eq(discreetFree.ok ? null : discreetFree.code, "discreet_service_named", "discreet: free-form reminder naming the service is refused");
const discreetOk = planWhatsAppSend({ ...base, discreet: true, lastInboundAt: hoursAgo(1), freeformText: "It's time for your next visit!", serviceNames: ["Waxing"] });
eq(discreetOk.ok && discreetOk.mode, "freeform", "discreet: free-form reminder without the service is fine");
const discreetNoFallback = planWhatsAppSend({ ...base, discreet: true, templates: approved.map((t) => (t.variant === "discreet" ? { ...t, status: "draft" as const } : t)) });
eq(discreetNoFallback.ok, false, "discreet never falls back to the standard reminder that names the service");
const discreetOffer = planWhatsAppSend({ ...base, discreet: true, purpose: "offer", freeformText: "Waxing combo offer" });
eq(discreetOffer.ok, true, "discreet only restricts reminders, not offers the owner writes");
eq(mentionsService("Time for your eyebrow threading", ["Threading"]), "Threading", "service match is case-insensitive whole word");
eq(mentionsService("Come back soon", ["Threading", "Wax"]), null, "no service named");
eq(mentionsService("waxed", ["wax"]), null, "partial words don't match");

// Discreet AI drafts: service names redacted before and after the AI.
eq(redactServiceNames("Usually returns for Waxing every 25 days", ["waxing"]), "Usually returns for visit every 25 days", "redacts the service from the engine's reason");
eq(redactServiceNames("Eyebrow threading or threading?", ["Threading", "Eyebrow threading"]), "visit or visit?", "longest names redacted first");
eq(redactServiceNames("Come back soon!", ["Facial"]), "Come back soon!", "nothing to redact");
const promptArgs = {
  business: { name: "Glow", businessType: "Parlour", city: null, discreet: true },
  customer: { firstName: "Asha", visitCount: 3, daysSinceLastVisit: 30, averageReturnDays: null, totalSpent: 0 },
  opportunity: { type: "due_to_return" as const, recommendedAction: "Send a reminder", reason: "Due" },
  tone: "friendly" as const,
  language: "hindi" as const,
};
eq(buildUserPrompt(promptArgs).includes("discreet mode"), true, "discreet businesses get the no-service instruction");
eq(buildUserPrompt({ ...promptArgs, business: { ...promptArgs.business, discreet: false } }).includes("discreet mode"), false, "other businesses don't");
eq(buildUserPrompt(promptArgs).includes("Devanagari"), true, "Hindi drafts are requested in Devanagari");

// Missing values are never sent blank.
const missing = planWhatsAppSend({ ...base, values: { business_name: "X" } });
eq(missing.ok ? null : missing.code, "missing_variable", "missing variable blocks the send");
const forced = planWhatsAppSend({ ...base, lastInboundAt: hoursAgo(1), forceTemplate: true });
eq(forced.ok && forced.mode, "template", "forceTemplate uses a template even inside the window");

// Owner-facing preview.
eq(outside.ok ? describePlan(outside).note?.includes("approved template") : null, true, "preview explains why a template is used");

// Purposes.
eq(purposeForOpportunityType("due_to_return"), "return_reminder", "due -> reminder");
eq(purposeForOpportunityType("follow_up"), "review_request", "follow-up -> review request");
eq(purposeForOpportunityType(null), "offer", "no opportunity -> offer");
eq(purposeForCampaignType("custom"), "offer", "custom campaign -> offer");
eq(purposeForCampaignType("inactive_customers"), "return_reminder", "inactive campaign -> reminder");
eq(purposeForAutomationType("recurring_schedule"), "return_reminder", "recurring -> reminder");
eq(purposeForAutomationType("new_lead_followup"), "offer", "lead follow-up -> offer");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
