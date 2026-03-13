import { defineConfig } from "cypress";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5174",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: "cypress/support/e2e.js",
    video: true,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    env: {
      codeCoverageUrl: process.env.CYPRESS_AUTH_URL
        ? `${process.env.CYPRESS_AUTH_URL}/__coverage__`
        : "http://localhost:3000/__coverage__",
    },
    setupNodeEvents(on, config) {
      require("@cypress/code-coverage/task")(on, config);
      on("task", {
        async generateTotp(secret) {
          const { generate } = await import("otplib");
          return generate({ secret });
        },
      });
      return config;
    },
  },
});
