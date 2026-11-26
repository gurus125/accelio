"use client";

import * as React from "react";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomerCard } from "@/components/customers/customer-card";
import { CustomerTable } from "@/components/customers/customer-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { CUSTOMERS } from "@/lib/mock-data";
import type { CustomerStatus } from "@/types";

const FILTERS: { id: CustomerStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "due", label: "Due" },
  { id: "inactive", label: "Inactive" },
];

export function CustomersContent() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<CustomerStatus | "all">("all");

  const filtered = CUSTOMERS.filter((c) => {
    const matchesQuery =
      query.trim().length === 0 ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phone.includes(query);
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesQuery && matchesFilter;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers..."
            aria-label="Search customers"
            className="pl-9"
          />
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
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {CUSTOMERS.length} customers
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description="Try a different search term or filter." />
      ) : (
        <>
          <CustomerTable customers={filtered} />
          <div className="space-y-3 sm:hidden">
            {filtered.map((c) => (
              <CustomerCard key={c.id} customer={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
