const AUTH_URL = Cypress.env("AUTH_URL") || "http://nyx-auth:3000";
const APP_URL = Cypress.env("BASE_URL") || "http://cookie-test-app:5174";

const CI_EMAIL = Cypress.env("CI_EMAIL") || "ci@nyx.test";
const CI_PASSWORD = Cypress.env("CI_PASSWORD") || "TestPass1234!";
const CI_OTP_SECRET = Cypress.env("CI_OTP_SECRET") || "5YIEQ5DAA6AGQMWT4X3LESW6FZYT4E2M";

// Helper: complete the nyx-auth login+TOTP flow from inside cy.origin().
// Generating the TOTP code here (immediately before typing it) avoids the
// race condition where a code generated before cy.visit() expires by the
// time the TOTP form is reached after two redirects and two form submissions.
function loginViaOrigin(email, password, otpSecret) {
  cy.origin(
    AUTH_URL,
    { args: { email, password, otpSecret } },
    ({ email, password, otpSecret }) => {
      cy.get("#email", { timeout: 10000 }).should("be.visible").type(email);
      cy.get("#password").type(password);
      cy.get("#btn-password").click();

      // Generate the TOTP code as late as possible — just before typing —
      // so it is fresh even when the login form takes several seconds to load.
      cy.task("generateTotp", otpSecret).then((totpCode) => {
        cy.get("#totp", { timeout: 10000 }).should("be.visible").type(totpCode);
        cy.get("#btn-totp").click();
      });
    }
  );
}

describe("cookie-test-app — server-side OIDC session", () => {
  it("home page shows login button when unauthenticated", () => {
    cy.visit("/");
    cy.get("#loginBtn").should("be.visible").and("contain", "Login");
    cy.get("#status").should("contain", "Not signed in");
  });

  it("protected page returns 401 when not logged in", () => {
    cy.request({ url: "/protected", failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  it("/login redirects to nyx-auth authorize endpoint", () => {
    cy.request({ url: "/login", followRedirect: false, failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(302);
      expect(res.headers.location).to.include("/api/auth/oauth2/authorize");
      expect(res.headers.location).to.include("code_challenge");
      expect(res.headers.location).to.include("code_challenge_method=S256");
    });
  });

  // Full server-side OIDC login:
  // 1. Visit / → click Login → server generates PKCE, redirects to nyx-auth login
  // 2. cy.origin() fills credentials on the nyx-auth origin
  // 3. After TOTP, nyx-auth redirects to /callback
  // 4. Server exchanges code for tokens, stores user in session cookie
  // 5. Home page shows authenticated user
  it("full OIDC login sets a server-side session (with TOTP)", () => {
    cy.visit("/");
    cy.get("#loginBtn").click();

    loginViaOrigin(CI_EMAIL, CI_PASSWORD, CI_OTP_SECRET);

    // After redirect chain: /callback → session set → /
    cy.get("#status", { timeout: 15000 }).should("contain", CI_EMAIL);
    cy.get("#claims").should("contain", CI_EMAIL);
  });

  it("session persists across page loads (cookie auth)", () => {
    cy.visit("/");
    cy.get("#loginBtn").click();

    loginViaOrigin(CI_EMAIL, CI_PASSWORD, CI_OTP_SECRET);

    cy.get("#status", { timeout: 15000 }).should("contain", CI_EMAIL);

    // Reload — session cookie should keep the user logged in without re-auth
    cy.reload();
    cy.get("#status").should("contain", CI_EMAIL);
  });

  it("protected page is accessible after login", () => {
    cy.visit("/");
    cy.get("#loginBtn").click();

    loginViaOrigin(CI_EMAIL, CI_PASSWORD, CI_OTP_SECRET);

    cy.get("#status", { timeout: 15000 }).should("contain", CI_EMAIL);

    cy.get("#protectedBtn").click();
    cy.get("#status").should("contain", CI_EMAIL);
  });

  it("logout destroys session and returns to unauthenticated state", () => {
    cy.visit("/");
    cy.get("#loginBtn").click();

    loginViaOrigin(CI_EMAIL, CI_PASSWORD, CI_OTP_SECRET);

    cy.get("#status", { timeout: 15000 }).should("contain", CI_EMAIL);

    cy.get("#logoutBtn").click();

    cy.get("#status").should("contain", "Not signed in");
    cy.get("#loginBtn").should("be.visible");
  });
});
