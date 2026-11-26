/**
 * Phase 14 — automated tests for the pure, Supabase-free automation logic
 * (template substitution, plain-language labels, safety constants, and the
 * eligibility helpers that don't need a live database). Same pattern as
 * scripts/leads-tests.ts: no test framework is installed, so this is a
 * small, dependency-free assertion script. Run:
 *
 *   npx tsc -p tsconfig.automations-test.json
 *   node -r ./tsconfig-paths-boot.js .automations-test-build/scripts/automations-tests.js
 *
 * The Phase 14 spec's 27-item test list is covered as follows. Items whose
 * behavior is pure TypeScript are asserted directly, right here. Items that
 * depend on live Supabase state (RLS, real duplicate-execution protection
 * under the unique index, real send/skip/fail flows, real daily/customer
 * counts) are instead verified against the real project and documented in
 * the Phase 14 report's "Tests performed" section, exactly like every
 * prior phase's combined pattern:
 *
 *  1. Automation creation                  -> live DB check
 *  2. Activation                            -> live DB check + pure: missing-template guard (2a)
 *  3. Pause                                 -> live DB check
 *  4. Resume                                -> live DB check
 *  5. Archive                               -> live DB check
 *  6. New-lead-followup trigger             -> live DB check (candidate selection needs real leads)
 *  7. Due-for-return trigger                -> live DB check (reuses Phase 6 — see recommendations-tests.ts)
 *  8. Follow-up-reminder trigger            -> live DB check
 *  9. Service-reminder trigger              -> live DB check
 * 10. Consent eligibility                   -> pure: hasSufficientConsent (10a-10c)
 * 11. Missing phone                         -> pure: normalizePhoneForWhatsApp reuse (11a)
 * 12. Contact cooldown                      -> pure: AUTOMATION_CONTACT_COOLDOWN_DAYS reuse (12a)
 * 13. Per-customer limit                    -> pure: constant sanity (13a) + live DB check for the count path
 * 14. Business daily limit                  -> pure: constant sanity (14a) + live DB check for the count path
 * 15. Business hours                        -> pure: isWithinBusinessHours (15a-15c)
 * 16. Timezone                              -> pure: isWithinBusinessHours uses Asia/Kolkata explicitly (16a)
 * 17. Duplicate execution                   -> live DB check (unique partial index)
 * 18. WhatsApp failure                      -> live DB check (reuses Phase 8/9 error handling)
 * 19. Successful send                       -> live DB check
 * 20. Replied lead/customer skipped         -> pure: reuses Phase 12's isEligibleToday (20a — see recommendations-tests.ts)
 * 21. Recently returned customer skipped    -> live DB check (Phase 6 opportunity ceases to exist)
 * 22. Business isolation                    -> live DB check (RLS)
 * 23. Emergency pause                       -> pure: businessAutomationsPausedAt short-circuits eligibility (23a)
 * 24. Template variable substitution        -> pure: personalizeAutomationMessage (24a-24d)
 * 25. Missing variable fallback             -> pure: personalizeAutomationMessage (25a-25b)
 * 26. Automation analytics                  -> live DB check
 * 27. Automation run logging                -> live DB check
 */

import { personalizeAutomationMessage, hasOnlySupportedAutomationVariables } from "../src/lib/automations/template";
import {
  AUTOMATION_TYPE_LABELS,
  describeAutomationInPlainLanguage,
  describeDelayInPlainLanguage,
} from "../src/lib/automations/labels";
import {
  AUTOMATION_CONTACT_COOLDOWN_DAYS,
  MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY,
  MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS,
  ASSUMED_BUSINESS_TIMEZONE,
} from "../src/lib/automations/constants";
import { RECOMMENDATION_CONTACT_COOLDOWN_DAYS } from "../src/lib/recommendations/constants";
import { isWithinBusinessHours, hasDelayElapsed, hasSufficientConsent, checkCandidateEligibility } from "../src/lib/automations/eligibility";
import { normalizePhoneForWhatsApp } from "../src/lib/whatsapp/phone";
import type { AutomationCandidate, AutomationRow } from "../src/lib/automations/types";
import type { LeadRow } from "../src/types/database";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value: boolean, label: string) {
  assertEqual(value, true, label);
}

function makeAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "auto-1",
    business_id: overrides.business_id ?? "biz-1",
    name: overrides.name ?? "Test automation",
    description: overrides.description ?? null,
    automation_type: overrides.automation_type ?? "new_lead_followup",
    trigger_type: overrides.trigger_type ?? "new_lead_followup",
    action_type: overrides.action_type ?? "send_whatsapp",
    status: overrides.status ?? "active",
    delay_minutes: overrides.delay_minutes ?? 10,
    language: overrides.language ?? "english",
    tone: overrides.tone ?? "friendly",
    message_template: overrides.message_template ?? "Hi {{customer_name}}, from {{business_name}}!",
    created_by: overrides.created_by ?? "user-1",
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    last_run_at: overrides.last_run_at ?? null,
  };
}

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "lead-1",
    business_id: overrides.business_id ?? "biz-1",
    name: overrides.name ?? "Test Lead",
    phone: overrides.phone ?? "9876543210",
    phone_normalized: overrides.phone_normalized ?? "919876543210",
    email: overrides.email ?? null,
    source: overrides.source ?? "website",
    source_url: overrides.source_url ?? null,
    interest: overrides.interest ?? null,
    message: overrides.message ?? null,
    status: overrides.status ?? "new",
    consent_status: overrides.consent_status ?? "not_recorded",
    consent_text: overrides.consent_text ?? null,
    consent_given_at: overrides.consent_given_at ?? null,
    captured_at: overrides.captured_at ?? now,
    last_contacted_at: overrides.last_contacted_at ?? null,
    converted_at: overrides.converted_at ?? null,
    customer_id: overrides.customer_id ?? null,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
  };
}

function makeCandidate(overrides: Partial<AutomationCandidate> = {}): AutomationCandidate {
  return {
    entityEventKey: overrides.entityEventKey ?? "customer-1:due_to_return",
    customerId: overrides.customerId,
    leadId: overrides.leadId,
    triggeredAt: overrides.triggeredAt ?? new Date(),
    templateContext: overrides.templateContext ?? { customerName: "Priya" },
    phone: overrides.phone === undefined ? "9876543210" : overrides.phone,
  };
}

// ---------------------------------------------------------------------
// 24-25: Template variable substitution + missing-variable fallback.
// ---------------------------------------------------------------------

assertEqual(
  personalizeAutomationMessage("Hi {{customer_name}}, from {{business_name}}!", {
    businessName: "Aurelia Salon",
    customerName: "Priya Sharma",
  }),
  "Hi Priya, from Aurelia Salon!",
  "24a. customer_name resolves to first name, business_name resolves"
);

assertEqual(
  personalizeAutomationMessage("Hi {{lead_name}}, interested in {{interest}}?", {
    businessName: "Aurelia Salon",
    leadName: "Rahul Verma",
    interest: "Bridal package",
  }),
  "Hi Rahul, interested in Bridal package?",
  "24b. lead_name and interest resolve for a lead-based template"
);

assertEqual(
  personalizeAutomationMessage("Hello {{unknown_variable}}!", { businessName: "Aurelia Salon" }),
  "Hello !",
  "24c. An unsupported {{...}} variable is stripped to empty string, never leaked literally"
);

assertEqual(
  personalizeAutomationMessage("Hi {{customer_name}}!", { businessName: "Aurelia Salon" }),
  "Hi there!",
  "25a. Missing customer_name falls back to a safe default, never leaks {{customer_name}} literally"
);

assertEqual(
  personalizeAutomationMessage("Interested in {{interest}}?", { businessName: "Aurelia Salon", customerName: "Priya" }),
  "Interested in ?",
  "25b. Missing interest falls back to empty string, not a guess"
);

assertTrue(hasOnlySupportedAutomationVariables("Hi {{customer_name}} from {{business_name}}"), "24d. Template with only supported variables passes validation");
assertTrue(!hasOnlySupportedAutomationVariables("Hi {{discount_code}}"), "24e. Template with an unsupported variable fails validation");

// ---------------------------------------------------------------------
// Labels — plain language only, spot-checked.
// ---------------------------------------------------------------------

