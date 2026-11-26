"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ANALYTICS_RANGE_OPTIONS, type AnalyticsRangeKey } from "@/lib/analytics/date-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  activeKey: AnalyticsRangeKey;
  from?: string;
  to?: string;
}

/** Client-side date filter for /analytics. Writes the selection into the
 * URL's query string (?range=7d / ?range=custom&from=...&to=...) rather
 * than component state, so the filtered view is a real, shareable/
 * refreshable URL and every server-rendered section reads the same source
 * of truth (Phase 11 section 4: "Date filters must affect relevant
 * analytics consistently"). */
export function DateRangeFilter({ activeKey, from, to }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function applyRange(key: AnalyticsRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    if (key !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ANALYTICS_RANGE_OPTIONS.filter((o) => o.key !== "custom").map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => applyRange(option.key)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            activeKey === option.key
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-border bg-white text-muted-foreground transition-colors hover:bg-muted"
          )}
        >
          {option.label}
        </button>
      ))}

      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-2 py-1.5",
          activeKey === "custom" ? "border-brand-500 bg-brand-50" : "border-border bg-white"
        )}
      >
        <Input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="h-7 w-[135px] border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="h-7 w-[135px] border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          aria-label="To date"
        />
        <Button type="button" size="sm" variant={activeKey === "custom" ? "default" : "outline"} onClick={applyCustomRange}>
          Apply
        </Button>
      </div>
    </div>
  );
}
