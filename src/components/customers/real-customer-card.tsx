import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { formatINR, formatPhone } from "@/lib/utils";
import { formatLastVisit } from "@/lib/customers/mappers";
import type { RealCustomer } from "@/types/database";

export function RealCustomerCard({ customer }: { customer: RealCustomer }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={customer.name} />
        <div className="min-w-0">
          <p className="truncate font-medium">{customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">{formatPhone(customer.phone)}</p>
        </div>
      </div>
      <div className="hidden shrink-0 text-right text-sm sm:block">
        <p className="text-muted-foreground">{formatLastVisit(customer.lastVisitAt)}</p>
        <p className="font-medium">{formatINR(customer.totalSpent)}</p>
      </div>
      <div className="shrink-0">
        <StatusBadge status={customer.status} />
      </div>
    </Link>
  );
}
