import { defineConfig } from "cypress";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: "cypress/support/e2e.js",
    video: true,
    screenshotOnRunFailure: true,
    // Required so cy.origin() can interact with the nyx-auth login page
    // (Cypress blocks cross-origin iframe interaction by default)
    chromeWebSecurity: false,
    env: {
      codeCoverage: {
        url: process.env.CYPRESS_AUTH_URL
          ? `${process.env.CYPRESS_AUTH_URL}/__coverage__`
          : "http://localhost:3000/__coverage__",
        // Suppress "Did you forget to instrument your app?" — we only have server-side coverage.
        expectBackendCoverageOnly: true,
      },
    },
    setupNodeEvents(on, config) {
      require("@cypress/code-coverage/task")(on, config);
      // task.js only exposes codeCoverageTasksRegistered; we must also expose
      // the codeCoverage config so support.js can read Cypress.expose('codeCoverage').
      config.expose.codeCoverage = config.env.codeCoverage ?? {};
      // Allow Crypto.subtle (used by oidc-client-ts for PKCE) on plain HTTP
      // origins inside the CI network — equivalent to marking them secure.
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium") {
          launchOptions.args.push(
            "--unsafely-treat-insecure-origin-as-secure=http://test-app:5173"
          );
        }
        return launchOptions;
      });

      // Generate a TOTP code from a base32 seed. Runs in Node (not the browser)
      // so the code can be computed and passed into cy.origin() as an argument.
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
