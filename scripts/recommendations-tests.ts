/**
 * Phase 12 — automated tests for the pure recommendation logic (filters,
 * ranking, and the outreach-context derivation used on the customer
 * profile page), PLUS, since the tiered-intelligence opportunity engine
 * overhaul, the opportunity engine's own baseline hierarchy and the
 * calendar-anchored recurring-schedule math (tests 18-27) — kept in this
 * same file since it already exercises `calculateOpportunityForCustomer`
 * directly. No test framework is installed and this sandbox has no npm
 * registry access to add one, so this is a small, dependency-free
 * assertion script. Run:
 *
 *   npx tsc -p tsconfig.recommendations-test.json
 *   node -r tsconfig-paths/register -r ./tsconfig-paths-boot.recommendations.js .recommendations-test-build/scripts/recommendations-tests.js
 *
 * (The single-file `npx tsc scripts/recommendations-tests.ts --outDir ...`
 * command previously documented here no longer works now that this file's
 * dependencies use `@/...` path aliases — a raw `tsc` invocation on one
 * file doesn't apply `tsconfig.json`'s path mapping, and plain `tsc`
 * doesn't rewrite the aliases in its output either. The project-file +
 * `tsconfig-paths` boot approach above is the same fix
 * `tsconfig.automations-test.json` / `tsconfig-paths-boot.js` already use
 * for `scripts/automations-tests.ts`.)
 *
 * `filters.ts` and `ranking.ts` are pure and Supabase-free, so they run
 * standalone like this. `dailyRecommendations.ts` and `utils.ts`'s
 * `getOutreachContextForBusiness` hit Supabase and are instead verified
 * against the live project directly. `deriveOutreachContextFromTimeline` IS
 * pure and is tested here directly.
 *
 * The four worked examples from the original spec are covered as follows:
 *  - Customer A (30-day pattern, 36 days since last visit -> considered):
 *    modeled directly as an already-fired `due_to_return` opportunity
 *    (the opportunity engine's own threshold math is covered directly by
 *    tests 18-27) passed through `isEligibleToday`.
 *  - Customer B (45-day pattern, 40 days since -> NOT due): verified
 *    end-to-end through the real opportunity engine, since 40 days doesn't
 *    clear the overdue multiplier for a 45-day pattern — it correctly
 *    produces no opportunity at all, so this module has nothing to filter.
 *  - Customer C (contacted 2 days ago -> cooldown applies): eligibility
 *    test with a recent `lastQualifyingMessageAt`.
 *  - Customer D (returned yesterday -> not recommended): verified
 *    end-to-end through the real opportunity engine — a fresh visit resets
 *    `daysSinceLastVisit` low enough that no rule fires, which is exactly
 *    why `filters.ts`'s header comment says this case needs no extra code
 *    here.
 */

import { isEligibleToday, type OutreachContext } from "../src/lib/recommendations/filters";
import { derivePriority, PRIORITY_LABEL, PRIORITY_ORDER } from "../src/lib/recommendations/ranking";
import { RECOMMENDATION_CONTACT_COOLDOWN_DAYS, MAX_DAILY_RECOMMENDATIONS } from "../src/lib/recommendations/constants";
import { deriveOutreachContextFromTimeline } from "../src/lib/recommendations/utils";
import { calculateOpportunityForCustomer } from "../src/lib/opportunities/calculate";
import type { Opportunity } from "../src/lib/opportunities/types";
import type { BusinessRow, CustomerRow, CustomerEventRow, ServiceBaselineRow } from "../src/types/database";
import type { TimelineEntry } from "../src/lib/whatsapp/types";
import { mostRecentAnniversary } from "../src/lib/recurring-schedules/queries";

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-17T00:00:00.000Z");
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function makeOpportunity(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: "opp-1",
    customerId: "cust-1",
    customerName: "Test Customer",
    customerPhone: "9876543210",
    type: "due_to_return",
    title: "Due to return",
    explanation: "test",
    confidence: "high",
    source: "personal_pattern",
    service: null,
    score: 100,
    daysSinceLastVisit: 36,
    lastVisitAt: iso(daysAgo(36)),
    visitCount: 4,
    totalSpent: 2000,
    ...overrides,
  };
}

