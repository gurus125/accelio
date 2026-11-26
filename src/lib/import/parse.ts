import * as XLSX from "xlsx";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_FILE_SIZE_LABEL = "5MB";

// Phase 19 hardening — a 5MB file limit alone doesn't bound row count (a
// narrow-column CSV can still pack in hundreds of thousands of rows),
// and nothing previously capped it. Bounds the browser-side parse/render
// work and the number of `importCustomerBatch` server-action calls a
// single import can trigger.
export const MAX_IMPORT_ROWS = 20_000;

const EXCEL_EXTENSIONS = [".xlsx", ".xls"];

export type ImportFileError =
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "UNREADABLE_FILE"
  | "NO_DATA_ROWS"
  | "TOO_MANY_ROWS";

export class ImportError extends Error {
  code: ImportFileError;
  constructor(code: ImportFileError) {
    super(code);
    this.code = code;
  }
}

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

export interface ParsedWorkbook {
  sheetNames: string[];
  workbook: XLSX.WorkBook;
}

/** Reads a File into a workbook. Never touches a server — everything here
 * runs in the browser, and the raw file is never uploaded anywhere. */
export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ImportError("FILE_TOO_LARGE");
  }

  const ext = getFileExtension(file.name);
  let workbook: XLSX.WorkBook;

  try {
    if (ext === ".csv") {
      const text = await file.text();
      workbook = XLSX.read(text, { type: "string" });
    } else if (EXCEL_EXTENSIONS.includes(ext)) {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    } else {
      throw new ImportError("UNSUPPORTED_FILE_TYPE");
    }
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("UNREADABLE_FILE");
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new ImportError("UNREADABLE_FILE");
  }

  return { sheetNames: workbook.SheetNames, workbook };
}

export interface SheetTable {
  headers: string[];
  rows: Record<string, string>[];
}

/** Extracts a plain header+rows table from one worksheet — blank rows are
 * dropped, blank header cells get a fallback name, and every value comes
 * back as a trimmed string (dates/numbers included) for the normalizer to
 * interpret. Column order in the file never matters from here on. */
export function extractSheetTable(workbook: XLSX.WorkBook, sheetName: string): SheetTable {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new ImportError("UNREADABLE_FILE");

  let grid: unknown[][];
  try {
    grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  } catch {
    throw new ImportError("UNREADABLE_FILE");
  }

  const nonEmptyRows = grid
    .map((row) => row.map((cell) => (cell == null ? "" : String(cell).trim())))
    .filter((row) => row.some((cell) => cell !== ""));

  if (nonEmptyRows.length === 0) {
    throw new ImportError("NO_DATA_ROWS");
  }

  const rawHeaders = nonEmptyRows[0];
  const headers = rawHeaders.map((h, idx) => (h ? h : `Column ${idx + 1}`));

  const dataRows = nonEmptyRows.slice(1);
  if (dataRows.length === 0) {
    throw new ImportError("NO_DATA_ROWS");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportError("TOO_MANY_ROWS");
  }

  const rows: Record<string, string>[] = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = row[idx] ?? "";
    });
    return record;
  });

  return { headers, rows };
}

export function fileErrorMessage(code: ImportFileError): string {
  switch (code) {
    case "UNSUPPORTED_FILE_TYPE":
      return "This file type isn't supported. Please upload a CSV or Excel file.";
    case "FILE_TOO_LARGE":
      return `This file is larger than the ${MAX_FILE_SIZE_LABEL} limit. Try splitting it into smaller files.`;
    case "NO_DATA_ROWS":
      return "Your file doesn't contain any customer records.";
    case "TOO_MANY_ROWS":
      return `This file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Please split it into smaller files.`;
    case "UNREADABLE_FILE":
    default:
      return "We couldn't read this file. Please check it and try again.";
  }
}
