"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SheetSelectStepProps {
  sheetNames: string[];
  onSelect: (sheetName: string) => void;
  onBack: () => void;
}

export function SheetSelectStep({ sheetNames, onSelect, onBack }: SheetSelectStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Which sheet has your customers?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This file has more than one sheet. Pick the one to import — the others will be left alone.
        </p>
      </div>

      <div className="space-y-2.5">
        {sheetNames.map((name) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-border bg-white p-4 text-left text-sm font-medium transition-colors hover:border-brand-300"
            )}
          >
            <FileSpreadsheet className="h-4 w-4 text-brand-600" />
            {name}
          </button>
        ))}
      </div>

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