function makeBusiness(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: "biz-1",
    owner_id: "owner-1",
    name: "Test Business",
    business_type: null,
    owner_name: null,
    city: null,
    phone: null,
    automations_paused_at: null,
    created_at: iso(daysAgo(400)),
    updated_at: iso(daysAgo(400)),
    ...overrides,
  };
}

function makeBaseline(service: string, expectedReturnDays: number): ServiceBaselineRow {
  return {
    id: `baseline-${service}`,
    business_id: "biz-1",
    service,
    expected_return_days: expectedReturnDays,
    created_at: iso(daysAgo(400)),
    updated_at: iso(daysAgo(400)),
  };
}

const NO_BASELINES: ServiceBaselineRow[] = [];
const GENERIC_BUSINESS = makeBusiness();

function makeCustomer(overrides: Partial<CustomerRow>): CustomerRow {
  return {
    id: "cust-1",
    business_id: "biz-1",
    name: "Test Customer",
    phone: "9876543210",
    status: "active",
    tags: [],
    notes: null,
    created_at: iso(daysAgo(400)),
    updated_at: iso(daysAgo(400)),
    ...overrides,
  } as CustomerRow;
}

function visitEvent(customerId: string, occurredAt: Date, amount = 500, service: string | null = null): CustomerEventRow {
  return {
    id: `evt-${occurredAt.getTime()}-${Math.random()}`,
    business_id: "biz-1",
    customer_id: customerId,
    event_type: "visit",
    service,
    amount,
    occurred_at: iso(occurredAt),
    notes: null,
    created_at: iso(occurredAt),
  } as unknown as CustomerEventRow;
}

// ---------------------------------------------------------------------
// 1-6: isEligibleToday
// ---------------------------------------------------------------------

const EMPTY_CONTEXT: OutreachContext = { lastQualifyingMessageAt: null, hasUnansweredReply: false };

assertTrue(
  isEligibleToday(makeOpportunity({ customerPhone: "9876543210" }), EMPTY_CONTEXT, NOW),
  "1. Valid phone, never contacted, no reply -> eligible"
);

assertTrue(
  !isEligibleToday(makeOpportunity({ customerPhone: "12345" }), EMPTY_CONTEXT, NOW),
  "2. Invalid/unnormalizable phone -> excluded"
);

assertTrue(
  !isEligibleToday(makeOpportunity({}), { lastQualifyingMessageAt: null, hasUnansweredReply: true }, NOW),
  "3. Unanswered reply -> excluded (needs human attention)"
);

// Customer C: contacted 2 days ago -> inside the 7-day cooldown -> excluded.
assertTrue(
  !isEligibleToday(makeOpportunity({}), { lastQualifyingMessageAt: iso(daysAgo(2)), hasUnansweredReply: false }, NOW),
  "4. Customer C - contacted 2 days ago -> cooldown excludes"
);

assertTrue(
  isEligibleToday(makeOpportunity({}), { lastQualifyingMessageAt: iso(daysAgo(10)), hasUnansweredReply: false }, NOW),
  "5. Contacted 10 days ago (past the 7-day cooldown) -> eligible"
);

assertTrue(
  RECOMMENDATION_CONTACT_COOLDOWN_DAYS === 7 &&
    !isEligibleToday(
      makeOpportunity({}),
      { lastQualifyingMessageAt: iso(daysAgo(RECOMMENDATION_CONTACT_COOLDOWN_DAYS - 0.01)), hasUnansweredReply: false },
      NOW
    ),
  "6. Just under the cooldown boundary -> still excluded"
);

// ---------------------------------------------------------------------
// 7-11: derivePriority
// ---------------------------------------------------------------------

assertEqual(
  derivePriority(makeOpportunity({ type: "high_value_inactive", confidence: "low" })),
  "lower",
  "7. Low confidence is always 'lower', regardless of type"
);

assertEqual(
  derivePriority(makeOpportunity({ type: "high_value_inactive", confidence: "medium" })),
  "high",
  "8. High-value customer gone quiet (confidence not low) -> 'high'"
);

assertEqual(
  derivePriority(makeOpportunity({ type: "due_to_return", confidence: "high" })),
  "high",
  "9. Due to return + high confidence -> 'high'"
);

