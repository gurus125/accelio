import { CUSTOMERS } from "./mock-data";
import type { Customer, Opportunity, OpportunityReason } from "@/types";

/**
 * This is the "brain" of Reelo for Phase 1: a small set of readable rules
 * that turn raw customer records into plain-English reasons to reach out.
 * In later phases this logic moves server-side and gets smarter, but the
 * shape — customer in, { reason, explanation, message } out — stays the same.
 */

function dueToReturnMessage(c: Customer): string {
  const firstName = c.name.split(" ")[0];
  return `Hi ${firstName}! It's been a little while since your last visit. We'd love to see you again 😊`;
}

function inactiveMessage(c: Customer): string {
  const firstName = c.name.split(" ")[0];
  return `Hi ${firstName}! We haven't seen you in a while. We'd love to have you back at the salon.`;
}

function followUpMessage(c: Customer): string {
  const firstName = c.name.split(" ")[0];
  const service = c.favoriteService ?? c.services[0] ?? "your last service";
  return `Hi ${firstName}! Hope you loved your ${service.toLowerCase()}. Let us know if you'd like to book your next appointment.`;
}

function offerMessage(c: Customer): string {
  const firstName = c.name.split(" ")[0];
  const service = c.favoriteService ?? c.services[0] ?? "our services";
  return `Hi ${firstName}! We thought you'd like this — 20% off ${service} this week only. Want us to hold a slot for you?`;
}

function buildOpportunity(
  c: Customer,
  reason: OpportunityReason,
  reasonLabel: string,
  explanation: string,
  suggestedMessage: string,
  priority: number
): Opportunity {
  return {
    id: `opp-${c.id}`,
    customerId: c.id,
    reason,
    reasonLabel,
    explanation,
    suggestedMessage,
    priority,
  };
}

/**
 * Derive a single best opportunity per customer, if one applies.
 */
export function getOpportunityForCustomer(c: Customer): Opportunity | null {
  const overBy = c.lastVisitDaysAgo - c.averageReturnDays;

  // Long lapsed / inactive customers, especially high spenders.
  if (c.status === "inactive") {
    const explanation =
      c.totalSpent > 6000
        ? `${c.name.split(" ")[0]} is a high-value customer who hasn't visited recently.`
        : `${c.name.split(" ")[0]} hasn't visited in over ${c.lastVisitDaysAgo} days and may need a nudge to come back.`;
    return buildOpportunity(
      c,
      "inactive",
      "Inactive customer",
      explanation,
      inactiveMessage(c),
      c.totalSpent > 6000 ? 1 : 2
    );
  }

  // Due to return: visiting later than their usual rhythm.
  if (c.status === "due" && overBy > 0) {
    const explanation = `${c.name.split(" ")[0]} normally returns every ${c.averageReturnDays} days. It's been ${c.lastVisitDaysAgo} days since their last visit.`;
    return buildOpportunity(
      c,
      "due_to_return",
      "Due to return",
      explanation,
      dueToReturnMessage(c),
      2
    );
  }

  // Recent visit + high engagement -> gentle follow-up.
  if (c.status === "active" && c.lastVisitDaysAgo <= 10 && c.visitCount >= 8) {
    const explanation = `${c.name.split(" ")[0]} visited recently — a quick check-in keeps the relationship warm.`;
    return buildOpportunity(
      c,
      "follow_up",
      "Follow-up",
      explanation,
      followUpMessage(c),
      4
    );
  }

  // Loyal, mid-cycle customers -> relevant offer.
  if (c.visitCount >= 12 && c.status !== "due") {
    const explanation = `${c.name.split(" ")[0]} often books ${(c.favoriteService ?? c.services[0] ?? "this service").toLowerCase()} — a timely offer could bring them in sooner.`;
    return buildOpportunity(
      c,
      "offer",
      "Relevant offer",
      explanation,
      offerMessage(c),
      3
    );
  }

  return null;
}

export function getAllOpportunities(): Opportunity[] {
  return CUSTOMERS.map(getOpportunityForCustomer)
    .filter((o): o is Opportunity => o !== null)
    .sort((a, b) => a.priority - b.priority);
}

export function getOpportunityCounts() {
  const all = getAllOpportunities();
  return {
    total: all.length,
    dueToReturn: all.filter((o) => o.reason === "due_to_return").length,
    inactive: all.filter((o) => o.reason === "inactive").length,
    followUp: all.filter((o) => o.reason === "follow_up").length,
    offer: all.filter((o) => o.reason === "offer").length,
  };
}
