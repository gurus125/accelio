/**
 * Milestone 1 — imported customers become real visits the opportunity
 * engine can see. Run with `npm test`.
 */
import { buildImportedEvents, importedVisitInstant } from "@/lib/import/events";
import { buildImportRows } from "@/lib/import/validate";
import { suggestMapping } from "@/lib/import/mapping";
import { calculateOpportunityForCustomer } from "@/lib/opportunities/calculate";
import type { BusinessRow, CustomerRow, CustomerEventRow } from "@/types/database";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date("2026-11-26T06:00:00.000Z"); // 11:30 IST

// Date -> instant: noon IST, same calendar day in India.
eq(importedVisitInstant("2026-10-01", "Asia/Kolkata"), "2026-10-01T06:30:00.000Z", "imported visit = noon IST on that date");

// Full row -> visit + summary note.
const full = buildImportedEvents("c1", { lastVisit: "2026-10-01", service: " Haircut ", totalSpent: 4800, visitCount: 6 }, "Asia/Kolkata", NOW);
eq(full.length, 2, "full row creates a visit and a summary note");
eq(full[0].event_type, "visit", "first event is a real visit");
eq(full[0].service, "Haircut", "visit carries the trimmed service");
eq(full[0].amount, null, "lifetime spend is NOT put on the single visit");
eq(full[0].occurred_at, "2026-10-01T06:30:00.000Z", "visit dated on the last-visit date");
eq(full[1].event_type, "other", "summary note kept as before");
eq(full[1].amount, 4800, "summary keeps lifetime spend");
eq(full[1].notes, "Imported customer record — 6 visits on record", "summary note text");

// No date -> no visit is invented.
const noDate = buildImportedEvents("c2", { lastVisit: null, service: "Facial", totalSpent: null, visitCount: 2 }, "Asia/Kolkata", NOW);
eq(noDate.map((e) => e.event_type), ["other"], "no last-visit date -> no fabricated visit");
eq(noDate[0].notes, "Imported customer record — 2 visits on record — service: Facial", "service kept in the note when there is no visit");

// Nothing useful -> no events at all.
eq(buildImportedEvents("c3", { lastVisit: null, service: null, totalSpent: null, visitCount: null }, "Asia/Kolkata", NOW), [], "empty row creates no events");

// Future date in the file is not treated as a visit.
const future = buildImportedEvents("c4", { lastVisit: "2027-01-01", service: null, totalSpent: null, visitCount: null }, "Asia/Kolkata", NOW);
eq(future.map((e) => e.event_type), ["other"], "future last-visit date is not used as a visit");

// Mapping + validation carry the service column through.
const mapping = suggestMapping(["Customer Name", "Mobile", "Last Visit", "Last Service"]);
eq(mapping["Last Service"], "service", "'Last Service' header maps to service (not last visit)");
eq(mapping["Last Visit"], "lastVisit", "'Last Visit' header maps to last visit");
const rows = buildImportRows([{ "Customer Name": "Asha", Mobile: "98765 43210", "Last Visit": "2026-10-01", "Last Service": "Threading" }], mapping);
eq([rows[0].phone, rows[0].lastVisit, rows[0].service], ["+919876543210", "2026-10-01", "Threading"], "validated import row");

// End to end: the engine now flags an imported customer.
const business = { id: "b1", timezone: "Asia/Kolkata" } as unknown as BusinessRow;
const customer = { id: "c1", business_id: "b1", name: "Asha", phone: "+919876543210", created_at: NOW.toISOString() } as unknown as CustomerRow;
const engineEvents = full.map((e, i) => ({ ...e, id: `e${i}`, business_id: "b1", created_at: NOW.toISOString() })) as unknown as CustomerEventRow[];
const before = engineEvents.filter((e) => e.event_type !== "visit"); // what the old import produced
const opportunityBefore = calculateOpportunityForCustomer(customer, before, business, [], NOW);
const opportunityAfter = calculateOpportunityForCustomer(customer, engineEvents, business, [], NOW);
eq(opportunityBefore === null, true, "old 'other'-only import was invisible to the engine");
eq(opportunityAfter !== null, true, "imported visit 56 days ago is now flagged by the engine");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
