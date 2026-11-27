/**
 * Generates the SQL VALUES list that migration 0020 uses to seed every
 * business's default templates, from DEFAULT_TEMPLATES (catalog.ts).
 * scripts/templates-tests.ts checks the migration contains exactly this
 * text, and prints it when they differ so it can be pasted in.
 * Pure (no Supabase import).
 */

import { DEFAULT_TEMPLATES, META_LANGUAGE_CODE } from "./catalog";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function templateSeedValuesSql(): string {
  return DEFAULT_TEMPLATES.map((t) =>
    [
      "    (",
      [
        sqlString(t.key),
        sqlString(t.language),
        sqlString(META_LANGUAGE_CODE[t.language]),
        sqlString(t.variant),
        sqlString(t.name),
        sqlString(t.category),
        sqlString(t.body),
        `array[${t.variables.map(sqlString).join(", ")}]::text[]`,
      ].join(", "),
      ")",
    ].join("")
  ).join(",\n");
}
