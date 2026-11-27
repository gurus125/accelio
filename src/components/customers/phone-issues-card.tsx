import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import type { CustomerPhoneIssue } from "@/lib/customers/queries";

/** Owner-facing report of customers that share a phone number, or whose
 * number isn't a valid Indian mobile. Nothing here is merged or changed
 * automatically — each row links to the customer so the owner can fix or
 * delete it themselves. */
export function PhoneIssuesCard({ issues }: { issues: CustomerPhoneIssue[] }) {
  if (issues.length === 0) return null;

  const duplicates = issues.filter((i) => i.issue === "duplicate");
  const invalid = issues.filter((i) => i.issue === "invalid_phone");

  const groups = new Map<string, CustomerPhoneIssue[]>();
  for (const row of duplicates) {
    const key = row.normalized_phone ?? row.phone;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <details className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        {groups.size > 0 && `${groups.size} possible duplicate${groups.size === 1 ? "" : "s"}`}
        {groups.size > 0 && invalid.length > 0 && " · "}
        {invalid.length > 0 && `${invalid.length} invalid phone number${invalid.length === 1 ? "" : "s"}`}
        <span className="font-normal text-muted-foreground">— tap to review</span>
      </summary>

      <p className="mt-2 text-muted-foreground">
        Nothing has been merged or deleted. Open each customer to fix the number, or delete the extra copy.
      </p>

      {groups.size > 0 && (
        <ul className="mt-3 space-y-2">
          {Array.from(groups.entries()).map(([phone, rows]) => (
            <li key={phone} className="rounded-xl bg-background p-3">
              <p className="font-medium">{formatPhone(phone)}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {rows.map((row) => (
                  <Link
                    key={row.customer_id}
                    href={`/customers/${row.customer_id}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted"
                  >
                    {row.name} <span className="ml-1 text-xs text-muted-foreground">({row.phone})</span>
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {invalid.length > 0 && (
        <div className="mt-3 rounded-xl bg-background p-3">
          <p className="font-medium">Not a valid Indian mobile number — WhatsApp can&apos;t reach these</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {invalid.map((row) => (
              <Link
                key={row.customer_id}
                href={`/customers/${row.customer_id}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted"
              >
                {row.name} <span className="ml-1 text-xs text-muted-foreground">({row.phone || "no number"})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}
