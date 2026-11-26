"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ImportStepper, type WizardStep } from "@/components/import/import-stepper";
import { FileUploadStep } from "@/components/import/file-upload-step";
import { SheetSelectStep } from "@/components/import/sheet-select-step";
import { ColumnMapperStep } from "@/components/import/column-mapper-step";
import { ImportReviewStep } from "@/components/import/import-review-step";
import { ImportProgress } from "@/components/import/import-progress";
import { ImportResultStep } from "@/components/import/import-result-step";
import {
  extractSheetTable,
  fileErrorMessage,
  ImportError,
  readWorkbook,
  type ParsedWorkbook,
  type SheetTable,
} from "@/lib/import/parse";
import { suggestMapping } from "@/lib/import/mapping";
import { buildImportRows, computeSummary, isDuplicateRow, willImportRow } from "@/lib/import/validate";
import { markDuplicatesAgainstExisting, markDuplicatesInFile } from "@/lib/import/duplicates";
import { getExistingPhonesForImport, importCustomerBatch, type ImportRowInput } from "@/lib/import/actions";
import type { ColumnMapping, ImportFailure, NormalizedImportRow, ReeloField } from "@/types/import";

const BATCH_SIZE = 200;

export function CustomerImportWizard() {
  const [step, setStep] = React.useState<WizardStep>("upload");
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);

  const [parsedWorkbook, setParsedWorkbook] = React.useState<ParsedWorkbook | null>(null);
  const [sheetTable, setSheetTable] = React.useState<SheetTable | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [rows, setRows] = React.useState<NormalizedImportRow[]>([]);
  const [dedupBusy, setDedupBusy] = React.useState(false);

  const [progressDone, setProgressDone] = React.useState(0);
  const [progressTotal, setProgressTotal] = React.useState(0);
  const [resultImported, setResultImported] = React.useState(0);
  const [resultSkippedDuplicates, setResultSkippedDuplicates] = React.useState(0);
  const [resultFailed, setResultFailed] = React.useState<ImportFailure[]>([]);
  const [resultWarnings, setResultWarnings] = React.useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = React.useState(false);

  const reset = () => {
    setStep("upload");
    setUploadError(null);
    setParsedWorkbook(null);
    setSheetTable(null);
    setMapping({});
    setRows([]);
    setProgressDone(0);
    setProgressTotal(0);
    setResultImported(0);
    setResultSkippedDuplicates(0);
    setResultFailed([]);
    setResultWarnings([]);
    setConsentConfirmed(false);
  };

  const loadSheet = (workbook: ParsedWorkbook, sheetName: string) => {
    try {
      const table = extractSheetTable(workbook.workbook, sheetName);
      setSheetTable(table);
      setMapping(suggestMapping(table.headers));
      setStep("map");
    } catch (err) {
      setUploadError(err instanceof ImportError ? fileErrorMessage(err.code) : fileErrorMessage("UNREADABLE_FILE"));
      setStep("upload");
    }
  };

  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    setParsing(true);
    try {
      const workbook = await readWorkbook(file);
      if (workbook.sheetNames.length > 1) {
        // Stay on the "Upload" step visually — the sheet-select screen
        // renders in its place once parsedWorkbook is set with no sheetTable yet.
        setSheetTable(null);
        setParsedWorkbook(workbook);
      } else {
        setParsedWorkbook(workbook);
        loadSheet(workbook, workbook.sheetNames[0]);
      }
    } catch (err) {
      setUploadError(err instanceof ImportError ? fileErrorMessage(err.code) : fileErrorMessage("UNREADABLE_FILE"));
    } finally {
      setParsing(false);
    }
  };

  const handleMappingChange = (header: string, field: ReeloField | null) => {
    setMapping((prev) => ({ ...prev, [header]: field }));
  };

  const handleContinueFromMapping = async () => {
    if (!sheetTable) return;
    setDedupBusy(true);
    const built = markDuplicatesInFile(buildImportRows(sheetTable.rows, mapping));

    const { phones, error } = await getExistingPhonesForImport();
    const withExisting = error ? built : markDuplicatesAgainstExisting(built, new Set(phones ?? []));

    setRows(withExisting);
    setDedupBusy(false);
    setStep("review");
  };

  const handleImport = async () => {
    const candidates = rows.filter(willImportRow);
    setProgressTotal(candidates.length);
    setProgressDone(0);
    setStep("importing");

    let imported = 0;
    const failed: ImportFailure[] = [];
    const warnings = new Set<string>();

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const input: ImportRowInput[] = batch.map((r) => ({
        rowNumber: r.rowNumber,
        name: r.name as string,
        phone: r.phone as string,
        email: r.email,
        lastVisit: r.lastVisit,
        service: r.service,
        totalSpent: r.totalSpent,
        visitCount: r.visitCount,
        notes: r.notes,
      }));

      const outcome = await importCustomerBatch(input, { whatsappConsent: consentConfirmed });
      imported += outcome.insertedCount;
      failed.push(...outcome.failed);
      if (outcome.error) {
        if (outcome.insertedCount === 0 && outcome.failed.length === 0) {
          // The whole batch was refused — report each row, never drop silently.
          failed.push(...input.map((r) => ({ rowNumber: r.rowNumber, name: r.name, phone: r.phone, reason: outcome.error as string })));
        } else {
          warnings.add(outcome.error);
        }
      }
      setProgressDone((d) => d + batch.length);
    }

    const duplicatesSkippedAtImport = failed.filter((f) => f.reason.startsWith("Already exists")).length;
    const otherFailures = failed.filter((f) => !f.reason.startsWith("Already exists"));

    const needsAttentionRows = rows.filter((r) => r.validity === "invalid" && !isDuplicateRow(r));
    const needsAttentionFailures: ImportFailure[] = needsAttentionRows.map((r) => ({
      rowNumber: r.rowNumber,
      name: r.name ?? "",
      phone: r.phoneRaw,
      reason: r.issues.join(" ") || "Couldn't be imported.",
    }));

    const duplicateRowCount = rows.filter(isDuplicateRow).length;

    setResultImported(imported);
    setResultSkippedDuplicates(duplicateRowCount + duplicatesSkippedAtImport);
    setResultFailed([...otherFailures, ...needsAttentionFailures]);
    setResultWarnings(Array.from(warnings));
    setStep("done");
  };

  const summary = React.useMemo(() => computeSummary(rows), [rows]);
  const showingSheetPicker = parsedWorkbook && !sheetTable && step === "upload";

  return (
    <Card>
      <CardContent className="space-y-8 p-6 sm:p-8">
        {step !== "done" && (
          <div className="flex justify-center">
            <ImportStepper current={step} />
          </div>
        )}

        {step === "upload" && !showingSheetPicker && (
          <FileUploadStep onFileSelected={handleFileSelected} error={uploadError} loading={parsing} />
        )}

        {showingSheetPicker && parsedWorkbook && (
          <SheetSelectStep
            sheetNames={parsedWorkbook.sheetNames}
            onSelect={(name) => loadSheet(parsedWorkbook, name)}
            onBack={() => setParsedWorkbook(null)}
          />
        )}

        {step === "map" && sheetTable && (
          <ColumnMapperStep
            headers={sheetTable.headers}
            mapping={mapping}
            onChange={handleMappingChange}
            onBack={() => {
              setSheetTable(null);
              setParsedWorkbook(null);
              setStep("upload");
            }}
            onContinue={handleContinueFromMapping}
          />
        )}

        {step === "map" && dedupBusy && (
          <p className="text-center text-sm text-muted-foreground">Checking your existing customers...</p>
        )}

        {step === "review" && (
          <ImportReviewStep
            rows={rows}
            summary={summary}
            onBack={() => setStep("map")}
            onImport={handleImport}
            consentConfirmed={consentConfirmed}
            onConsentChange={setConsentConfirmed}
          />
        )}

        {step === "importing" && <ImportProgress done={progressDone} total={progressTotal} />}

        {step === "done" && (
          <ImportResultStep
            imported={resultImported}
            skippedDuplicates={resultSkippedDuplicates}
            failed={resultFailed}
            warnings={resultWarnings}
            onImportAnother={reset}
          />
        )}
      </CardContent>
    </Card>
  );
}
