// Merges coverage from three sources into one HTML report:
//   coverage/lcov.info          — bun unit test coverage (lcov)
//   test-app/coverage/lcov.info — @cypress/code-coverage e2e (lcov)
//   cookie-test-app/coverage/lcov.info — @cypress/code-coverage e2e (lcov)
//
// Output: coverage/merged/lcov.info  (merged lcov)
//         coverage/merged/html/      (HTML report via @lcov-viewer/cli)
//
// Run: bun scripts/merge-coverage.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKSPACE = process.env.VELA_WORKSPACE ?? process.cwd();

const sources = [
  resolve(WORKSPACE, "coverage/lcov.info"),
  resolve(WORKSPACE, "test-app/coverage/lcov.info"),
  resolve(WORKSPACE, "cookie-test-app/coverage/lcov.info"),
].filter((p) => existsSync(p));

if (sources.length === 0) {
  console.error("No lcov.info files found — nothing to merge.");
  process.exit(1);
}

console.log(`Merging ${sources.length} lcov source(s):`);
sources.forEach((s) => console.log("  " + s));

mkdirSync(resolve(WORKSPACE, "coverage/merged"), { recursive: true });

// ── Merge lcov files ─────────────────────────────────────────────────────────
// lcov-result-merger exports a mergeFiles function — invoke it directly so we
// don't depend on a `node` binary shebang in the PATH.

const { mergeCoverageReportFiles } = await import("lcov-result-merger");

const mergedPath = resolve(WORKSPACE, "coverage/merged/lcov.info");
const tmpFile: string = await mergeCoverageReportFiles(sources);
writeFileSync(mergedPath, readFileSync(tmpFile));
console.log("Merged lcov written to", mergedPath);

// ── Generate HTML ─────────────────────────────────────────────────────────────

const htmlDir = resolve(WORKSPACE, "coverage/merged/html");
const viewerBin = resolve(WORKSPACE, "node_modules/.bin/lcov-viewer");

const proc = Bun.spawnSync(["bun", viewerBin, "lcov", "--output", htmlDir, mergedPath], {
  stdout: "inherit",
  stderr: "inherit",
});
if (proc.exitCode !== 0) {
  console.error("lcov-viewer failed");
  process.exit(1);
}
console.log("HTML report written to", htmlDir);