assertEqual(
  derivePriority(makeOpportunity({ type: "due_to_return", confidence: "medium" })),
  "recommended",
  "10. Due to return + medium confidence -> 'recommended' (pattern less certain)"
);

assertEqual(
  derivePriority(makeOpportunity({ type: "inactive", confidence: "medium" })),
  "recommended",
  "11. Everything else with real evidence -> 'recommended'"
);

// ---------------------------------------------------------------------
// 12: labels are plain language, never numbers; order is High -> Lower
// ---------------------------------------------------------------------

assertTrue(
  Object.values(PRIORITY_LABEL).every((label) => typeof label === "string" && !/^\d+$/.test(label)),
  "12a. Priority labels are human-readable strings, never bare numbers"
);

assertTrue(
  PRIORITY_ORDER.high < PRIORITY_ORDER.recommended && PRIORITY_ORDER.recommended < PRIORITY_ORDER.lower,
  "12b. Sort order is High priority, then Recommended, then Lower priority"
);

// ---------------------------------------------------------------------
// 13: Customer D - returned yesterday -> Phase 6 itself produces no
// opportunity (this is the Phase 6/Phase 12 boundary filters.ts documents:
// no extra Phase 12 code needed for "customer returned recently").
// ---------------------------------------------------------------------

{
  const customer = makeCustomer({ id: "cust-d" });
  const events = [
    visitEvent("cust-d", daysAgo(96)),
    visitEvent("cust-d", daysAgo(66)),
    visitEvent("cust-d", daysAgo(36)),
    visitEvent("cust-d", daysAgo(1)), // returned yesterday
  ];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertEqual(opportunity, null, "13. Customer D - returned yesterday -> no opportunity at all, so not recommended");
}

// ---------------------------------------------------------------------
// 14: Customer B - 45-day pattern, 40 days since last visit -> not overdue
// enough yet (Phase 6's own math), so no opportunity fires.
// ---------------------------------------------------------------------

{
  const customer = makeCustomer({ id: "cust-b" });
  const events = [
    visitEvent("cust-b", daysAgo(40 + 45 + 45)),
    visitEvent("cust-b", daysAgo(40 + 45)),
    visitEvent("cust-b", daysAgo(40)), // 40 days since last visit
  ];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertEqual(opportunity, null, "14. Customer B - 45-day pattern, 40 days since -> not due yet, no opportunity");
}

// ---------------------------------------------------------------------
// 15: Customer A-analog - a pattern genuinely past Phase 6's overdue
// threshold (20-day pattern, 30 days since -> 30 >= 20*1.25) produces a
// real due_to_return opportunity, and Phase 12 correctly considers it
// (does not wrongly exclude a valid recommendation).
// ---------------------------------------------------------------------

{
  const customer = makeCustomer({ id: "cust-a" });
  const events = [
    visitEvent("cust-a", daysAgo(30 + 20 + 20)),
    visitEvent("cust-a", daysAgo(30 + 20)),
    visitEvent("cust-a", daysAgo(30)), // 30 days since last visit, ~20-day pattern
  ];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertTrue(opportunity !== null && opportunity.type === "due_to_return", "15a. Overdue pattern -> due_to_return fires");
  if (opportunity) {
    assertTrue(
      isEligibleToday(opportunity, EMPTY_CONTEXT, NOW),
      "15b. Customer A-analog with no recent contact/reply -> considered"
    );
  }
}

// ---------------------------------------------------------------------
// 16: deriveOutreachContextFromTimeline
// ---------------------------------------------------------------------

function outboundEntry(status: "sent" | "delivered" | "read" | "failed", timestamp: Date): TimelineEntry {
  return {
    direction: "outbound",
    timestamp: iso(timestamp),
    message: {
      id: `msg-${timestamp.getTime()}`,
      business_id: "biz-1",
      customer_id: "cust-1",
      opportunity_type: null,
      message_type: "freeform",
      template_name: null,
      content: "hi",
      status,
      provider_message_id: null,
      error_message: null,
      sent_at: iso(timestamp),
      delivered_at: null,
      read_at: null,
      failed_at: null,
      created_at: iso(timestamp),
      updated_at: iso(timestamp),
    },
  } as TimelineEntry;
}

