/**
 * Milestone 1 — WhatsApp webhook signature is mandatory in production.
 * Run with `npm test`.
 */
import { createHmac } from "crypto";
import { checkWebhookSignature } from "@/lib/whatsapp/signature";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const body = JSON.stringify({ entry: [] });
const secret = "test-secret";
const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const check = (signatureHeader: string | null, appSecret: string, nodeEnv: string) =>
  checkWebhookSignature({ rawBody: body, signatureHeader, appSecret, nodeEnv });

eq(check(good, secret, "production").accept, true, "production + secret + valid signature -> accepted");
eq(check("sha256=deadbeef", secret, "production").accept, false, "production + secret + wrong signature -> refused");
eq(check(null, secret, "production").accept, false, "production + secret + no signature -> refused");
const noSecretProd = check(good, "", "production");
eq(noSecretProd.accept ? null : noSecretProd.status, 503, "production + NO secret -> refused (fail closed)");
eq(check(null, "", "production").accept, false, "production + no secret + unsigned -> refused");
const dev = check(null, "", "development");
eq(dev.accept && !dev.verified, true, "development + no secret -> accepted but unverified");
eq(check("sha256=deadbeef", secret, "development").accept, false, "development + secret set still enforces it");
eq(check(good, secret, "test").accept, true, "test env + valid signature -> accepted");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
