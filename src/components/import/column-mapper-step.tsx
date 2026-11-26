"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { hasRequiredMapping } from "@/lib/import/mapping";
import { ACCELIO_FIELDS } from "@/types/import";
import type { ColumnMapping, AccelioField } from "@/types/import";

interface ColumnMapperStepProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (header: string, field: AccelioField | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ColumnMapperStep({ headers, mapping, onChange, onBack, onContinue }: ColumnMapperStepProps) {
  const ready = hasRequiredMapping(mapping);

  // A field already mapped to another column can't also be picked here —
  // keeps the mapping one-to-one without needing extra validation copy.
  const usedFields = new Set(Object.values(mapping).filter((v): v is AccelioField => v !== null));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Match your columns</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We&apos;ve made some guesses below — change any of them if they&apos;re wrong. Name and Phone are required.
        </p>
      </div>

      {!ready && <InlineError message="Please map Name and Phone before continuing." />}

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Your column</th>
              <th className="px-4 py-3 font-medium" />
              <th className="px-4 py-3 font-medium">Accelio field</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header) => {
              const current = mapping[header] ?? null;
              return (
                <tr key={header} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{header}</td>
                  <td className="px-2 py-3 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={current ?? ""}
                      onChange={(e) => onChange(header, (e.target.value || null) as AccelioField | null)}
                      className="flex h-9 w-full max-w-[220px] rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <option value="">Don&apos;t import</option>
                      {ACCELIO_FIELDS.map((field) => (
                        <option
                          key={field.id}
                          value={field.id}
                          disabled={usedFields.has(field.id) && current !== field.id}
                        >
                          {field.label}
                          {field.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={!ready}>
          Continue
        </Button>
      </div>
    </div>
  );
}
