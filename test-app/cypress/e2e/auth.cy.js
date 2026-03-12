const AUTH_URL = Cypress.env("AUTH_URL") || "http://nyx-auth:3000";
// better-auth exposes OIDC under /api/auth/
const AUTH_API = AUTH_URL + "/api/auth";

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
});
