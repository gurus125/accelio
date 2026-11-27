/**
 * Milestone 2 — template catalog, rendering, and the migration seed staying
 * in sync with the catalog. Run with `npm test`.
 */
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_LANGUAGES, VARIABLE_EXAMPLES } from "@/lib/templates/catalog";
import { bodyPlaceholders, buildTemplateParameters, renderTemplateBody, sanitizeTemplateParameter, firstName } from "@/lib/templates/render";
import { templateSeedValuesSql } from "@/lib/templates/seed-sql";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// Every key exists in all three languages; return reminder also has a discreet variant.
for (const key of TEMPLATE_KEYS) {
  for (const language of TEMPLATE_LANGUAGES) {
    eq(DEFAULT_TEMPLATES.some((t) => t.key === key && t.language === language && t.variant === "standard"), true, `${key} exists in ${language}`);
  }
}
for (const language of TEMPLATE_LANGUAGES) {
  const discreet = DEFAULT_TEMPLATES.find((t) => t.key === "return_reminder" && t.language === language && t.variant === "discreet");
  eq(discreet !== undefined && !discreet.variables.includes("service"), true, `discreet return reminder (${language}) never has a service slot`);
}
eq(DEFAULT_TEMPLATES.length, 18, "5 templates x 3 languages + 3 discreet");

// Meta's body rules, checked for every template.
for (const t of DEFAULT_TEMPLATES) {
  const label = `${t.name}/${t.language}`;
  const placeholders = bodyPlaceholders(t.body);
  eq(placeholders, t.variables.map((_, i) => i + 1), `${label}: placeholders are {{1}}..{{n}} in order and match the variable list`);
  eq(/^\s*\{\{/.test(t.body) || /\{\{\d+\}\}\s*[.!।]?\s*$/.test(t.body), false, `${label}: body doesn't start or end with a variable`);
  eq(/^[a-z0-9_]+$/.test(t.name), true, `${label}: Meta-safe template name`);
  eq(t.body.length <= 1024, true, `${label}: body within 1024 chars`);
  if (t.category === "marketing" && t.key !== "review_request") {
    eq(t.body.includes("STOP"), true, `${label}: marketing template says how to opt out`);
  }
}
// Same name may be reused only across different Meta language codes.
const nameLang = DEFAULT_TEMPLATES.map((t) => `${t.name}|${t.language === "hi" ? "hi" : "en"}`);
eq(new Set(nameLang).size, nameLang.length, "every (template name, Meta language) pair is unique");

// Rendering.
const enReminder = DEFAULT_TEMPLATES.find((t) => t.key === "return_reminder" && t.language === "en" && t.variant === "standard")!;
const built = buildTemplateParameters(enReminder.variables, { customer_first_name: "Priya", service: "haircut", business_name: "Style Studio" });
eq(built, { ok: true, parameters: ["Priya", "haircut", "Style Studio"] }, "parameters in placeholder order");
eq(
  built.ok ? renderTemplateBody(enReminder.body, built.parameters) : null,
  "Hi Priya, it's been a while since your last haircut at Style Studio. Reply to this message to book your next visit. Reply STOP to stop these messages.",
  "rendered text"
);
const hiReminder = DEFAULT_TEMPLATES.find((t) => t.key === "return_reminder" && t.language === "hi" && t.variant === "standard")!;
const hiBuilt = buildTemplateParameters(hiReminder.variables, { customer_first_name: "प्रिया", service: "फेशियल", business_name: "Glow" });
eq(hiBuilt.ok ? hiBuilt.parameters : null, ["प्रिया", "Glow", "फेशियल"], "Hindi variable order differs and is mapped correctly");
eq(buildTemplateParameters(enReminder.variables, { customer_first_name: "Priya", business_name: "X" }), { ok: false, missing: ["service"] }, "missing variable is reported, never sent blank");
eq(buildTemplateParameters(["offer_text"], { offer_text: "   " }), { ok: false, missing: ["offer_text"] }, "whitespace-only value counts as missing");
eq(sanitizeTemplateParameter("line one\nline\ttwo     three"), "line one line two three", "newlines, tabs, long spaces removed (Meta rejects them)");
eq(sanitizeTemplateParameter("x".repeat(400)).length, 300, "parameters capped at 300 chars");
eq(firstName("  Priya   Sharma "), "Priya", "first name");
for (const t of DEFAULT_TEMPLATES) {
  const r = buildTemplateParameters(t.variables, VARIABLE_EXAMPLES);
  eq(r.ok, true, `${t.name}/${t.language}: example values fill every variable (needed for Meta review)`);
}

// The migration's seed must be exactly what the catalog generates.
const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0020_m2_message_templates.sql"), "utf8");
const block = migration.split("-- BEGIN GENERATED TEMPLATE SEED\n")[1]?.split("\n-- END GENERATED TEMPLATE SEED")[0];
const expected = templateSeedValuesSql();
eq(block === expected, true, "migration 0020 seed matches src/lib/templates/catalog.ts");
if (block !== expected) console.log("Paste this between the GENERATED markers in migration 0020:\n" + expected);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
