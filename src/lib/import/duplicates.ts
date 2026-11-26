import type { NormalizedImportRow } from "@/types/import";

/** Marks the 2nd+ occurrence of each phone number within the file itself as
 * a duplicate — the first occurrence is kept as the "real" one. */
export function markDuplicatesInFile(rows: NormalizedImportRow[]): NormalizedImportRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.phone) return row;
    if (seen.has(row.phone)) {
      return { ...row, isDuplicateInFile: true };
    }
    seen.add(row.phone);
    return row;
  });
}

/** Marks rows whose phone number already belongs to a customer in the
 * current business — `existingPhones` must already be scoped to that
 * business (see `getExistingPhonesForImport`), never fetched globally. */
export function markDuplicatesAgainstExisting(
  rows: NormalizedImportRow[],
  existingPhones: Set<string>
): NormalizedImportRow[] {
  return rows.map((row) => {
    if (!row.phone) return row;
    if (existingPhones.has(row.phone)) {
      return { ...row, isDuplicateExisting: true };
    }
    return row;
  });
}
