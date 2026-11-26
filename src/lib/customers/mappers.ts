import type { CustomerEventRow } from "@/types/database";

export interface CustomerStats {
  visitCount: number;
  totalSpent: number;
  lastVisitAt: string | null;
}

/** Honest, non-intelligent aggregates from a customer's events — a count and
 * a sum, nothing inferred or predicted. */
export function computeCustomerStats(events: CustomerEventRow[]): CustomerStats {
  const visits = events.filter((e) => e.event_type === "visit");
  const totalSpent = visits.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const lastVisitAt = events.reduce<string | null>((latest, e) => {
    if (!latest) return e.occurred_at;
    return new Date(e.occurred_at).getTime() > new Date(latest).getTime() ? e.occurred_at : latest;
  }, null);

  return { visitCount: visits.length, totalSpent, lastVisitAt };
}

export function daysAgo(iso: string): number {
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatLastVisit(iso: string | null): string {
  if (!iso) return "No visits yet";
  const days = daysAgo(iso);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
