/**
 * Milestone 1 — WhatsApp consent + STOP opt-out rules. Run with `npm test`.
 */
import { canMessageCustomer, checkCustomerConsent, parseOptKeyword } from "@/lib/consent";
import { hasSufficientConsent } from "@/lib/automations/eligibility";
import { isEligibleToday } from "@/lib/recommendations/filters";
import type { AutomationCandidate } from "@/lib/automations/types";
import type { LeadRow } from "@/types/database";
import type { Opportunity } from "@/lib/opportunities/types";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// Who can be messaged.
eq(canMessageCustomer({ whatsapp_consent: true, opted_out_at: null }), true, "consented, not opted out -> allowed");
eq(canMessageCustomer({ whatsapp_consent: false, opted_out_at: null }), false, "no consent -> blocked");
eq(canMessageCustomer({}), false, "unknown consent fails closed");
eq(canMessageCustomer({ whatsapp_consent: true, opted_out_at: "2026-11-01T00:00:00Z" }), false, "opt-out beats consent");
const blocked = checkCustomerConsent({ whatsapp_consent: true, opted_out_at: "2026-11-01T00:00:00Z" });
eq(blocked.allowed ? null : blocked.reason, "opted_out", "opt-out reason reported");

// Keywords: only a message that IS the keyword counts.
for (const t of ["STOP", "stop", " Stop. ", "STOP!", "Unsubscribe", "STOP ALL", "opt out", "बंद", "बंद करो", "Band karo"]) {
  eq(parseOptKeyword(t), "opt_out", `"${t}" opts out`);
}
for (const t of ["START", "start", "Unstop", "SUBSCRIBE"]) {
  eq(parseOptKeyword(t), "opt_in", `"${t}" opts in`);
}
for (const t of ["", null, "please don't stop the offers", "stop by tomorrow?", "Can I book for Sunday", "stopped", "startup"]) {
  eq(parseOptKeyword(t), null, `"${t}" is an ordinary message`);
}

// Automations: customer candidates need consent; missing data fails closed.
const base: AutomationCandidate = {
  entityEventKey: "c1:due_to_return",
  customerId: "c1",
  triggeredAt: new Date(),
  templateContext: { customerName: "Asha" },
  phone: "+919876543210",
};
eq(hasSufficientConsent(null, { ...base, customerConsent: { whatsapp_consent: true, opted_out_at: null } }).eligible, true, "automation: consented customer eligible");
const noConsent = hasSufficientConsent(null, { ...base, customerConsent: { whatsapp_consent: false, opted_out_at: null } });
eq(noConsent.eligible ? null : noConsent.reason, "no_consent", "automation: non-consented customer skipped");
const optedOut = hasSufficientConsent(null, { ...base, customerConsent: { whatsapp_consent: true, opted_out_at: "2026-11-01T00:00:00Z" } });
eq(optedOut.eligible ? null : optedOut.reason, "opted_out", "automation: opted-out customer skipped");
const missing = hasSufficientConsent(null, base);
eq(missing.eligible, false, "automation: customer candidate without consent data fails closed");
const lead = { consent_status: "given", opted_out_at: "2026-11-01T00:00:00Z" } as unknown as LeadRow;
const leadOut = hasSufficientConsent(lead, { ...base, customerId: undefined, leadId: "l1" });
eq(leadOut.eligible ? null : leadOut.reason, "opted_out", "automation: lead who replied STOP is skipped");

// Recommendations never suggest messaging someone who can't be messaged.
const opp = { customerPhone: "+919876543210", customerCanMessage: false } as unknown as Opportunity;
const ctx = { lastQualifyingMessageAt: null, hasUnansweredReply: false } as never;
eq(isEligibleToday(opp, ctx), false, "recommendation hidden for opted-out/non-consented customer");
eq(isEligibleToday({ ...opp, customerCanMessage: true }, ctx), true, "recommendation shown for consented customer");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
