// Builds an Istanbul-instrumented bundle of src/ for use in coverage runs.
// Output: dist-coverage/index.js
//
// Uses Bun.build() (bundler mode) so that plugin onLoad hooks are guaranteed
// to fire — unlike runtime plugins, which do not intercept Bun's native TS
// transpiler.
//
// Run: bun scripts/build-coverage.ts

import { transformSync } from "@babel/core";
import type { BunPlugin } from "bun";

const istanbulPlugin: BunPlugin = {
  name: "istanbul-coverage",
  setup(build) {
    build.onLoad({ filter: /\/src\/.*\.ts$/ }, async (args) => {
      if (args.path.includes("coverage-plugin")) return undefined;
      const source = await Bun.file(args.path).text();
      const result = transformSync(source, {
        filename: args.path,
        plugins: [
          [
            "babel-plugin-istanbul",
            {
              include: ["src/**/*.ts"],
              exclude: ["src/coverage-plugin.ts"],
              // Relative paths so coverage keys match bun test lcov output.
              cwd: process.cwd(),
            },
          ],
        ],
        presets: [["@babel/preset-typescript", { allExtensions: true }]],
        sourceMaps: "inline",
        configFile: false,
        babelrc: false,
      });
      return { contents: result!.code!, loader: "js" };
    });
  },
};

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist-coverage",
  target: "bun",
  sourcemap: "inline",
  // Keep npm packages as external so they resolve from node_modules at runtime.
  packages: "external",
  plugins: [istanbulPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log("Coverage build complete →", result.outputs.map((o) => o.path).join(", "));