function inboundEntry(timestamp: Date): TimelineEntry {
  return {
    direction: "inbound",
    timestamp: iso(timestamp),
    message: {
      id: `cmsg-${timestamp.getTime()}`,
      business_id: "biz-1",
      customer_id: "cust-1",
      from_phone: "9876543210",
      provider_message_id: null,
      message_type: "text",
      content: "hey",
      status: "received",
      received_at: iso(timestamp),
      created_at: iso(timestamp),
    },
  } as TimelineEntry;
}

{
  // Newest-first, matching getCommunicationTimelineForCustomer's contract.
  const timeline: TimelineEntry[] = [outboundEntry("delivered", daysAgo(3)), outboundEntry("failed", daysAgo(5))];
  const ctx = deriveOutreachContextFromTimeline(timeline);
  assertEqual(ctx.lastQualifyingMessageAt, iso(daysAgo(3)), "16a. Only sent/delivered/read count as qualifying outreach");
  assertTrue(!ctx.hasUnansweredReply, "16b. No inbound message -> no unanswered reply");
}

{
  const timeline: TimelineEntry[] = [inboundEntry(daysAgo(1)), outboundEntry("sent", daysAgo(4))];
  const ctx = deriveOutreachContextFromTimeline(timeline);
  assertTrue(ctx.hasUnansweredReply, "16c. Reply after the last outbound message -> unanswered");
}

{
  const timeline: TimelineEntry[] = [outboundEntry("sent", daysAgo(1)), inboundEntry(daysAgo(4))];
  const ctx = deriveOutreachContextFromTimeline(timeline);
  assertTrue(!ctx.hasUnansweredReply, "16d. Reply already followed up on (outbound is more recent) -> not unanswered");
}

// ---------------------------------------------------------------------
// 17: MAX_DAILY_RECOMMENDATIONS - the same sort+slice `dailyRecommendations.ts`
// applies, exercised directly against a larger eligible set.
// ---------------------------------------------------------------------

{
  const eligible: Opportunity[] = Array.from({ length: 23 }, (_, i) =>
    makeOpportunity({
      id: `opp-${i}`,
      customerId: `cust-${i}`,
      type: i % 3 === 0 ? "high_value_inactive" : "inactive",
      confidence: i % 5 === 0 ? "low" : "medium",
      score: i,
    })
  );
  const ranked = [...eligible].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[derivePriority(a)] - PRIORITY_ORDER[derivePriority(b)];
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });
  const capped = ranked.slice(0, MAX_DAILY_RECOMMENDATIONS);
  assertEqual(capped.length, MAX_DAILY_RECOMMENDATIONS, "17a. Capped to MAX_DAILY_RECOMMENDATIONS (10)");
  assertTrue(
    capped.every((o, i) => i === 0 || PRIORITY_ORDER[derivePriority(capped[i - 1])] <= PRIORITY_ORDER[derivePriority(o)]),
    "17b. Capped list stays sorted highest priority first"
  );
  assertEqual(eligible.length, 23, "17c. Full eligible count (23) is what totalEligible would report, uncapped");
}


// ---------------------------------------------------------------------
// 18-27: the tiered-intelligence opportunity engine overhaul — the 3-visit
// gate is gone, replaced by a business/service baseline hierarchy that
// only ever fills in for missing/weak personal history, never overriding
// a strong one. Mirrors the acceptance tests from the spec this overhaul
// implements.
// ---------------------------------------------------------------------

// 18. Brand-new customer, first-ever visit, business-defined baseline
// configured -> a legitimate opportunity fires from visit #1, using the
// baseline (source: business_baseline). This is the core "useful from the
// first visit" acceptance test.
{
  const customer = makeCustomer({ id: "cust-rahul-1" });
  const events = [visitEvent("cust-rahul-1", daysAgo(35), 500, "Haircut")];
  const opportunity = calculateOpportunityForCustomer(
    customer,
    events,
    GENERIC_BUSINESS,
    [makeBaseline("Haircut", 30)],
    NOW
  );
  assertTrue(opportunity !== null, "18a. First-ever visit + configured baseline -> an opportunity fires");
  if (opportunity) {
    assertEqual(opportunity.source, "business_baseline", "18b. Source is business_baseline, not a personal pattern");
    assertEqual(opportunity.type, "service_reminder", "18c. 35 days since (baseline 30, overdue at 37.5) -> approaching, not yet overdue");
    assertEqual(opportunity.service, "Haircut", "18d. Opportunity names the specific service");
  }
}

