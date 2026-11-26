/**
 * Milestone 1 — the shared phone normaliser (src/lib/phone.ts), its
 * WhatsApp/import wrappers, and the pagination helper. Run with `npm test`.
 */
import { normalizeIndianMobile, toWhatsAppNumber, formatIndianMobile, isValidIndianMobile } from "@/lib/phone";
import { normalizePhoneForWhatsApp, formatNormalizedPhoneForDisplay } from "@/lib/whatsapp/phone";
import { normalizePhone } from "@/lib/import/normalize";
import { formatPhone } from "@/lib/utils";
import { fetchAllPages, chunk } from "@/lib/supabase/paginate";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const SAME_PERSON = [
  "9876543210",
  "98765 43210",
  "98765-43210",
  "+91 98765 43210",
  "+919876543210",
  "919876543210",
  "91-9876543210",
  "09876543210",
  "0091 98765 43210",
  "+91 0 98765 43210",
  " (+91) 98765.43210 ",
];
for (const raw of SAME_PERSON) {
  eq(normalizeIndianMobile(raw), "+919876543210", `"${raw}" normalises to +919876543210`);
}

for (const bad of ["", "   ", "12345", "5876543210", "98765432", "987654321012", "+1 415 555 0100", "abc", "0000000000"]) {
  eq(normalizeIndianMobile(bad), null, `"${bad}" is rejected, never guessed`);
}
eq(normalizeIndianMobile(null), null, "null is rejected");
eq(normalizeIndianMobile(undefined), null, "undefined is rejected");
eq(isValidIndianMobile("6000000000"), true, "6-series numbers are valid");

// Every caller agrees on the same person.
eq(toWhatsAppNumber("98765 43210"), "919876543210", "WhatsApp 'to' format drops the +");
eq(normalizePhoneForWhatsApp("+91 98765 43210"), "919876543210", "whatsapp/phone wrapper uses the shared rules");
eq(normalizePhoneForWhatsApp("5876543210"), null, "whatsapp/phone wrapper rejects non-mobile numbers");
eq(normalizePhone("098765 43210"), { value: "+919876543210", valid: true, raw: "098765 43210" }, "import normaliser uses shared rules");
eq(normalizePhone("12345").valid, false, "import normaliser rejects junk");
eq(normalizePhone("1234567890").valid, false, "import now rejects 10-digit numbers that aren't mobiles");

// Display.
eq(formatIndianMobile("+919876543210"), "+91 98765 43210", "display format");
eq(formatPhone("9876543210"), "+91 98765 43210", "utils.formatPhone delegates to shared formatter");
eq(formatPhone("12345"), "12345", "invalid numbers display as stored");
eq(formatNormalizedPhoneForDisplay("919876543210"), "+91 98765 43210", "WhatsApp display from 91-format");
eq(formatNormalizedPhoneForDisplay("+919876543210"), "+91 98765 43210", "WhatsApp display from +91-format");

// Pagination helper.
(async () => {
  const table = Array.from({ length: 2345 }, (_, i) => i);
  const calls: Array<[number, number]> = [];
  const all = await fetchAllPages<number>(async (from, to) => {
    calls.push([from, to]);
    return { data: table.slice(from, to + 1), error: null };
  });
  eq(all.length, 2345, "fetchAllPages returns every row past the 1,000 cap");
  eq(calls, [[0, 999], [1000, 1999], [2000, 2999]], "fetchAllPages requests 1,000-row ranges until a short page");

  const exact = await fetchAllPages<number>(async (from, to) => ({ data: table.slice(0, 1000).slice(from, to + 1), error: null }));
  eq(exact.length, 1000, "exactly 1,000 rows -> one extra empty page, no duplicates");

  let threw = false;
  try {
    await fetchAllPages(async () => ({ data: null, error: { message: "boom" } }));
  } catch (err) {
    threw = err instanceof Error && err.message === "boom";
  }
  eq(threw, true, "fetchAllPages surfaces query errors instead of returning partial data");

  eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], "chunk splits lists");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
