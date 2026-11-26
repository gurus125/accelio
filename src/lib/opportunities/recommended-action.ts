/**
 * Short, deterministic action labels shown to the business owner (e.g. in
 * the opportunity review flow before generating a message). Pure
 * presentation text derived from the Phase 6 engine's own opportunity
 * type — no AI involved.
 */

import type { OpportunityType } from "./types";

const RECOMMENDED_ACTION: Record<OpportunityType, string> = {
  high_value_inactive: "Send a re-engagement message.",
  due_to_return: "Send a return reminder.",
  service_reminder: "Send a service reminder.",
  inactive: "Send a re-engagement message.",
  follow_up: "Follow up on their enquiry.",
};

export function getRecommendedAction(type: OpportunityType): string {
  return RECOMMENDED_ACTION[type];
}