// 19. Brand-new customer, first visit, NO configured baseline and no
// recognizable built-in default (unrecognized service, excluded business
// type) -> Reelo must NOT manufacture an opportunity.
{
  const customer = makeCustomer({ id: "cust-boutique-1" });
  const events = [visitEvent("cust-boutique-1", daysAgo(60), 500, "Bespoke Tailoring Consultation")];
  const opportunity = calculateOpportunityForCustomer(
    customer,
    events,
    makeBusiness({ business_type: "Boutique" }),
    NO_BASELINES,
    NOW
  );
  assertEqual(opportunity, null, "19. No baseline, no personal pattern, retail-excluded business type -> no opportunity");
}

// 20. Weak personal history (exactly 2 visits -> one real observed gap),
// NO baseline configured -> the single observed gap is used directly.
{
  const customer = makeCustomer({ id: "cust-weak-nobaseline" });
  const events = [
    visitEvent("cust-weak-nobaseline", daysAgo(84), 500, "Consulting Session"),
    visitEvent("cust-weak-nobaseline", daysAgo(44), 500, "Consulting Session"), // 40-day gap, 44 days since
  ];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertTrue(opportunity !== null, "20a. Weak personal history with no baseline still produces a real signal");
  if (opportunity) {
    assertEqual(opportunity.source, "personal_pattern", "20b. No baseline to lean on -> uses the observed gap directly");
    assertEqual(opportunity.type, "service_reminder", "20c. 44 days since a 40-day observed gap -> approaching");
  }
}

// 21. Weak personal history (2 visits, a THIN and very different gap) with
// a baseline configured -> the baseline remains the operative number, per
// "never mathematically blend" — this is the strongest possible check that
// the code isn't averaging (30+50)/2.
{
  const customer = makeCustomer({ id: "cust-weak-withbaseline" });
  const events = [
    visitEvent("cust-weak-withbaseline", daysAgo(82), 500, "Haircut"),
    visitEvent("cust-weak-withbaseline", daysAgo(32), 500, "Haircut"), // 50-day gap, 32 days since
  ];
  const opportunity = calculateOpportunityForCustomer(
    customer,
    events,
    GENERIC_BUSINESS,
    [makeBaseline("Haircut", 30)],
    NOW
  );
  // If the code wrongly used the weak personal gap (50) instead of the
  // baseline (30), 32 days since wouldn't even clear the "approaching"
  // threshold (32 < 50) and this would incorrectly be null.
  assertTrue(opportunity !== null, "21a. Baseline (30d), not the thin personal gap (50d), is used -> 32 days since clears it");
  if (opportunity) {
    assertEqual(opportunity.source, "personal_with_baseline_support", "21b. Source reflects thin personal history supported by a baseline");
  }
}

// 22. Strong personal history (3+ visits) overrides a very different
// baseline entirely -> "a customer's own pattern eventually overrides a
// generic baseline."
{
  const customer = makeCustomer({ id: "cust-strong-overrides" });
  const events = [
    visitEvent("cust-strong-overrides", daysAgo(50 + 44 + 44), 500, "Haircut"),
    visitEvent("cust-strong-overrides", daysAgo(50 + 44), 500, "Haircut"),
    visitEvent("cust-strong-overrides", daysAgo(50), 500, "Haircut"), // ~44-day personal average, 50 days since
  ];
  const opportunity = calculateOpportunityForCustomer(
    customer,
    events,
    GENERIC_BUSINESS,
    [makeBaseline("Haircut", 30)], // very different from the ~44-day personal pattern
    NOW
  );
  assertTrue(opportunity !== null, "22a. Strong personal pattern produces an opportunity");
  if (opportunity) {
    assertEqual(opportunity.source, "personal_pattern", "22b. Strong personal history is used, not the baseline");
    // If the 30-day baseline had wrongly been used instead of the ~44-day
    // personal average, 50 days since would already be overdue (30*1.25 =
    // 37.5), not merely approaching (44*1.25 = 55).
    assertEqual(opportunity.type, "service_reminder", "22c. Judged against the customer's OWN ~44-day pattern, not the 30-day baseline");
  }
}

