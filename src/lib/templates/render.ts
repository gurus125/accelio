/**
 * Milestone 2 — filling a template's {{1}}, {{2}}, ... from real values.
 * Pure (no Supabase import); unit-tested in scripts/templates-tests.ts.
 */

import type { TemplateVariable } from "./catalog";

export type TemplateValues = Partial<Record<TemplateVariable, string | number | null | undefined>>;

/** Longest free-text value we put into a single variable. */
export const MAX_PARAMETER_LENGTH = 300;

/** Meta rejects template parameters containing newlines, tabs or more than
 * four consecutive spaces. Normalise instead of failing the send. */
export function sanitizeTemplateParameter(raw: string, maxLength = MAX_PARAMETER_LENGTH): string {
  const flat = raw.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (flat.length <= maxLength) return flat;
  return `${flat.slice(0, maxLength - 1).trimEnd()}…`;
}

export type BuildParametersResult =
  | { ok: true; parameters: string[] }
  | { ok: false; missing: TemplateVariable[] };

/** Positional parameters for a template, in {{1}}, {{2}}, ... order. Every
 * variable must have a real, non-empty value — we never send a template
 * with a blank or invented slot. */
export function buildTemplateParameters(variables: TemplateVariable[], values: TemplateValues): BuildParametersResult {
  const missing: TemplateVariable[] = [];
  const parameters = variables.map((variable) => {
    const raw = values[variable];
    const text = raw === null || raw === undefined ? "" : sanitizeTemplateParameter(String(raw));
    if (!text) missing.push(variable);
    return text;
  });
  return missing.length > 0 ? { ok: false, missing } : { ok: true, parameters };
}

/** The exact text the customer will see, for previews and message history. */
export function renderTemplateBody(body: string, parameters: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => parameters[Number(n) - 1] ?? match);
}

/** Variable numbers used in a body, in order of appearance. */
export function bodyPlaceholders(body: string): number[] {
  return Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => Number(m[1]));
}

/** "Priya Sharma" -> "Priya". */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}
