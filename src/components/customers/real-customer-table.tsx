import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { formatINR, formatPhone } from "@/lib/utils";
import { formatLastVisit } from "@/lib/customers/mappers";
import type { RealCustomer } from "@/types/database";

export function RealCustomerTable({ customers }: { customers: RealCustomer[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Last visit</th>
            <th className="px-4 py-3 font-medium">Visits</th>
            <th className="px-4 py-3 font-medium">Total spent</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
              <td className="px-4 py-3">
                <Link href={`/customers/${customer.id}`} className="flex items-center gap-3">
                  <Avatar name={customer.name} size="sm" />
                  <div>
                    <p className="font-medium leading-tight">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</p>
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatLastVisit(customer.lastVisitAt)}</td>
              <td className="px-4 py-3">{customer.visitCount}</td>
              <td className="px-4 py-3 font-medium">{formatINR(customer.totalSpent)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={customer.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
