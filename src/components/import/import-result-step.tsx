"use client";

import Link from "next/link";
import { PartyPopper, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/import/csv-export";
import type { ImportFailure } from "@/types/import";

interface ImportResultStepProps {
  imported: number;
  skippedDuplicates: number;
  failed: ImportFailure[];
  warnings?: string[];
  onImportAnother: () => void;
}

export function ImportResultStep({ imported, skippedDuplicates, failed, warnings = [], onImportAnother }: ImportResultStepProps) {
  const downloadErrorReport = () => {
    const csv = toCsv(
      ["Name", "Phone", "Reason"],
      failed.map((f) => [f.name, f.phone, f.reason])
    );
    downloadCsv("reelo-import-errors.csv", csv);
  };

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
        <PartyPopper className="h-8 w-8 text-success-600" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">Import complete 🎉</h2>
      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        <p>{imported.toLocaleString("en-IN")} customers imported</p>
        {skippedDuplicates > 0 && <p>{skippedDuplicates.toLocaleString("en-IN")} duplicates skipped</p>}
        {failed.length > 0 && <p>{failed.length.toLocaleString("en-IN")} rows not imported</p>}
      </div>
      {warnings.length > 0 && (
        <div role="alert" className="mt-4 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm dark:border-amber-700 dark:bg-amber-950/30">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {/* Phase 20 — after importing, the payoff is Reelo telling you who
          needs attention, not a bare list of rows. Send people to the
          dashboard's recommendations first ("first value moment"); the
          plain customer list is still one click away for anyone who wants
          to verify the import itself. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {imported > 0 ? (
          <Link href="/dashboard">
            <Button>See what Reelo found</Button>
          </Link>
        ) : (
          <Link href="/customers">
            <Button>View customers</Button>
          </Link>
        )}
        <Button variant="secondary" onClick={onImportAnother}>
          Import another file
        </Button>
        {failed.length > 0 && (
          <Button variant="secondary" onClick={downloadErrorReport}>
            <Download className="h-4 w-4" />
            Download error report
          </Button>
        )}
      </div>
      {imported > 0 && (
        <Link href="/customers" className="mt-4 text-sm font-medium text-brand-600 hover:underline">
          Or view your customer list
        </Link>
      )}
    </div>
  );
}
