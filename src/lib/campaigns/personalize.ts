/**
 * Phase 10 — resolves a campaign message template's safe personalization
 * variables for one specific recipient. Only variables backed by real,
 * already-known data are supported — nothing here invents information.
 */

const SUPPORTED_VARIABLES = new Set(["customer_name", "business_name"]);

export interface PersonalizeContext {
  customerName: string;
  businessName: string;
}

/**
 * Replaces every `{{variable}}` in the template. A known variable is
 * substituted with real data (falling back to a natural default if the
 * underlying field is somehow empty); any OTHER `{{...}}` — a typo, or
 * something an owner pasted in — is stripped rather than ever reaching a
 * customer as literal mustache syntax.
 */
export function personalizeMessage(template: string, context: PersonalizeContext): string {
  const customerFirstName = context.customerName.trim().split(" ")[0] || context.customerName.trim() || "there";

  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!SUPPORTED_VARIABLES.has(name)) return "";
    if (name === "customer_name") return customerFirstName;
    if (name === "business_name") return context.businessName.trim() || "us";
    return "";
  });
}

/** True only if the template contains nothing but supported, resolvable
 * variables — used to warn the owner before approving a campaign whose
 * message would otherwise leak literal `{{...}}` text to customers. */
export function hasOnlySupportedVariables(template: string): boolean {
  const matches = template.match(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g) ?? [];
  return matches.every((match) => {
    const name = match.replace(/[{}\s]/g, "").toLowerCase();
    return SUPPORTED_VARIABLES.has(name);
  });
}
