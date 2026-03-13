// Merges coverage from three sources into one Istanbul HTML report.
//
// Sources (all optional — whatever exists is merged):
//   coverage/lcov.info               — bun unit test coverage (lcov)
//   test-app/coverage-final.json     — @cypress/code-coverage e2e (Istanbul JSON)
//   cookie-test-app/coverage-final.json
//
// Output: coverage/merged/html/  (Istanbul HTML report)
//
// Run: bun scripts/merge-coverage.ts

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { promisify } from "node:util";
import { createCoverageMap } from "istanbul-lib-coverage";
import { createContext } from "istanbul-lib-report";
import { create as createReporter } from "istanbul-reports";

const WORKSPACE = process.env.VELA_WORKSPACE ?? process.cwd();
const outDir = resolve(WORKSPACE, "coverage/merged/html");
mkdirSync(outDir, { recursive: true });

const map = createCoverageMap({});

// ── 1. Unit test coverage: Bun lcov → Istanbul JSON ──────────────────────────

const unitLcov = resolve(WORKSPACE, "coverage/lcov.info");
if (existsSync(unitLcov)) {
  console.log("Loading unit test lcov:", unitLcov);
  const { source: parseSource } = await import("lcov-parse");
  const parse = promisify(parseSource);
  const records = await parse(readFileSync(unitLcov, "utf-8"));

  for (const rec of records ?? []) {
    const filePath = rec.file;
    const statementMap: Record<string, object> = {};
    const s: Record<string, number> = {};
    const fnMap: Record<string, object> = {};
    const f: Record<string, number> = {};
    const branchMap: Record<string, object> = {};
    const b: Record<string, number[]> = {};

    for (const [i, line] of (rec.lines?.details ?? []).entries()) {
      const key = String(i);
      statementMap[key] = { start: { line: line.line, column: 0 }, end: { line: line.line, column: 0 } };
      s[key] = line.hit;
    }

    for (const [i, fn] of (rec.functions?.details ?? []).entries()) {
      const key = String(i);
      fnMap[key] = { name: fn.name, decl: { start: { line: fn.line, column: 0 }, end: { line: fn.line, column: 0 } }, loc: { start: { line: fn.line, column: 0 }, end: { line: fn.line, column: 0 } } };
      f[key] = fn.hit;
    }

    for (const [i, branch] of (rec.branches?.details ?? []).entries()) {
      const key = String(i);
      branchMap[key] = { loc: { start: { line: branch.line, column: 0 }, end: { line: branch.line, column: 0 } }, type: "branch", locations: [{ start: { line: branch.line, column: 0 }, end: { line: branch.line, column: 0 } }] };
      b[key] = [branch.taken];
    }

    map.addFileCoverage({ path: filePath, statementMap, s, fnMap, f, branchMap, b } as any);
  }
  console.log("  ✓ unit test lcov merged");
}

// ── 2. E2E coverage: @cypress/code-coverage Istanbul JSON ────────────────────

for (const app of ["test-app", "cookie-test-app"]) {
  const jsonPath = resolve(WORKSPACE, app, "coverage", "coverage-final.json");
  if (existsSync(jsonPath)) {
    console.log(`Loading e2e coverage: ${jsonPath}`);
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    map.merge(data);
    console.log(`  ✓ ${app} e2e coverage merged`);
  }
}

if (map.files().length === 0) {
  console.error("No coverage data found — nothing to report.");
  process.exit(1);
}

console.log(`\nMerged coverage for ${map.files().length} file(s):`);
map.files().forEach((f) => console.log("  " + f));

// ── 3. Generate HTML report ───────────────────────────────────────────────────

const context = createContext({ coverageMap: map, dir: outDir, defaultSummarizer: "flat" });
// @ts-ignore — istanbul-reports types don't export the full option signature
const htmlReporter = createReporter("html");
// @ts-ignore
htmlReporter.execute(context);

console.log("\nHTML report written to", outDir);
