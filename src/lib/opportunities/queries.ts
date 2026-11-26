import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCustomer, listCustomers, listEventsForBusiness, listEventsForCustomer } from "@/lib/customers/queries";
import { listServiceBaselines } from "./baselines";
import { calculateOpportunities, calculateOpportunityForCustomer, groupEventsByCustomer } from "./calculate";
import type { Opportunity } from "./types";

/**
 * All opportunities for the signed-in user's business, ranked highest
 * priority first. Reuses the same business-scoped, RLS-protected queries
 * as the rest of the app (`listCustomers` / `listEventsForBusiness`) — this
 * file adds no new database access paths and no new tables beyond the
 * business's own `service_baselines` (tier 1 of the baseline hierarchy).
 */
export async function getOpportunitiesForCurrentBusiness(): Promise<Opportunity[]> {
  const business = await getBusinessForCurrentUser();
  if (!business) return [];

  const [customers, events, serviceBaselines] = await Promise.all([
    listCustomers(business.id),
    listEventsForBusiness(business.id),
    listServiceBaselines(business.id),
  ]);

  const eventsByCustomerId = groupEventsByCustomer(events);
  return calculateOpportunities(customers, eventsByCustomerId, business, serviceBaselines);
}

/** The single opportunity (if any) for one customer, for the customer
 * profile page's recommendation card. Returns null both when there's no
 * opportunity and when the customer doesn't belong to the current
 * business — callers already 404 on the latter via `getCustomer`. */
export async function getOpportunityForCustomer(customerId: string): Promise<Opportunity | null> {
  const business = await getBusinessForCurrentUser();
  if (!business) return null;

  const customer = await getCustomer(business.id, customerId);
  if (!customer) return null;

  const [events, serviceBaselines] = await Promise.all([
    listEventsForCustomer(customerId),
    listServiceBaselines(business.id),
  ]);
  return calculateOpportunityForCustomer(customer, events, business, serviceBaselines);
}
