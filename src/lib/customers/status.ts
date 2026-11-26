/**
 * Milestone 1 — a customer's status is DERIVED from the opportunity
 * engine, never typed in by hand. The old manual `customers.status`
 * dropdown drifted out of sync with what the engine (and therefore
 * reminders, campaigns and the dashboard) actually believed.
 *
 * Pure (no Supabase import) so it is unit-tested in scripts/status-tests.ts.
 */

import type { CustomerStatus } from "@/types";
import type { Opportunity, OpportunityType } from "@/lib/opportunities/types";

/** "new" = no visit recorded yet, so the engine has nothing to go on. */
export type DerivedCustomerStatus = CustomerStatus | "new";

const STATUS_BY_OPPORTUNITY: Record<OpportunityType, CustomerStatus> = {
  due_to_return: "due",
  service_reminder: "due",
  inactive: "inactive",
  high_value_inactive: "inactive",
  follow_up: "follow_up",
};

export function deriveCustomerStatus(opportunity: Opportunity | null | undefined, visitCount: number): DerivedCustomerStatus {
  if (opportunity) return STATUS_BY_OPPORTUNITY[opportunity.type];
  return visitCount > 0 ? "active" : "new";
}

export function countCustomersByStatus(statuses: DerivedCustomerStatus[]): Record<DerivedCustomerStatus, number> {
  const counts: Record<DerivedCustomerStatus, number> = { active: 0, due: 0, inactive: 0, follow_up: 0, new: 0 };
  for (const s of statuses) counts[s] += 1;
  return counts;
}
