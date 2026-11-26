/**
 * Phase 11 — automated tests for the pure analytics logic (rate math and
 * reactivation attribution). No test framework is installed in this
 * project (see package.json — no jest/vitest), and this sandbox has no
 * npm registry access to install one, so this is a small, dependency-free
 * assertion script instead. Run it with:
 *
 *   npx tsc scripts/analytics-tests.ts --outDir .analytics-test-build --module commonjs --target es2019 --esModuleInterop
 *   node .analytics-test-build/scripts/analytics-tests.js
 *
 * It only imports from lib/analytics/reactivation.ts and rates.ts, which
 * are deliberately Supabase-free so they can run standalone like this. DB
 * integration behavior (RLS, webhooks, real queries) is instead verified
 * against the live Supabase project directly — see the Phase 11 report's
 * "Tests performed" section for what was checked that way.
 */

import { computeCustomerReactivation, REACTIVATION_ATTRIBUTION_DAYS } from "../src/lib/analytics/reactivation";
import { computeRate } from "../src/lib/analytics/rates";

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
const iso = (t: number) => new Date(t).toISOString();
const BASE = new Date("2026-09-01T00:00:00.000Z").getTime();

// 1. Delivery/read/reply rate math ------------------------------------------------
assertEqual(computeRate(71, 78).display, "91%", "delivery rate rounds to nearest percent");
assertEqual(computeRate(0, 0).display, "--", "rate with zero denominator shows '--' not '0%'");
assertEqual(computeRate(0, 10).display, "0%", "a real zero numerator over a real denominator is a genuine 0%");
assertEqual(computeRate(5, 5).display, "100%", "rate can reach 100%");

// 2. Customer returning after outreach (basic case) --------------------------------
{
  const outreaches = [{ at: iso(BASE) }]; // Sep 1
  const visits = [{ at: iso(BASE + 12 * DAY), amount: 1200 }]; // Sep 13
  const result = computeCustomerReactivation(outreaches, visits);
  assertTrue(result.returned, "visit 12 days after outreach counts as returned");
  assertEqual(result.revenue, 1200, "revenue comes from the qualifying visit's amount");
}

// 3. Customer returning BEFORE outreach must not count -----------------------------
{
  const outreaches = [{ at: iso(BASE + 5 * DAY) }]; // Sep 6
  const visits = [{ at: iso(BASE), amount: 500 }]; // Sep 1, before the message
  const result = computeCustomerReactivation(outreaches, visits);
  assertEqual(result.returned, false, "a visit before the outreach is never attributed to it");
}

// 4. Exactly on the attribution boundary (30 days) counts ---------------------------
{
  const outreaches = [{ at: iso(BASE) }];
  const visits = [{ at: iso(BASE + REACTIVATION_ATTRIBUTION_DAYS * DAY), amount: 900 }];
  const result = computeCustomerReactivation(outreaches, visits);
  assertTrue(result.returned, "a return exactly 30 days after outreach still qualifies (inclusive boundary)");
}

// 5. One millisecond past the boundary does not count -------------------------------
{
  const outreaches = [{ at: iso(BASE) }];
  const visits = [{ at: iso(BASE + REACTIVATION_ATTRIBUTION_DAYS * DAY + 1), amount: 900 }];
  const result = computeCustomerReactivation(outreaches, visits);
  assertEqual(result.returned, false, "a return 30 days + 1ms after outreach falls outside the window");
}

// 6. Outside the window entirely (44 days, per the Phase 11 spec's own example) -----
{
  const outreaches = [{ at: iso(BASE) }]; // Sep 1
  const visits = [{ at: iso(BASE + 44 * DAY), amount: 900 }]; // ~Oct 15
  const result = computeCustomerReactivation(outreaches, visits);
  assertEqual(result.returned, false, "Sep 1 outreach -> Oct 15 visit (44 days) is outside the 30-day window");
}

// 7. Multiple outreaches -> exactly ONE returned customer, attributed to the ------
//    MOST RECENT qualifying outreach before the visit (Phase 11 section 12's own
//    Rahul example: Sep 1 / Sep 8 / Sep 15 messages, Sep 20 visit).
{
  const outreaches = [
    { at: iso(BASE) }, // Sep 1
    { at: iso(BASE + 7 * DAY) }, // Sep 8
    { at: iso(BASE + 14 * DAY) }, // Sep 15
  ];
  const visits = [{ at: iso(BASE + 19 * DAY), amount: 1500 }]; // Sep 20
  const result = computeCustomerReactivation(outreaches, visits);
  assertTrue(result.returned, "customer with 3 prior messages still returns exactly once");
  assertEqual(result.outreachAt, iso(BASE + 14 * DAY), "credited to the MOST RECENT outreach (Sep 15), not the first (Sep 1)");
}

// 8. Multiple visits -> only the FIRST qualifying visit is used for the return/revenue,
//    a later, larger visit is deliberately ignored for this metric (section 15).
{
  const outreaches = [{ at: iso(BASE) }];
  const visits = [
    { at: iso(BASE + 10 * DAY), amount: 500 }, // first qualifying visit
    { at: iso(BASE + 60 * DAY), amount: 5000 }, // later, bigger visit — must NOT be counted
  ];
  const result = computeCustomerReactivation(outreaches, visits);
  assertTrue(result.returned, "returns true from the first qualifying visit");
  assertEqual(result.revenue, 500, "revenue is the FIRST qualifying visit's amount only, not the larger later one");
}

// 9. No outreach at all -> never counted as returned, regardless of visits ----------
{
  const result = computeCustomerReactivation([], [{ at: iso(BASE + 10 * DAY), amount: 100 }]);
  assertEqual(result.returned, false, "a visit with no prior outreach at all is never a reactivation");
}

// 10. No visits at all -> never counted as returned ---------------------------------
{
  const result = computeCustomerReactivation([{ at: iso(BASE) }], []);
  assertEqual(result.returned, false, "outreach with no visit at all is never a reactivation");
}

// 11. Revenue can be null (visit recorded with no amount) — must not silently become 0
{
  const outreaches = [{ at: iso(BASE) }];
  const visits = [{ at: iso(BASE + 5 * DAY), amount: null }];
  const result = computeCustomerReactivation(outreaches, visits);
  assertTrue(result.returned, "a visit with a null amount still counts as a qualifying return");
  assertEqual(result.revenue, null, "revenue stays null (unknown), never coerced to 0, when the visit has no amount");
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
