const AUTH_URL = Cypress.env("AUTH_URL") || "http://nyx-auth:3000";
// better-auth exposes OIDC under /api/auth/
const AUTH_API = AUTH_URL + "/api/auth";

const CI_EMAIL = Cypress.env("CI_EMAIL") || "ci@nyx.test";
const CI_PASSWORD = Cypress.env("CI_PASSWORD") || "TestPass1234!";
const CI_OTP_SECRET = Cypress.env("CI_OTP_SECRET") || "5YIEQ5DAA6AGQMWT4X3LESW6FZYT4E2M";

describe("nyx-auth pipeline smoke tests", () => {
  it("nyx-auth health endpoint returns ok", () => {
    cy.request(AUTH_URL + "/").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.deep.include({ service: "nyx-auth", status: "ok" });
    });
  });

  it("OIDC discovery endpoint is available and valid", () => {
    cy.request(AUTH_API + "/.well-known/openid-configuration").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property("issuer");
      expect(response.body).to.have.property("authorization_endpoint");
      expect(response.body).to.have.property("token_endpoint");
      expect(response.body).to.have.property("jwks_uri");
    });
  });

  it("test app loads with login button", () => {
    cy.visit("/");
    cy.contains("nyx-auth test client");
    cy.get("#loginBtn").should("be.visible").and("contain", "Login");
  });

  // oidc-client-ts uses Crypto.subtle for PKCE which requires HTTPS,
  // so a real login redirect cannot be triggered over plain HTTP in CI.
  // Instead, verify the authorize endpoint is reachable directly.
  it("OIDC authorize endpoint is reachable", () => {
    cy.request({
      url: AUTH_API + "/oauth2/authorize",
      failOnStatusCode: false,
    }).then((response) => {
      // Should redirect (302) or return a page — anything except 404/500
      expect(response.status).not.to.eq(404);
      expect(response.status).to.be.lessThan(500);
    });
  });

  it("nyx-auth login page is reachable", () => {
    cy.request(AUTH_URL + "/login").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers["content-type"]).to.include("text/html");
    });
  });

  it("failed login attempt is delayed by at least 1 second", () => {
    const start = Date.now();
    cy.request({
      method: "POST",
      url: AUTH_URL + "/api/auth/login",
      headers: { "Content-Type": "application/json" },
      body: { email: "notauser@example.com", password: "wrongpassword" },
      failOnStatusCode: false,
    }).then((response) => {
      const elapsed = Date.now() - start;
      expect(response.status).to.eq(401);
      expect(elapsed).to.be.greaterThan(1000);
    });
  });

  it("client_credentials grant issues a machine access token", () => {
    cy.request({
      method: "POST",
      url: AUTH_URL + "/api/auth/oauth2/token",
      form: true,
      body: {
        grant_type: "client_credentials",
        client_id: "ci-machine",
        client_secret: "ci-machine-secret",
        scope: "api:read",
      },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.token_type).to.eq("Bearer");
      expect(response.body.expires_in).to.eq(3600);
      expect(response.body.access_token).to.be.a("string");
      expect(response.body.id_token).to.be.undefined;
    });
  });

  it("client_credentials rejects wrong secret", () => {
    cy.request({
      method: "POST",
      url: AUTH_URL + "/api/auth/oauth2/token",
      form: true,
      body: {
        grant_type: "client_credentials",
        client_id: "ci-machine",
        client_secret: "wrong",
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body.error).to.eq("invalid_client");
    });
  });

  it("correct password returns requiresTotp for a TOTP user", () => {
    cy.request({
      method: "POST",
      url: AUTH_URL + "/api/auth/login",
      headers: { "Content-Type": "application/json" },
      body: { email: CI_EMAIL, password: CI_PASSWORD },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.requiresTotp).to.eq(true);
      expect(response.body.pendingToken).to.be.a("string");
    });
  });

  it("wrong TOTP code is rejected and delayed by at least 1 second", () => {
    cy.request({
      method: "POST",
      url: AUTH_URL + "/api/auth/login",
      headers: { "Content-Type": "application/json" },
      body: { email: CI_EMAIL, password: CI_PASSWORD },
    }).then((loginRes) => {
      const { pendingToken } = loginRes.body;
      const start = Date.now();
      cy.request({
        method: "POST",
        url: AUTH_URL + "/api/auth/totp",
        headers: { "Content-Type": "application/json" },
        body: { pendingToken, code: "000000" },
        failOnStatusCode: false,
      }).then((totpRes) => {
        const elapsed = Date.now() - start;
        expect(totpRes.status).to.eq(401);
        expect(elapsed).to.be.greaterThan(1000);
      });
    });
  });

  // Full OIDC login flow:
  // 1. Click Login on test-app → signinRedirect() → navigates to nyx-auth/login
  // 2. cy.origin() fills credentials on the nyx-auth origin
  // 3. Password step succeeds → TOTP form appears
  // 4. cy.origin() enters TOTP code (generated via cy.task before crossing origin)
  // 5. TOTP step succeeds → OAuth2 authorize → redirect to test-app/callback
  // 6. oidc-client-ts handles callback → shows user profile
  //
  // Requires Chrome with --unsafely-treat-insecure-origin-as-secure=http://test-app:5173
  // (set via before:browser:launch in cypress.config.js) so Crypto.subtle works on HTTP.
  it("full OIDC login flow via login page (with TOTP)", () => {
    // Generate the TOTP code in Node context before crossing origins —
    // cy.task() cannot be called inside cy.origin().
    cy.task("generateTotp", CI_OTP_SECRET).then((totpCode) => {
      cy.visit("/");
      cy.get("#loginBtn").should("be.visible").click();

      // Cypress navigates cross-origin to nyx-auth:3000 — use cy.origin() to interact
      cy.origin(
        AUTH_URL,
        { args: { email: CI_EMAIL, password: CI_PASSWORD, totpCode } },
        ({ email, password, totpCode }) => {
          // Step 1: password
          cy.get("#email", { timeout: 10000 }).should("be.visible").type(email);
          cy.get("#password").type(password);
          cy.get("#btn-password").click();

          // Step 2: TOTP — form-password hides, form-totp appears
          cy.get("#totp", { timeout: 10000 }).should("be.visible").type(totpCode);
          cy.get("#btn-totp").click();
        }
      );

      // After successful auth, test-app/callback processes the code and shows the user.
      cy.get("#status", { timeout: 15000 }).should("contain", CI_EMAIL);
    });
  });
});
