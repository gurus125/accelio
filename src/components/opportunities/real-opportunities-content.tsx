"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { RealOpportunityCard } from "@/components/opportunities/real-opportunity-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { Opportunity, OpportunityType } from "@/lib/opportunities/types";
import { Target } from "lucide-react";

const FILTERS: { id: OpportunityType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due_to_return", label: "Due to return" },
  { id: "high_value_inactive", label: "High-value" },
  { id: "inactive", label: "Inactive" },
  { id: "service_reminder", label: "Service reminder" },
  { id: "follow_up", label: "Follow-up" },
];

type SortOption = "recommended" | "most_overdue" | "highest_value";

const SORTS: { id: SortOption; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "most_overdue", label: "Most overdue" },
  { id: "highest_value", label: "Highest value" },
];

interface RealOpportunitiesContentProps {
  opportunities: Opportunity[];
  /** True once the business has at least one customer with enough visit
   * history to be evaluated — lets the empty state tell "nothing to flag
   * right now" apart from "not enough history yet." */
  hasEvaluableCustomers: boolean;
}

export function RealOpportunitiesContent({ opportunities, hasEvaluableCustomers }: RealOpportunitiesContentProps) {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as OpportunityType | null) ?? "all";
  const [filter, setFilter] = React.useState<OpportunityType | "all">(initialFilter);
  const [sort, setSort] = React.useState<SortOption>("recommended");

  const filtered = filter === "all" ? opportunities : opportunities.filter((o) => o.type === filter);

  const sorted = React.useMemo(() => {
    const list = [...filtered];
    if (sort === "most_overdue") {
      list.sort((a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0));
    } else if (sort === "highest_value") {
      list.sort((a, b) => b.totalSpent - a.totalSpent);
    } else {
      list.sort((a, b) => b.score - a.score);
    }
    return list;
  }, [filtered, sort]);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Target}
          title={
            !hasEvaluableCustomers
              ? "Not enough customer history yet"
              : opportunities.length === 0
                ? "No strong opportunities right now"
                : "No opportunities match this filter"
          }
          description={
            !hasEvaluableCustomers
              ? "Once your customers have a few logged visits, Reelo can start spotting who's worth contacting."
              : opportunities.length === 0
                ? "Nothing stands out today — check back after customers' next visits, or as more history builds up."
                : "Try a different filter, or check back after your customers' next visits."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((opp) => (
            <RealOpportunityCard key={opp.id} opportunity={opp} />
          ))}
        </div>
      )}
    </div>
  );
}
