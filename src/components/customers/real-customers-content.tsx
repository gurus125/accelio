"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Upload, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RealCustomerCard } from "@/components/customers/real-customer-card";
import { RealCustomerTable } from "@/components/customers/real-customer-table";
import { AddCustomerButton } from "@/components/customers/add-customer-button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { DerivedCustomerStatus } from "@/lib/customers/status";
import type { RealCustomer } from "@/types/database";

const FILTERS: { id: DerivedCustomerStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "due", label: "Due" },
  { id: "inactive", label: "Inactive" },
  { id: "follow_up", label: "Follow up" },
  { id: "new", label: "No visits yet" },
];

export function RealCustomersContent({ customers }: { customers: RealCustomer[] }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<DerivedCustomerStatus | "all">("all");

  // Phones are stored as "+91XXXXXXXXXX"; match on digits so "98765 43210"
  // finds them too.
  const queryDigits = query.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  const filtered = customers.filter((c) => {
    const matchesQuery =
      query.trim().length === 0 ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phone.includes(query) ||
      (queryDigits.length >= 3 && c.phone.replace(/\D/g, "").includes(queryDigits));
    const matchesFilter = filter === "all" || c.derivedStatus === filter;
    return matchesQuery && matchesFilter;
  });

  if (customers.length === 0) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-8">
        <EmptyState
          icon={Users}
          title="Your customer list is empty."
          description="Import your existing customers to start finding opportunities."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/customers/import">
                <Button size="sm">
                  <Upload className="h-4 w-4" />
                  Import customers
                </Button>
              </Link>
              <AddCustomerButton label="Add customer manually" variant="secondary" />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers..."
            aria-label="Search customers"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Link href="/customers/import">
            <Button size="sm" variant="secondary">
              <Upload className="h-4 w-4" />
              Import customers
            </Button>
          </Link>
          <AddCustomerButton />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {customers.length} customers
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description="Try a different search term or filter." />
      ) : (
        <>
          <RealCustomerTable customers={filtered} />
          <div className="space-y-3 sm:hidden">
            {filtered.map((c) => (
              <RealCustomerCard key={c.id} customer={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
