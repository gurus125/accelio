"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isDuplicateRow, willImportRow } from "@/lib/import/validate";
import type { ImportSummary, NormalizedImportRow } from "@/types/import";

type FilterId = "all" | "ready" | "warnings" | "invalid" | "duplicates";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "warnings", label: "Warnings" },
  { id: "invalid", label: "Invalid" },
  { id: "duplicates", label: "Duplicates" },
];

function rowMatchesFilter(row: NormalizedImportRow, filter: FilterId): boolean {
  switch (filter) {
    case "ready":
      return willImportRow(row) && row.validity === "ready";
    case "warnings":
      return row.validity === "warning" && !isDuplicateRow(row);
    case "invalid":
      return row.validity === "invalid" && !isDuplicateRow(row);
    case "duplicates":
      return isDuplicateRow(row);
    case "all":
    default:
      return true;
  }
}

function StatusPill({ row }: { row: NormalizedImportRow }) {
  if (isDuplicateRow(row)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <Copy className="h-3 w-3" />
        Duplicate
      </span>
    );
  }
  if (row.validity === "invalid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-600">
        <XCircle className="h-3 w-3" />
        Invalid
      </span>
    );
  }
  if (row.validity === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-600">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600">
      <CheckCircle2 className="h-3 w-3" />
      Ready
    </span>
  );
}

interface ImportReviewStepProps {
  rows: NormalizedImportRow[];
  summary: ImportSummary;
  onBack: () => void;
  onImport: () => void;
  /** Milestone 1 — owner confirms these customers agreed to WhatsApp. */
  consentConfirmed: boolean;
  onConsentChange: (value: boolean) => void;
}

export function ImportReviewStep({ rows, summary, onBack, onImport, consentConfirmed, onConsentChange }: ImportReviewStepProps) {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const filtered = rows.filter((r) => rowMatchesFilter(r, filter));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Review your import</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {summary.total.toLocaleString("en-IN")} rows found — {summary.willImport.toLocaleString("en-IN")} ready to
          import, {summary.duplicatesTotal.toLocaleString("en-IN")} duplicates,{" "}
          {summary.needsAttention.toLocaleString("en-IN")} need attention.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-border bg-white text-muted-foreground transition-colors hover:border-brand-200"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="max-h-[420px] overflow-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.rowNumber} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.name ?? <span className="text-danger-600">Missing</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.phone ?? (row.phoneRaw || "—")}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.lastVisit ?? (row.lastVisitRaw || "—")}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <StatusPill row={row} />
                    {row.issues.length > 0 && (
                      <p className="text-xs text-muted-foreground">{row.issues.join(" ")}</p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No rows match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>{summary.willImport.toLocaleString("en-IN")} customers will be added.</p>
        {summary.duplicatesTotal > 0 && <p>{summary.duplicatesTotal.toLocaleString("en-IN")} duplicates will be skipped.</p>}
        {summary.needsAttention > 0 && <p>{summary.needsAttention.toLocaleString("en-IN")} rows need attention and won&apos;t be imported.</p>}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
          checked={consentConfirmed}
          onChange={(e) => onConsentChange(e.target.checked)}
        />
        <span>
          <span className="font-medium">These customers agreed to get WhatsApp reminders &amp; offers from my business</span>
          <span className="block text-muted-foreground">
            Leave unticked if you&apos;re not sure — they&apos;ll still be imported, but no reminder or offer will be sent to
            them until you record their consent (or they come in and agree at billing).
          </span>
        </span>
      </label>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>
          Go back
        </Button>
        <Button onClick={onImport} disabled={summary.willImport === 0}>
          Import {summary.willImport.toLocaleString("en-IN")} customers
        </Button>
      </div>
    </div>
  );
}
