// Bun plugin that instruments src/**/*.ts files with Istanbul coverage counters.
// Only active when the COVERAGE environment variable is set.
// Load via: bun --preload ./src/coverage-plugin.ts src/index.ts

import { plugin } from "bun";

if (process.env.COVERAGE) {
  plugin({
    name: "istanbul-coverage",
    setup(build) {
      build.onLoad({ filter: /\/src\/(?!coverage-plugin).*\.ts$/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        const { transformSync } = await import("@babel/core");
        const result = transformSync(source, {
          filename: args.path,
          plugins: [
            [
              "babel-plugin-istanbul",
              {
                include: ["src/**/*.ts"],
                exclude: ["src/coverage-plugin.ts", "**/*.test.ts"],
                // Use cwd so generated paths are relative (matches bun test lcov output).
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
  });
}
