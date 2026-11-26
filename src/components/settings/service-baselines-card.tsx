"use client";

/**
 * Settings -> "Service return intervals" — tier 1 of the opportunity
 * engine's baseline hierarchy (see `lib/opportunities/service-defaults.ts`
 * for tiers 2-3, the built-in defaults this overrides). Deliberately
 * simple: a short list of service -> expected-return-days rows, editable
 * inline, with services observed in real visit history suggested so the
 * owner doesn't have to type them from memory.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/inline-error";
import { deleteServiceBaselineAction, saveServiceBaselineAction } from "@/lib/opportunities/baseline-actions";
import type { ServiceBaselineRow } from "@/types/database";

interface ServiceBaselinesCardProps {
  baselines: ServiceBaselineRow[];
  suggestedServices: string[];
}

export function ServiceBaselinesCard({ baselines, suggestedServices }: ServiceBaselinesCardProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [newService, setNewService] = React.useState("");
  const [newDays, setNewDays] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const configuredServiceNames = new Set(baselines.map((b) => b.service.trim().toLowerCase()));
  const unconfiguredSuggestions = suggestedServices.filter((s) => !configuredServiceNames.has(s.toLowerCase()));

  const handleUpdate = async (baseline: ServiceBaselineRow, days: string) => {
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a positive number of days.");
      return;
    }
    setSavingId(baseline.id);
    setError(null);
    const result = await saveServiceBaselineAction(baseline.service, parsed);
    setSavingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleDelete = async (baseline: ServiceBaselineRow) => {
    setSavingId(baseline.id);
    setError(null);
    const result = await deleteServiceBaselineAction(baseline.id);
    setSavingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleAdd = async (service: string) => {
    const trimmedService = service.trim();
    const parsedDays = Number(newDays);
    if (!trimmedService) {
      setError("Enter a service name.");
      return;
    }
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      setError("Enter a positive number of days.");
      return;
    }
    setAdding(true);
    setError(null);
    const result = await saveServiceBaselineAction(trimmedService, parsedDays);
    setAdding(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewService("");
    setNewDays("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <InlineError message={error} />
      <p className="text-sm text-muted-foreground">
        Tell Reelo how often customers should return for each service. New customers can get a relevant
        recommendation from their first visit — before Reelo has learned their own pattern — using whichever of
        these you set. Leave a service unconfigured and Reelo falls back to a reasonable general default where one
        exists, or stays quiet rather than guessing.
      </p>

      {baselines.length > 0 && (
        <div className="space-y-2">
          {baselines.map((baseline) => (
            <div key={baseline.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <p className="min-w-0 flex-1 truncate font-medium">{baseline.service}</p>
              <Input
                type="number"
                min={1}
                defaultValue={baseline.expected_return_days}
                className="w-24"
                onBlur={(e) => {
                  if (Number(e.target.value) !== baseline.expected_return_days) {
                    handleUpdate(baseline, e.target.value);
                  }
                }}
                disabled={savingId === baseline.id}
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(baseline)}
                disabled={savingId === baseline.id}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {unconfiguredSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Services your customers already have visit history for, not yet configured:
          </p>
          <div className="flex flex-wrap gap-2">
            {unconfiguredSuggestions.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => setNewService(service)}
                className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted"
              >
                + {service}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="text-xs font-medium" htmlFor="new-service-name">
            Service name
          </label>
          <Input
            id="new-service-name"
            value={newService}
            onChange={(e) => setNewService(e.target.value)}
            placeholder="e.g. Haircut"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="new-service-days">
            Expected return (days)
          </label>
          <Input
            id="new-service-days"
            type="number"
            min={1}
            className="w-28"
            value={newDays}
            onChange={(e) => setNewDays(e.target.value)}
            placeholder="30"
          />
        </div>
        <Button size="sm" onClick={() => handleAdd(newService)} disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}
