"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { getRemainingCustomerQuota } from "@/lib/billing/limits";
import type { ImportBatchOutcome, ImportFailure } from "@/types/import";
import { INVALID_PHONE_MESSAGE, normalizeIndianMobile } from "@/lib/phone";
import { chunk, fetchAllPages } from "@/lib/supabase/paginate";
import { buildImportedEvents } from "@/lib/import/events";
import { getBusinessTimeZone } from "@/lib/dates";

/**
 * Returns only the phone numbers already on file for the CURRENT business —
 * never full customer records, and always scoped by
 * `requireBusinessForCurrentUser()` (derived from the session), never by
 * anything the client sends. Used client-side purely for duplicate
 * highlighting before import; the batch import below re-checks
 * independently, so this being stale or spoofed changes nothing about
 * what actually gets written.
 */
export async function getExistingPhonesForImport(): Promise<{ error?: string; phones?: string[] }> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "Set up your business profile before importing customers." };
  }

  const supabase = createClient();
  try {
    const rows = await fetchAllPages<{ phone: string }>((from, to) =>
      supabase.from("customers").select("phone").eq("business_id", business.id).order("id").range(from, to)
    );
    // Normalised so a legacy un-normalised row still counts as a duplicate.
    return { phones: rows.map((row) => normalizeIndianMobile(row.phone) ?? row.phone) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load your existing customers." };
  }
}

export interface ImportRowInput {
  rowNumber: number;
  name: string;
  phone: string;
  email: string | null;
  lastVisit: string | null;
  service?: string | null;
  totalSpent: number | null;
  visitCount: number | null;
  notes: string | null;
}

/**
 * Imports one batch of already-validated rows. Called repeatedly by the
 * client (one call per batch) so a large file becomes several small
 * requests instead of one enormous one, and so the UI can show real
 * progress between calls.
 *
 * Security: `business_id` is never accepted from the caller — it's derived
 * fresh from the authenticated session on every call via
 * `requireBusinessForCurrentUser()`. Row Level Security on `customers` /
 * `customer_events` enforces the same boundary independently. Duplicate
 * phones are re-checked against the database here too (not just trusted
 * from the client's earlier check), and the unique index on
 * `(business_id, phone)` is the final backstop if two requests race.
 */
// Phase 19 hardening — a server action is a callable RPC endpoint like any
// other; nothing before this stopped a modified client from posting an
// enormous `rows` array directly, bypassing the browser-side per-file
// row cap entirely (parse.ts's MAX_IMPORT_ROWS only bounds what the UI
// itself sends, one batch at a time). This caps a single batch call
// server-side, independent of how the request was made.
const MAX_BATCH_SIZE = 500;