// 23. Different services for the same customer are tracked independently
// -- an overdue haircut pattern must not be diluted or overridden by an
// unrelated, recent facial visit.
{
  const customer = makeCustomer({ id: "cust-multiservice" });
  const events = [
    visitEvent("cust-multiservice", daysAgo(40 + 30 + 30), 500, "Haircut"),
    visitEvent("cust-multiservice", daysAgo(40 + 30), 500, "Haircut"),
    visitEvent("cust-multiservice", daysAgo(40), 500, "Haircut"), // ~30-day pattern, 40 days since -> overdue
    visitEvent("cust-multiservice", daysAgo(10), 800, "Facial"), // one recent, unrelated facial visit
  ];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertTrue(opportunity !== null, "23a. The overdue haircut pattern still produces an opportunity");
  if (opportunity) {
    assertEqual(opportunity.service, "Haircut", "23b. Surfaces the haircut opportunity, not the unrelated recent facial");
    assertEqual(opportunity.type, "due_to_return", "23c. Correctly overdue by the haircut-only pattern");
    assertEqual(opportunity.visitCount, 3, "23d. visitCount reflects the haircut bucket only (3), not all 4 events");
    assertEqual(opportunity.daysSinceLastVisit, 40, "23e. daysSinceLastVisit is the haircut bucket's own value, not the facial's");
  }
}

// 24. A business-type generic default applies even for untagged/no-service
// visits, when the business type matches a recognized category.
{
  const customer = makeCustomer({ id: "cust-garage" });
  const events = [visitEvent("cust-garage", daysAgo(95), 1200, null)];
  const opportunity = calculateOpportunityForCustomer(
    customer,
    events,
    makeBusiness({ business_type: "Garage - Car Repair" }),
    NO_BASELINES,
    NOW
  );
  assertTrue(opportunity !== null, "24a. Untagged visit at a recognized business type still gets a baseline");
  if (opportunity) {
    assertEqual(opportunity.source, "business_baseline", "24b. Source is the business-type generic default");
    assertEqual(opportunity.service, null, "24c. General/untagged bucket has no service name");
  }
}

// 25. A built-in service-specific default applies independent of business
// type (even when business_type is null/unset).
{
  const customer = makeCustomer({ id: "cust-facial-default" });
  const events = [visitEvent("cust-facial-default", daysAgo(50), 900, "Facial")];
  const opportunity = calculateOpportunityForCustomer(customer, events, GENERIC_BUSINESS, NO_BASELINES, NOW);
  assertTrue(opportunity !== null, "25a. Built-in facial default (45d) applies even with no business type set");
  if (opportunity) {
    assertEqual(opportunity.source, "business_baseline", "25b. First visit -> baseline-sourced");
  }
}

// 26-27. Recurring schedule anniversary math (calendar-anchored triggers,
// kept separate from the opportunity engine above).
{
  const anchor = new Date("2026-09-04T00:00:00.000Z");
  const beforeFirstAnniversary = new Date("2026-09-20T00:00:00.000Z");
  const afterFirstAnniversary = new Date("2026-10-05T00:00:00.000Z");
  const monthEndAnchor = new Date("2026-01-31T00:00:00.000Z");
  const febNow = new Date("2026-03-05T00:00:00.000Z"); // after Feb's clamped 28th, before March 31st

  assertEqual(
    mostRecentAnniversary(anchor, beforeFirstAnniversary),
    null,
    "26a. Before the first monthly anniversary -> not due yet (the join date itself is not a due date)"
  );
  assertEqual(
    mostRecentAnniversary(anchor, afterFirstAnniversary)?.toISOString().slice(0, 10),
    "2026-10-04",
    "26b. First anniversary after the anchor -> Oct 4"
  );
  assertEqual(
    mostRecentAnniversary(monthEndAnchor, febNow)?.toISOString().slice(0, 10),
    "2026-02-28",
    "27. Month-end anchor (Jan 31) clamps to the last real day of a shorter month (Feb 28, 2026), not yet March 31"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
