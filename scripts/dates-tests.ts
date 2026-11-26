/**
 * Milestone 1 — business-time-zone date logic. `npm test` runs this file
 * under UTC, Asia/Kolkata, America/New_York and Pacific/Kiritimati; every
 * answer must be identical, because none of it may depend on the server's
 * own clock zone.
 */
import {
  addDaysToDateKey,
  businessDateKey,
  daysBetweenDateKeys,
  getBusinessTimeZone,
  getZonedParts,
  isValidTimeZone,
  startOfBusinessDay,
  timeZoneOffsetMinutes,
  zonedTimeToUtc,
} from "@/lib/dates";
import { mostRecentAnniversary, periodKeyForRecurringSchedule } from "@/lib/recurring-schedules/queries";
import { isWithinBusinessHours } from "@/lib/automations/eligibility";
import { resolveAnalyticsDateRange } from "@/lib/analytics/date-range";
import { normalizeDate } from "@/lib/import/normalize";
import type { RecurringScheduleRow } from "@/types/database";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const IST = "Asia/Kolkata";

// Core helpers.
eq(businessDateKey(new Date("2026-11-25T19:00:00Z"), IST), "2026-11-26", "00:30 IST is already the next day in India");
eq(businessDateKey(new Date("2026-11-25T19:00:00Z"), "UTC"), "2026-11-25", "same instant is still the 25th in UTC");
eq(getZonedParts(new Date("2026-11-26T03:30:00Z"), IST).hour, 9, "03:30 UTC is 9am IST");
eq(timeZoneOffsetMinutes(new Date("2026-06-01T00:00:00Z"), IST), 330, "IST offset +5:30");
eq(zonedTimeToUtc("2026-11-26", "00:00", IST).toISOString(), "2026-11-25T18:30:00.000Z", "IST midnight in UTC");
eq(zonedTimeToUtc("2026-03-08", "12:00", "America/New_York").toISOString(), "2026-03-08T16:00:00.000Z", "DST day handled (EDT)");
eq(startOfBusinessDay(new Date("2026-11-26T03:00:00Z"), IST).toISOString(), "2026-11-25T18:30:00.000Z", "daily cap resets at IST midnight, not UTC midnight");
eq(addDaysToDateKey("2026-02-28", 1), "2026-03-01", "date arithmetic across month end");
eq(addDaysToDateKey("2024-02-28", 1), "2024-02-29", "leap day");
eq(daysBetweenDateKeys("2026-01-01", "2026-12-31"), 364, "days between");
eq(isValidTimeZone("Asia/Kolkata"), true, "valid zone");
eq(isValidTimeZone("Mars/Base"), false, "invalid zone");
eq(getBusinessTimeZone({ timezone: null }), IST, "missing zone falls back to Asia/Kolkata");
eq(getBusinessTimeZone({ timezone: "Bad/Zone" }), IST, "invalid zone falls back to Asia/Kolkata");
eq(getBusinessTimeZone({ timezone: "Asia/Dubai" }), "Asia/Dubai", "a business's own zone is used");

// Business hours (9am-8pm local).
eq(isWithinBusinessHours(new Date("2026-11-26T03:29:00Z"), IST), false, "8:59am IST is before business hours");
eq(isWithinBusinessHours(new Date("2026-11-26T03:30:00Z"), IST), true, "9:00am IST is inside business hours");
eq(isWithinBusinessHours(new Date("2026-11-26T14:29:00Z"), IST), true, "7:59pm IST is inside");
eq(isWithinBusinessHours(new Date("2026-11-26T14:30:00Z"), IST), false, "8:00pm IST is outside");

// Recurring schedules: due on the local calendar date.
eq(mostRecentAnniversary("2026-09-04", new Date("2026-10-03T18:29:00Z"), IST), null, "Oct 3 23:59 IST: first anniversary not yet due");
eq(mostRecentAnniversary("2026-09-04", new Date("2026-10-03T18:30:00Z"), IST)?.toISOString().slice(0, 10), "2026-10-04", "Oct 4 00:00 IST: due");
eq(mostRecentAnniversary("2026-01-31", new Date("2026-03-05T00:00:00Z"), IST)?.toISOString().slice(0, 10), "2026-02-28", "month-end anchor clamps to Feb 28");
eq(mostRecentAnniversary("2024-01-31", new Date("2024-03-01T00:00:00Z"), IST)?.toISOString().slice(0, 10), "2024-02-29", "leap-year clamp");
eq(mostRecentAnniversary("2020-05-15", new Date("2026-11-26T06:00:00Z"), IST)?.toISOString().slice(0, 10), "2026-11-15", "old anchor finds the latest anniversary");
eq(mostRecentAnniversary("2025-12-10", new Date("2026-01-10T00:00:00Z"), IST)?.toISOString().slice(0, 10), "2026-01-10", "anniversary across a year boundary");
const schedule = { anchor_date: "2026-09-04" } as RecurringScheduleRow;
eq(periodKeyForRecurringSchedule(schedule, new Date("2026-10-20T00:00:00Z"), IST), "2026-10", "period key = anniversary month");

// Analytics ranges are local calendar days.
const now = new Date("2026-11-26T03:00:00Z"); // 8:30am IST on the 26th
const r7 = resolveAnalyticsDateRange({ range: "7d" }, IST, now);
eq([r7.startIso, r7.endIso], ["2026-11-19T18:30:00.000Z", "2026-11-26T18:30:00.000Z"], "last 7 days = Nov 20-26 IST");
const custom = resolveAnalyticsDateRange({ range: "custom", from: "2026-11-01", to: "2026-11-02" }, IST, now);
eq([custom.startIso, custom.endIso], ["2026-10-31T18:30:00.000Z", "2026-11-02T18:30:00.000Z"], "custom range in IST, end exclusive");
eq(resolveAnalyticsDateRange({ range: "custom", from: "2026-11-05", to: "2026-11-01" }, IST, now).key, "30d", "reversed custom range falls back");
eq(resolveAnalyticsDateRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, IST, now).key, "30d", "impossible date falls back");

// Import dates written as text keep their calendar day in every zone.
eq(normalizeDate("Jun 1, 2026").value, "2026-06-01", "'Jun 1, 2026' stays June 1 (was May 31 east of UTC)");
eq(normalizeDate("2026-06-01").value, "2026-06-01", "ISO date unchanged");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
