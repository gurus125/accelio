import type { ColumnMapping, ImportSummary, NormalizedImportRow } from "@/types/import";
import { mappedField } from "@/lib/import/mapping";
import {
  normalizeAmount,
  normalizeDate,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeVisitCount,
} from "@/lib/import/normalize";

/** Turns raw file rows into validated, normalized rows using the user's
 * column mapping. Duplicate detection is a separate pass (see duplicates.ts)
 * since it needs to see every row at once. */
export function buildImportRows(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping
): NormalizedImportRow[] {
  const nameCol = mappedField(mapping, "name");
  const phoneCol = mappedField(mapping, "phone");
  const emailCol = mappedField(mapping, "email");
  const lastVisitCol = mappedField(mapping, "lastVisit");
  const totalSpentCol = mappedField(mapping, "totalSpent");
  const visitCountCol = mappedField(mapping, "visitCount");
  const notesCol = mappedField(mapping, "notes");
  const serviceCol = mappedField(mapping, "service");

  return rawRows.map((raw, idx) => {
    // rowNumber: +2 because row 1 is the header and idx is 0-based.
    const rowNumber = idx + 2;
    const issues: string[] = [];

    const name = normalizeName(nameCol ? raw[nameCol] : undefined);
    const phone = normalizePhone(phoneCol ? raw[phoneCol] : undefined);
    const email = normalizeEmail(emailCol ? raw[emailCol] : undefined);
    const lastVisit = normalizeDate(lastVisitCol ? raw[lastVisitCol] : undefined);
    const totalSpent = normalizeAmount(totalSpentCol ? raw[totalSpentCol] : undefined);
    const visitCount = normalizeVisitCount(visitCountCol ? raw[visitCountCol] : undefined);
    const notes = notesCol ? (raw[notesCol] ?? "").trim() || null : null;
    const service = serviceCol ? (raw[serviceCol] ?? "").trim().slice(0, 100) || null : null;

    let invalid = false;

    if (!name) {
      issues.push("Name is missing.");
      invalid = true;
    }
    if (!phone.raw) {
      issues.push("Phone number is missing.");
      invalid = true;
    } else if (!phone.valid) {
      issues.push("Phone number doesn't look valid.");
      invalid = true;
    }

    let warning = false;
    if (email.value && !email.valid) {
      issues.push("Email address format looks off.");
      warning = true;
    }
    if (totalSpentCol && raw[totalSpentCol] && !totalSpent.valid) {
      issues.push("Total spent isn't a number.");
      warning = true;
    }
    if (visitCountCol && raw[visitCountCol] && !visitCount.valid) {
      issues.push("Visit count isn't a whole number.");
      warning = true;
    }
    if (lastVisit.status === "ambiguous") {
      issues.push("Last visit date is ambiguous — please check it after import.");
      warning = true;
    } else if (lastVisit.status === "invalid") {
      issues.push("Last visit date couldn't be understood.");
      warning = true;
    }

    return {
      rowNumber,
      name,
      phone: phone.value,
      phoneRaw: phone.raw,
      email: email.valid ? email.value : null,
      lastVisit: lastVisit.value,
      lastVisitRaw: lastVisit.raw,
      service,
      totalSpent: totalSpent.valid ? totalSpent.value : null,
      visitCount: visitCount.valid ? visitCount.value : null,
      notes,
      validity: invalid ? "invalid" : warning ? "warning" : "ready",
      issues,
      isDuplicateInFile: false,
      isDuplicateExisting: false,
    };
  });
}

/** A row is actually imported only if it's not invalid and not a duplicate
 * of any kind — matches the "skip duplicates" safe default from the spec. */
export function willImportRow(row: NormalizedImportRow): boolean {
  return row.validity !== "invalid" && !row.isDuplicateInFile && !row.isDuplicateExisting;
}

export function isDuplicateRow(row: NormalizedImportRow): boolean {
  return row.isDuplicateInFile || row.isDuplicateExisting;
}

export function computeSummary(rows: NormalizedImportRow[]): ImportSummary {
  return {
    total: rows.length,
    willImport: rows.filter(willImportRow).length,
    duplicatesTotal: rows.filter(isDuplicateRow).length,
    needsAttention: rows.filter((r) => r.validity === "invalid" && !isDuplicateRow(r)).length,
    warnings: rows.filter((r) => r.validity === "warning").length,
    invalid: rows.filter((r) => r.validity === "invalid").length,
    duplicatesInFile: rows.filter((r) => r.isDuplicateInFile).length,
    duplicatesExisting: rows.filter((r) => r.isDuplicateExisting).length,
  };
}
