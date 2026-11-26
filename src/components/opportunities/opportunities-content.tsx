"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { getAllOpportunities } from "@/lib/opportunity-engine";
import { getCustomerById } from "@/lib/mock-data";
import type { OpportunityReason } from "@/types";
import { Target } from "lucide-react";

const FILTERS: { id: OpportunityReason | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due_to_return", label: "Due to return" },
  { id: "inactive", label: "Inactive" },
  { id: "follow_up", label: "Follow-up" },
  { id: "offer", label: "Offers" },
];

export function OpportunitiesContent() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as OpportunityReason | null) ?? "all";
  const [filter, setFilter] = React.useState<OpportunityReason | "all">(initialFilter);

  const opportunities = getAllOpportunities();
  const filtered = filter === "all" ? opportunities : opportunities.filter((o) => o.reason === filter);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-8">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No opportunities here"
          description="Nothing matches this filter right now — check back after your next sync."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((opp) => {
            const customer = getCustomerById(opp.customerId);
            if (!customer) return null;
            return <OpportunityCard key={opp.id} customer={customer} opportunity={opp} />;
          })}
        </div>
      )}
    </div>
  );
}
