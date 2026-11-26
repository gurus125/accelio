"use client";

import * as React from "react";
import { Download, UploadCloud, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { downloadSampleTemplate } from "@/lib/import/csv-export";
import { MAX_FILE_SIZE_LABEL } from "@/lib/import/parse";

interface FileUploadStepProps {
  onFileSelected: (file: File) => void;
  error: string | null;
  loading: boolean;
}

const ACCEPT = ".csv,.xlsx,.xls";

export function FileUploadStep({ onFileSelected, error, loading }: FileUploadStepProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Import your customers</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Upload a CSV or Excel file containing your customer information.
        </p>
      </div>

      <InlineError message={error} />

      <label
        htmlFor="import-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition-colors",
          dragActive ? "border-brand-500 bg-brand-50/40" : "border-border transition-colors hover:border-brand-300",
          loading && "pointer-events-none opacity-60"
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{loading ? "Reading your file..." : "Click to upload, or drag a file here"}</p>
          <p className="mt-1 text-sm text-muted-foreground">CSV or Excel (.csv, .xlsx, .xls)</p>
          <p className="text-xs text-muted-foreground">Maximum file size: {MAX_FILE_SIZE_LABEL}</p>
        </div>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={loading}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Not sure how to format your file?</p>
            <p className="text-xs text-muted-foreground">Download a sample template with example rows.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={downloadSampleTemplate}>
          <Download className="h-4 w-4" />
          Download sample template
        </Button>
      </div>
    </div>
  );
}
