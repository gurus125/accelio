/** Tiny CSV builder + browser download helper — used for both the sample
 * import template and the post-import error report. No server round trip;
 * everything happens in the browser. */

/** A cell starting with =, +, -, @, tab, or CR is a live formula to
 * Excel/Sheets/LibreOffice when the CSV is reopened there — a classic CSV
 * injection vector (OWASP: CSV Injection) if the value ever originated
 * from imported/user-controlled data (a customer name, a phone number
 * typed as "=1+1", etc.). Prefixing a leading apostrophe neutralizes it —
 * every spreadsheet app treats a leading `'` as "force this cell to
 * plain text" and never shows the apostrophe itself. */
function neutralizeFormulaInjection(str: string): string {
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function escapeCsvCell(value: string | number): string {
  const str = neutralizeFormulaInjection(String(value));
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleTemplate() {
  const headers = ["Name", "Phone", "Email", "Last Visit", "Total Spent", "Visit Count", "Notes"];
  const rows: (string | number)[][] = [
    ["Rahul Sharma", "9876543210", "rahul@example.com", "2026-06-01", 4800, 8, "Regular customer"],
    ["Priya Verma", "9821345678", "priya@example.com", "2026-07-10", 7200, 12, "High-value customer"],
  ];
  downloadCsv("accelio-customer-import-template.csv", toCsv(headers, rows));
}
