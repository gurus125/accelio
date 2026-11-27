/**
 * Milestone 1 — what an imported row turns into in `customer_events`.
 *
 * Before: one `event_type = 'other'` summary row. The opportunity engine
 * only counts `'visit'` events, so imported customers were never flagged
 * as due — the core loop silently didn't work for anyone imported.
 *
 * Now, per imported customer:
 *   - a real `visit` event on the last-visit date (with the service, when
 *     the file has one), so the engine can compute "days since last visit";
 *   - the summary note (visit count / lifetime spend from the file) kept as
 *     its own `other` event, exactly as before, so nothing is lost and the
 *     lifetime spend never gets double-counted as one visit's amount.
 *
 * Pure (no Supabase import) so it is unit-tested in scripts/import-tests.ts.
 */

import { zonedTimeToUtc, type DateKey } from "@/lib/dates";

export interface ImportEventSource {
  lastVisit: DateKey | null; // "YYYY-MM-DD", already validated
  service: string | null;
  totalSpent: number | null;
  visitCount: number | null;
}

export interface ImportedEventInsert {
  customer_id: string;
  event_type: "visit" | "other";
  service: string | null;
  amount: number | null;
  occurred_at: string;
  notes: string;
}

/** Noon local time on the visit date: the file only has a date, and noon
 * keeps it on the same calendar day in the business's zone. */
export function importedVisitInstant(lastVisit: DateKey, timeZone: string): string {
  return zonedTimeToUtc(lastVisit, "12:00", timeZone).toISOString();
}

export function buildImportedEvents(
  customerId: string,
  row: ImportEventSource,
  timeZone: string,
  now: Date = new Date()
): ImportedEventInsert[] {
  const events: ImportedEventInsert[] = [];
  const service = row.service?.trim() || null;
  const visitAt = row.lastVisit ? importedVisitInstant(row.lastVisit, timeZone) : null;

  // A future "last visit" is a typo in the file, not a visit — don't let it
  // make the customer look like they just came in.
  const visitIsPlausible = visitAt !== null && new Date(visitAt).getTime() <= now.getTime();

  if (visitAt && visitIsPlausible) {
    events.push({
      customer_id: customerId,
      event_type: "visit",
      service,
      amount: null,
      occurred_at: visitAt,
      notes: "Last visit (imported)",
    });
  }

  if (row.totalSpent != null || row.visitCount != null || row.lastVisit != null || service) {
    const noteParts = ["Imported customer record"];
    if (row.visitCount != null) {
      noteParts.push(`${row.visitCount} visit${row.visitCount === 1 ? "" : "s"} on record`);
    }
    if (row.lastVisit && !visitIsPlausible) {
      noteParts.push(`last visit date in file was ${row.lastVisit} (in the future, not used)`);
    }
    if (service && !(visitAt && visitIsPlausible)) {
      noteParts.push(`service: ${service}`);
    }
    events.push({
      customer_id: customerId,
      event_type: "other",
      service: null,
      amount: row.totalSpent,
      occurred_at: visitAt && visitIsPlausible ? visitAt : now.toISOString(),
      notes: noteParts.join(" — "),
    });
  }

  return events;
}