export async function importCustomerBatch(
  rows: ImportRowInput[],
  options: { whatsappConsent?: boolean } = {}
): Promise<ImportBatchOutcome> {
  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "Set up your business profile before importing customers.", insertedCount: 0, failed: [] };
  }

  if (rows.length === 0) return { insertedCount: 0, failed: [] };
  if (rows.length > MAX_BATCH_SIZE) {
    return { error: `A single import batch can include at most ${MAX_BATCH_SIZE} rows.`, insertedCount: 0, failed: [] };
  }

  // Never trust the client's normalisation — re-run the shared normaliser
  // and refuse rows it can't read.
  const invalid: ImportFailure[] = [];
  const seenInBatch = new Set<string>();
  const normalizedRows: ImportRowInput[] = [];
  for (const row of rows) {
    const phone = normalizeIndianMobile(row.phone);
    if (!phone) {
      invalid.push({ rowNumber: row.rowNumber, name: row.name, phone: row.phone, reason: INVALID_PHONE_MESSAGE });
    } else if (seenInBatch.has(phone)) {
      invalid.push({ rowNumber: row.rowNumber, name: row.name, phone, reason: "Same phone number appears earlier in this file" });
    } else {
      seenInBatch.add(phone);
      normalizedRows.push({ ...row, phone });
    }
  }
  rows = normalizedRows;
  if (rows.length === 0) return { insertedCount: 0, failed: invalid };

  const supabase = createClient();
  // Chunked: `.in()` puts every value in the request URL.
  const existingSet = new Set<string>();
  for (const phoneChunk of chunk(rows.map((r) => r.phone), 100)) {
    const { data: existing, error: existingError } = await supabase
      .from("customers")
      .select("phone")
      .eq("business_id", business.id)
      .in("phone", phoneChunk);
    if (existingError) {
      return { error: existingError.message, insertedCount: 0, failed: [] };
    }
    for (const row of existing ?? []) existingSet.add(row.phone as string);
  }

  let toInsert = rows.filter((r) => !existingSet.has(r.phone));
  const skipped: ImportFailure[] = [...invalid];
  skipped.push(...rows
    .filter((r) => existingSet.has(r.phone))
    .map((r) => ({ rowNumber: r.rowNumber, name: r.name, phone: r.phone, reason: "Already exists in your customer list" })));

  // Phase 16 — a CSV import is the one path that can add many customers in
  // one call, bypassing `createCustomer`'s own per-row check. Rather than
  // failing the whole batch when a plan limit is in the way, import as
  // many rows as fit and report the rest with a clear reason — never a
  // silent drop, and no customer already on file is ever touched.
  const remainingQuota = await getRemainingCustomerQuota(business.id);
  if (remainingQuota !== null && toInsert.length > remainingQuota) {
    const overflow = toInsert.slice(remainingQuota);
    toInsert = toInsert.slice(0, remainingQuota);
    skipped.push(
      ...overflow.map((r) => ({
        rowNumber: r.rowNumber,
        name: r.name,
        phone: r.phone,
        reason: "Your plan's customer limit was reached during this import. Upgrade your plan to import the rest.",
      }))
    );
  }

  if (toInsert.length === 0) {
    return { insertedCount: 0, failed: skipped };
  }

  const consentGiven = options.whatsappConsent === true;
  const consentAt = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("customers")
    .insert(
      toInsert.map((r) => ({
        business_id: business.id,
        name: r.name,
        phone: r.phone,
        notes: r.notes,
        whatsapp_consent: consentGiven,
        consent_source: consentGiven ? "import" : null,
        consent_at: consentGiven ? consentAt : null,
      }))
    )
    .select("id, phone");

  if (insertError) {
    // The unique index (business_id, phone) is the most likely cause here —
    // a race with another concurrent import of the same file. Report every
    // row in this batch as not-imported with a friendly reason rather than
    // guessing which ones actually landed.
    const reason =
      insertError.code === "23505"
        ? "A matching phone number was saved by another import running at the same time."
        : "Could not be saved — please try again or add this customer manually.";
    return {
      insertedCount: 0,
      failed: [...skipped, ...toInsert.map((r) => ({ rowNumber: r.rowNumber, name: r.name, phone: r.phone, reason }))],
    };
  }

  // Milestone 1 — a real `visit` event on the last-visit date (so the
  // opportunity engine sees imported customers) plus the summary note.
  const timeZone = getBusinessTimeZone(business);
  const now = new Date();
  const idByPhone = new Map((inserted ?? []).map((i) => [i.phone as string, i.id as string]));
  const events = toInsert.flatMap((row) => {
    const customerId = idByPhone.get(row.phone);
    if (!customerId) return [];
    const lastVisit = row.lastVisit && /^\d{4}-\d{2}-\d{2}$/.test(row.lastVisit) ? row.lastVisit : null;
    return buildImportedEvents(
      customerId,
      {
        lastVisit,
        service: row.service?.slice(0, 100) ?? null,
        totalSpent: row.totalSpent,
        visitCount: row.visitCount,
      },
      timeZone,
      now
    ).map((e) => ({ ...e, business_id: business.id }));
  });

  if (events.length > 0) {
    const { error: eventsError } = await supabase.from("customer_events").insert(events);
    if (eventsError) {
      // Customers were saved; only their history didn't. Say so rather
      // than reporting a clean import.
      console.error("[import] Failed to save imported visit history.", eventsError.message);
      return {
        insertedCount: inserted?.length ?? 0,
        failed: skipped,
        error: "Customers were imported, but their last-visit history couldn't be saved. Add visits manually or contact support.",
      };
    }
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return { insertedCount: inserted?.length ?? 0, failed: skipped };
}
