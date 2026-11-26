"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import { getRemainingCustomerQuota } from "@/lib/billing/limits";
import type { ImportBatchOutcome, ImportFailure } from "@/types/import";

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
  const { data, error } = await supabase
    .from("customers")
    .select("phone")
    .eq("business_id", business.id);

  if (error) return { error: error.message };
  return { phones: (data ?? []).map((row) => row.phone) };
}

export interface ImportRowInput {
  rowNumber: number;
  name: string;
  phone: string;
  email: string | null;
  lastVisit: string | null;
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

export async function importCustomerBatch(rows: ImportRowInput[]): Promise<ImportBatchOutcome> {
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

  const supabase = createClient();
  const phones = rows.map((r) => r.phone);

  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("phone")
    .eq("business_id", business.id)
    .in("phone", phones);

  if (existingError) {
    return { error: existingError.message, insertedCount: 0, failed: [] };
  }

  const existingSet = new Set((existing ?? []).map((row) => row.phone));
  let toInsert = rows.filter((r) => !existingSet.has(r.phone));
  const skipped: ImportFailure[] = rows
    .filter((r) => existingSet.has(r.phone))
    .map((r) => ({ rowNumber: r.rowNumber, name: r.name, phone: r.phone, reason: "Already exists in your customer list" }));

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

  const { data: inserted, error: insertError } = await supabase
    .from("customers")
    .insert(
      toInsert.map((r) => ({
        business_id: business.id,
        name: r.name,
        phone: r.phone,
        notes: r.notes,
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

  // Best-effort: one summarizing "imported" activity event per new customer
  // that actually had spend/visit/date info in the file — never fabricated
  // individual visit dates we don't have.
  const events = toInsert
    .map((row) => {
      const match = inserted?.find((i) => i.phone === row.phone);
      if (!match) return null;
      if (row.totalSpent == null && row.visitCount == null && row.lastVisit == null) return null;

      const noteParts = ["Imported customer record"];
      if (row.visitCount != null) {
        noteParts.push(`${row.visitCount} visit${row.visitCount === 1 ? "" : "s"} on record`);
      }

      return {
        business_id: business.id,
        customer_id: match.id,
        event_type: "other" as const,
        amount: row.totalSpent,
        occurred_at: row.lastVisit ?? new Date().toISOString(),
        notes: noteParts.join(" — "),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (events.length > 0) {
    await supabase.from("customer_events").insert(events);
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return { insertedCount: inserted?.length ?? 0, failed: skipped };
}