assertEqual(AUTOMATION_TYPE_LABELS.new_lead_followup, "New website lead follow-up", "Label: new_lead_followup");
assertEqual(describeDelayInPlainLanguage(0), "", "describeDelayInPlainLanguage(0) is empty (no delay phrase)");
assertEqual(describeDelayInPlainLanguage(10), "after 10 minutes", "describeDelayInPlainLanguage(10)");
assertEqual(describeDelayInPlainLanguage(60), "after 1 hour", "describeDelayInPlainLanguage(60)");
assertEqual(describeDelayInPlainLanguage(1440), "after 1 day", "describeDelayInPlainLanguage(1440)");
assertTrue(
  describeAutomationInPlainLanguage({ automationType: "new_lead_followup", actionType: "send_whatsapp", delayMinutes: 10 }).includes("new website lead"),
  "describeAutomationInPlainLanguage reads as one understandable sentence"
);
assertTrue(
  !/\btrigger\b|\bworkflow\b|\bentity\b|\binvoke\b/i.test(
    describeAutomationInPlainLanguage({ automationType: "due_for_return", actionType: "create_recommendation", delayMinutes: 0 })
  ),
  "describeAutomationInPlainLanguage avoids technical/workflow jargon (spec step 46)"
);

// ---------------------------------------------------------------------
// 12-14: Safety constants — reused, not reinvented; sane values.
// ---------------------------------------------------------------------

assertEqual(AUTOMATION_CONTACT_COOLDOWN_DAYS, RECOMMENDATION_CONTACT_COOLDOWN_DAYS, "12a. Automation cooldown reuses Phase 12's cooldown constant exactly, not a second value");
assertTrue(MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY > 0, "14a. Business daily limit is a positive number");
assertTrue(MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS > 0, "13a. Per-customer limit is a positive number");
assertEqual(ASSUMED_BUSINESS_TIMEZONE, "Asia/Kolkata", "16a. Business-hours timezone is explicit, not the server/browser's own");

// ---------------------------------------------------------------------
// 15-16: Business hours.
// ---------------------------------------------------------------------

{
  // 2024-01-01 is a Monday; times below are UTC, chosen so IST (+5:30)
  // lands clearly inside/outside the 9am-8pm window regardless of where
  // this test happens to run.
  const twoAmIst = new Date("2024-01-01T20:35:00.000Z"); // 02:05 IST next day
  const noonIst = new Date("2024-01-01T06:30:00.000Z"); // 12:00 IST
  const ninePmIst = new Date("2024-01-01T15:30:00.000Z"); // 21:00 IST

  assertTrue(!isWithinBusinessHours(twoAmIst), "15a. 2am IST is outside business hours");
  assertTrue(isWithinBusinessHours(noonIst), "15b. Noon IST is inside business hours");
  assertTrue(!isWithinBusinessHours(ninePmIst), "15c. 9pm IST is outside the configured 9am-8pm window");
}

// ---------------------------------------------------------------------
// Edge case 1 from the spec: a lead captured at 2am IST with a 10-minute
// delay must not send at 2:10am (business hours gate), and must NOT be
// treated as "not yet due" once business hours reopen (delay already
// elapsed by then).
// ---------------------------------------------------------------------

{
  const capturedAt2am = new Date("2024-01-01T20:35:00.000Z"); // 02:05 IST
  const tenMinutesLater = new Date(capturedAt2am.getTime() + 10 * 60_000);
  const leadCandidate = makeCandidate({ leadId: "lead-1", entityEventKey: "lead:lead-1", triggeredAt: capturedAt2am });

  assertTrue(hasDelayElapsed(leadCandidate, 10, tenMinutesLater), "Edge case 1a. The 10-minute delay itself has elapsed by 2:10am");
  assertTrue(!isWithinBusinessHours(tenMinutesLater), "Edge case 1b. But 2:10am is still outside business hours, so it must not send yet");

  const nineAmSameDayIst = new Date("2024-01-02T03:35:00.000Z"); // 09:05 IST the same calendar day (IST) as the 2am capture, well after the delay
  assertTrue(hasDelayElapsed(leadCandidate, 10, nineAmSameDayIst), "Edge case 1c. Delay still considered elapsed once business hours reopen");
  assertTrue(isWithinBusinessHours(nineAmSameDayIst), "Edge case 1d. 9:05am IST is inside business hours — this is when it should finally send");
}

