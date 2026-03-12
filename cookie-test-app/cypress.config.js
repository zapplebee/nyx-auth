import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5174",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    video: true,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    setupNodeEvents(on) {
      on("task", {
        async generateTotp(secret) {
          const { generate } = await import("otplib");
          return generate({ secret });
        },
      });
    },
  },
});
