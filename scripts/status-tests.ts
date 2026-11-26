/**
 * Milestone 1 — customer status is derived from the opportunity engine.
 * Run with `npm test`.
 */
import { countCustomersByStatus, deriveCustomerStatus } from "@/lib/customers/status";
import { calculateOpportunityForCustomer } from "@/lib/opportunities/calculate";
import type { Opportunity } from "@/lib/opportunities/types";
import type { BusinessRow, CustomerEventRow, CustomerRow } from "@/types/database";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const opp = (type: Opportunity["type"]) => ({ type }) as Opportunity;
eq(deriveCustomerStatus(opp("due_to_return"), 3), "due", "due_to_return -> due");
eq(deriveCustomerStatus(opp("service_reminder"), 3), "due", "service_reminder -> due");
eq(deriveCustomerStatus(opp("inactive"), 3), "inactive", "inactive -> inactive");
eq(deriveCustomerStatus(opp("high_value_inactive"), 3), "inactive", "high_value_inactive -> inactive");
eq(deriveCustomerStatus(opp("follow_up"), 1), "follow_up", "follow_up -> follow_up");
eq(deriveCustomerStatus(null, 2), "active", "visits and nothing due -> active");
eq(deriveCustomerStatus(null, 0), "new", "no visits -> new (no manual guess)");
eq(countCustomersByStatus(["due", "due", "active", "new"]), { active: 1, due: 2, inactive: 0, follow_up: 0, new: 1 }, "counts by status");

// End to end: the hand-set status column is ignored; the engine decides.
const now = new Date("2026-11-26T06:00:00Z");
const business = { id: "b1", timezone: "Asia/Kolkata" } as unknown as BusinessRow;
const customer = { id: "c1", business_id: "b1", name: "Ravi", phone: "+919876543210", status: "active", created_at: "2025-01-01T00:00:00Z" } as unknown as CustomerRow;
const visit = (daysAgo: number): CustomerEventRow =>
  ({
    id: `v${daysAgo}`,
    business_id: "b1",
    customer_id: "c1",
    event_type: "visit",
    service: "Haircut",
    amount: 300,
    occurred_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    notes: null,
    created_at: now.toISOString(),
  }) as unknown as CustomerEventRow;
const events = [visit(100), visit(72), visit(44)]; // ~28-day cycle, last visit 44 days ago
const engineOpp = calculateOpportunityForCustomer(customer, events, business, [], now);
eq(engineOpp !== null && deriveCustomerStatus(engineOpp, events.length) !== "active", true, "manual 'active' is overridden by the engine when the customer is overdue");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