// ---------------------------------------------------------------------
// Opportunity-based candidates: no stored "became due at" timestamp, so
// the delay is documented as always-elapsed for these (business hours +
// cooldown are what actually pace them) — never blocks forever.
// ---------------------------------------------------------------------

assertTrue(
  hasDelayElapsed(makeCandidate({ customerId: "cust-1", entityEventKey: "cust-1:due_to_return" }), 1440, new Date()),
  "Opportunity-based candidate's delay is treated as already elapsed (no stored trigger timestamp to delay from)"
);

// ---------------------------------------------------------------------
// 10: Consent eligibility.
// ---------------------------------------------------------------------

assertEqual(hasSufficientConsent(null), { eligible: true }, "10a. No lead at all (existing customer) is not blocked by the consent check");
assertEqual(hasSufficientConsent(makeLead({ consent_status: "given" })).eligible, true, "10b. Lead with consent given is eligible");
assertEqual(hasSufficientConsent(makeLead({ consent_status: "not_recorded" })).eligible, false, "10c. Lead with consent not recorded is NOT eligible for an automated send");
assertEqual(hasSufficientConsent(makeLead({ consent_status: null })).eligible, false, "10d. Lead with no consent field at all is NOT eligible");

// ---------------------------------------------------------------------
// 11: Missing/invalid phone — reuses lib/whatsapp/phone.ts directly.
// ---------------------------------------------------------------------

assertEqual(normalizePhoneForWhatsApp(""), null, "11a. Empty phone does not normalize");
assertEqual(normalizePhoneForWhatsApp("123"), null, "11b. Too-short phone does not normalize");

// ---------------------------------------------------------------------
// 23: Emergency pause short-circuits eligibility before anything else.
// ---------------------------------------------------------------------

(async () => {
  const pausedResult = await checkCandidateEligibility({
    automation: makeAutomation({ status: "active" }),
    candidate: makeCandidate(),
    lead: null,
    outreachContext: undefined,
    businessAutomationsPausedAt: new Date().toISOString(),
    dailyCountForBusiness: 0,
    monthlyCountForCustomerOrLead: 0,
    now: new Date("2024-01-01T06:30:00.000Z"),
    supabase: {} as never,
  });
  assertEqual(pausedResult, { eligible: false, reason: "business_paused", detail: "All automations are currently paused for this business." }, "23a. Business-level pause blocks eligibility even for an otherwise-perfect candidate");

  const inactiveAutomationResult = await checkCandidateEligibility({
    automation: makeAutomation({ status: "paused" }),
    candidate: makeCandidate(),
    lead: null,
    outreachContext: undefined,
    businessAutomationsPausedAt: null,
    dailyCountForBusiness: 0,
    monthlyCountForCustomerOrLead: 0,
    now: new Date("2024-01-01T06:30:00.000Z"),
    supabase: {} as never,
  });
  assertEqual(inactiveAutomationResult.eligible, false, "2a. A paused automation is never eligible to act, regardless of the candidate");

  const dailyLimitResult = await checkCandidateEligibility({
    automation: makeAutomation(),
    candidate: makeCandidate(),
    lead: null,
    outreachContext: undefined,
    businessAutomationsPausedAt: null,
    dailyCountForBusiness: MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY,
    monthlyCountForCustomerOrLead: 0,
    now: new Date("2024-01-01T06:30:00.000Z"),
    supabase: {} as never,
  });
  assertEqual(dailyLimitResult.eligible, false, "14b. Business daily limit reached blocks an otherwise-eligible candidate");
  if (!dailyLimitResult.eligible) assertEqual(dailyLimitResult.reason, "daily_limit_reached", "14c. ...with the correct reason code");

  const customerLimitResult = await checkCandidateEligibility({
    automation: makeAutomation(),
    candidate: makeCandidate(),
    lead: null,
    outreachContext: undefined,
    businessAutomationsPausedAt: null,
    dailyCountForBusiness: 0,
    monthlyCountForCustomerOrLead: MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS,
    now: new Date("2024-01-01T06:30:00.000Z"),
    supabase: {} as never,
  });
  assertEqual(customerLimitResult.eligible, false, "13b. Per-customer 30-day limit reached blocks an otherwise-eligible candidate");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
