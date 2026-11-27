/** Types for the Phase 5 CSV/Excel customer import wizard. */

export type AccelioField = "name" | "phone" | "email" | "lastVisit" | "service" | "totalSpent" | "visitCount" | "notes";

export interface AccelioFieldDef {
  id: AccelioField;
  label: string;
  required: boolean;
}

export const ACCELIO_FIELDS: AccelioFieldDef[] = [
  { id: "name", label: "Name", required: true },
  { id: "phone", label: "Phone", required: true },
  { id: "email", label: "Email", required: false },
  { id: "lastVisit", label: "Last Visit", required: false },
  { id: "service", label: "Last Service", required: false },
  { id: "totalSpent", label: "Total Spent", required: false },
  { id: "visitCount", label: "Visit Count", required: false },
  { id: "notes", label: "Notes", required: false },
];

/** Maps a column header from the uploaded file to a Accelio field, or null if unmapped. */
export type ColumnMapping = Record<string, AccelioField | null>;

export type RowValidity = "ready" | "warning" | "invalid";

export interface NormalizedImportRow {
  /** 1-based row number as it appears in the uploaded file (header row is row 1). */
  rowNumber: number;
  name: string | null;
  phone: string | null;
  phoneRaw: string;
  email: string | null;
  lastVisit: string | null; // ISO date (yyyy-mm-dd)
  lastVisitRaw: string;
  service: string | null;
  totalSpent: number | null;
  visitCount: number | null;
  notes: string | null;
  validity: RowValidity;
  issues: string[];
  isDuplicateInFile: boolean;
  isDuplicateExisting: boolean;
}

export interface ImportSummary {
  total: number;
  /** Rows that pass validation regardless of warnings and are not duplicates — i.e. will actually be imported. */
  willImport: number;
  /** Distinct rows flagged as a duplicate (in-file, existing, or both) — counted once each. */
  duplicatesTotal: number;
  /** Invalid rows that are NOT also duplicates — these are what "need attention" before they can be imported. */
  needsAttention: number;
  warnings: number;
  invalid: number;
  duplicatesInFile: number;
  duplicatesExisting: number;
}

export interface ImportFailure {
  rowNumber: number;
  name: string;
  phone: string;
  reason: string;
}

export interface ImportBatchOutcome {
  error?: string;
  insertedCount: number;
  failed: ImportFailure[];
}
