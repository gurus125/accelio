// Ad-hoc path-alias shim for running the compiled *-tests.js scripts with
// plain `node` (this project has no jest/vitest/ts-node/tsconfig-paths
// installed — see README's "Testing" section). tsc only uses
// compilerOptions.paths for type-checking, it never rewrites the emitted
// `require("@/...")` calls, so plain node can't resolve them without this.
const path = require("path");
const Module = require("module");
const baseDir = path.join(__dirname, process.env.TEST_BUILD_DIR || ".automations-test-build", "src");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    request = path.join(baseDir, request.slice(2));
  }
  return origResolve.call(this, request, ...rest);
};
