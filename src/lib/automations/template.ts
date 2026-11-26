/**
 * Phase 14 — safe template variable substitution for automated messages.
 * Modeled directly on `lib/campaigns/personalize.ts`'s safety principle
 * (an unsupported/unresolvable `{{...}}` token is stripped to empty string,
 * NEVER leaked literally to a customer) but kept as its own small module
 * since the supported variable set differs: automations need
 * `{{lead_name}}` / `{{interest}}` for lead-triggered automations in
 * addition to `{{customer_name}}` / `{{business_name}}`.
 */

const SUPPORTED_VARIABLES = new Set(["customer_name", "business_name", "lead_name", "interest", "reminder_label"]);

export interface AutomationTemplateContext {
  businessName: string;
  customerName?: string;
  leadName?: string;
  interest?: string;
  /** The recurring schedule's own label (e.g. "Monthly coaching fee") —
   * only ever set for a `recurring_schedule` automation's messages. */
  reminderLabel?: string;
}

function firstName(fullName: string | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(" ")[0] || trimmed;
}

/**
 * Replaces every `{{variable}}` in the template with real, already-known
 * data. A variable this context has no value for (e.g. `{{interest}}` when
 * the lead didn't give one) falls back to a safe empty string rather than
 * ever leaking literal mustache syntax — same rule as an unsupported name.
 */
export function personalizeAutomationMessage(template: string, context: AutomationTemplateContext): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!SUPPORTED_VARIABLES.has(name)) return "";

    switch (name) {
      case "customer_name":
        return firstName(context.customerName) ?? "there";
      case "lead_name":
        return firstName(context.leadName) ?? "there";
      case "business_name":
        return context.businessName.trim() || "us";
      case "interest":
        return context.interest?.trim() ?? "";
      case "reminder_label":
        return context.reminderLabel?.trim() ?? "your upcoming reminder";
      default:
        return "";
    }
  });
}

/** True only if the template contains nothing but supported, resolvable
 * variables — used at automation-creation time to warn the owner before a
 * typo'd `{{...}}` could otherwise reach a customer as literal text. */
export function hasOnlySupportedAutomationVariables(template: string): boolean {
  const matches = template.match(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g) ?? [];
  return matches.every((match) => {
    const name = match.replace(/[{}\s]/g, "").toLowerCase();
    return SUPPORTED_VARIABLES.has(name);
  });
}
