/**
 * Milestone 2 — translating between our templates and Meta's template API.
 * Pure (no Supabase import, no network); unit-tested.
 */

import { VARIABLE_EXAMPLES, type TemplateStatus, type TemplateVariable } from "./catalog";
import type { MessageTemplateRow } from "@/types/database";

/** Body for POST /{waba-id}/message_templates. Meta requires an example
 * value for every variable. */
export function buildMetaTemplatePayload(
  template: Pick<MessageTemplateRow, "name" | "meta_language_code" | "category" | "body" | "variables">
): Record<string, unknown> {
  const examples = (template.variables as TemplateVariable[]).map((v) => VARIABLE_EXAMPLES[v]);
  return {
    name: template.name,
    language: template.meta_language_code,
    category: template.category === "utility" ? "UTILITY" : "MARKETING",
    components: [
      {
        type: "BODY",
        text: template.body,
        ...(examples.length > 0 ? { example: { body_text: [examples] } } : {}),
      },
    ],
  };
}

/** Meta's template status -> ours. Unknown statuses are treated as still
 * under review, never as approved. */
export function mapMetaTemplateStatus(status: string | null | undefined): TemplateStatus {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
    case "DELETED":
    case "LIMIT_EXCEEDED":
      return "paused";
    default:
      return "submitted"; // PENDING, IN_APPEAL, PENDING_DELETION, ...
  }
}

export interface MetaTemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  rejected_reason?: string | null;
}

/** Updates for our rows from Meta's list, matched on (name, language). */
export function matchMetaStatuses(
  rows: Pick<MessageTemplateRow, "id" | "name" | "meta_language_code" | "status">[],
  meta: MetaTemplateSummary[]
): { id: string; status: TemplateStatus; providerTemplateId: string; rejectionReason: string | null }[] {
  const byKey = new Map(meta.map((m) => [`${m.name}|${m.language}`, m]));
  const updates: { id: string; status: TemplateStatus; providerTemplateId: string; rejectionReason: string | null }[] = [];
  for (const row of rows) {
    const found = byKey.get(`${row.name}|${row.meta_language_code}`);
    if (!found) continue;
    const status = mapMetaTemplateStatus(found.status);
    const reason = status === "rejected" && found.rejected_reason && found.rejected_reason !== "NONE" ? found.rejected_reason : null;
    updates.push({ id: row.id, status, providerTemplateId: found.id, rejectionReason: reason });
  }
  return updates;
}
