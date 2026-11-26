#!/usr/bin/env node
/**
 * Runs every scripts/*-tests.ts file (compiled once via tsconfig.tests.json)
 * under several process time zones. Business logic must use the business
 * time zone (Asia/Kolkata by default), never the server's local time — so
 * every test must pass no matter what TZ the machine running it is in.
 *
 *   npm test
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildDir = ".test-build";
const zones = ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Kiritimati"];

fs.rmSync(path.join(root, buildDir), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.tests.json"], {
  cwd: root,
  stdio: "inherit",
});

const testFiles = fs
  .readdirSync(path.join(root, "scripts"))
  .filter((f) => f.endsWith("-tests.ts"))
  .sort();

let failures = 0;
for (const file of testFiles) {
  const compiled = path.join(buildDir, "scripts", file.replace(/\.ts$/, ".js"));
  for (const tz of zones) {
    const result = spawnSync(process.execPath, ["-r", "./.test-alias-register.js", compiled], {
      cwd: root,
      env: { ...process.env, TZ: tz, TEST_BUILD_DIR: buildDir },
      encoding: "utf8",
    });
    const summary = (result.stdout.trim().split("\n").pop() || "").trim();
    const ok = result.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${file.padEnd(28)} TZ=${tz.padEnd(18)} ${summary}`);
    if (!ok) {
      failures++;
      const failedLines = (result.stdout + result.stderr).split("\n").filter((l) => /FAIL|Error|expected/i.test(l));
      console.log(failedLines.slice(0, 20).map((l) => `        ${l}`).join("\n"));
    }
  }
}

console.log(failures === 0 ? "\nAll test files passed in every time zone." : `\n${failures} test run(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
