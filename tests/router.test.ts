import { describe, it, expect, beforeEach } from "bun:test";
import { generate as totpGenerate } from "otplib";
import { createApp } from "../src/router";
import { resetKeysForTest } from "../src/keys";
import { unsafeDecodePayload, issueRefreshToken } from "../src/tokens";
import type { ClientConfig } from "../src/clients";
import type { UserConfig } from "../src/users";
import { OTP_OUT } from "../src/users";

// Use a short delay so tests run fast while still verifying the mechanism.
const DELAY_MS = 100;

const TOTP_SEED = "5YIEQ5DAA6AGQMWT4X3LESW6FZYT4E2M";

const userWithTotp: UserConfig = {
  email: "alice@example.com",
  name: "Alice",
  password: "correct-password",
  otpSeed: TOTP_SEED,
  clients: [{ clientId: "app-a", roles: ["user"] }],
};

const userOptOut: UserConfig = {
  email: "bob@example.com",
  name: "Bob",
  password: "bobs-password",
  otpSeed: OTP_OUT,
  clients: [{ clientId: "app-a", roles: ["user"] }],
};

const testUsers = new Map<string, UserConfig>([
  ["alice@example.com", userWithTotp],
  ["bob@example.com", userOptOut],
]);

const machineClient: ClientConfig = {
  name: "My Service",
  clientId: "my-service",
  clientSecret: "machine-secret",
  type: "web",
  redirectURLs: [],
  roles: ["read", "write"],
};

const publicClient: ClientConfig = {
  name: "My SPA",
  clientId: "my-spa",
  clientSecret: "",
  type: "public",
  redirectURLs: ["https://app.example.com/callback"],
};

const webClient: ClientConfig = {
  name: "My App",
  clientId: "my-app",
  clientSecret: "app-secret",
  type: "web",
  redirectURLs: ["https://app.example.com/callback"],
  skipConsent: true,
};

const testClients = new Map<string, ClientConfig>([
  ["my-service", machineClient],
  ["my-spa", publicClient],
  ["my-app", webClient],
]);

beforeEach(() => {
  process.env.NYX_URL = "http://test.nyx.local";
  resetKeysForTest();
});

function loginRequest(app: ReturnType<typeof createApp>, body: object) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function totpRequest(app: ReturnType<typeof createApp>, body: object) {
  return app.request("/api/auth/totp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Failed login delay ────────────────────────────────────────────────────────

describe("failed login delay", () => {
  it("delays at least failedLoginDelayMs on wrong password", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const start = performance.now();
    const res = await loginRequest(app, { email: "alice@example.com", password: "wrong" });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS);
  });

  it("delays at least failedLoginDelayMs for unknown email", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const start = performance.now();
    const res = await loginRequest(app, { email: "unknown@example.com", password: "any" });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS);
  });

  it("does not apply the delay on a successful login (OPT_OUT user)", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: 2000 });
    const start = performance.now();
    const res = await loginRequest(app, { email: "bob@example.com", password: "bobs-password" });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });

  it("returns the correct error body on failure", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const res = await loginRequest(app, { email: "alice@example.com", password: "bad" });
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid email or password." });
  });

  it("default delay is 1000ms (plumbing check via health endpoint)", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });
});

// ── TOTP login flow ───────────────────────────────────────────────────────────

describe("TOTP login flow", () => {
  it("password-only login returns requiresTotp for a TOTP user", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const res = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requiresTotp).toBe(true);
    expect(typeof body.pendingToken).toBe("string");
  });

  it("does not set a session cookie after the password step", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const res = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });

    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).not.toContain("nyx_session");
  });

  it("OPT_OUT user logs in without TOTP step", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const res = await loginRequest(app, { email: "bob@example.com", password: "bobs-password" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.requiresTotp).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain("nyx_session");
  });

  it("valid TOTP code completes login and sets session cookie", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });

    const loginRes = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
    const { pendingToken } = await loginRes.json();

    const code = await totpGenerate({ secret: TOTP_SEED });
    const totpRes = await totpRequest(app, { pendingToken, code });
    const body = await totpRes.json();

    expect(totpRes.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(totpRes.headers.get("set-cookie")).toContain("nyx_session");
  });

  // Ref: https://github.com/zapplebee/nyx-auth/issues/... (TOTP window tolerance)
  // The server checks ±4 periods so codes from the immediately adjacent windows
  // (e.g. generated 30 s ago) are still accepted despite redirect latency.
  it("TOTP code from the previous period is accepted (window tolerance)", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const loginRes = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
    const { pendingToken } = await loginRes.json();

    // Simulate a code that was generated one 30-second step in the past.
    const prevCode = await totpGenerate({ secret: TOTP_SEED, timestamp: Date.now() - 30_000 });
    const totpRes = await totpRequest(app, { pendingToken, code: prevCode });
    expect(totpRes.status).toBe(200);
  });

  it("TOTP code from the next period is accepted (window tolerance)", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const loginRes = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
    const { pendingToken } = await loginRes.json();

    const nextCode = await totpGenerate({ secret: TOTP_SEED, timestamp: Date.now() + 30_000 });
    const totpRes = await totpRequest(app, { pendingToken, code: nextCode });
    expect(totpRes.status).toBe(200);
  });

  it("wrong TOTP code is rejected and delayed", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });

    const loginRes = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
    const { pendingToken } = await loginRes.json();

    const start = performance.now();
    const totpRes = await totpRequest(app, { pendingToken, code: "000000" });
    const elapsed = performance.now() - start;

    expect(totpRes.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS);
  });

  it("invalid pendingToken is rejected and delayed", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const code = await totpGenerate({ secret: TOTP_SEED });

    const start = performance.now();
    const totpRes = await totpRequest(app, { pendingToken: "not-a-valid-jwt", code });
    const elapsed = performance.now() - start;

    expect(totpRes.status).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS);
  });

  it("empty pendingToken is rejected", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const code = await totpGenerate({ secret: TOTP_SEED });
    const totpRes = await totpRequest(app, { pendingToken: "", code });
    expect(totpRes.status).toBe(401);
  });
});

// ── Client credentials grant ──────────────────────────────────────────────────

function tokenRequest(app: ReturnType<typeof createApp>, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  return app.request("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

describe("client_credentials grant", () => {
  it("issues an access token with correct claims", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-service",
      client_secret: "machine-secret",
      scope: "api:read api:write",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.scope).toBe("api:read api:write");
    expect(typeof body.access_token).toBe("string");

    const payload = unsafeDecodePayload(body.access_token);
    expect(payload.sub).toBe("my-service");
    expect(payload.client_id).toBe("my-service");
    expect(payload.roles).toEqual(["read", "write"]);
    expect(payload.scope).toBe("api:read api:write");
  });

  it("does not include an id_token in the response", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-service",
      client_secret: "machine-secret",
    });
    const body = await res.json();
    expect(body.id_token).toBeUndefined();
  });

  it("accepts credentials via Basic Authorization header", async () => {
    const app = createApp(testClients, testUsers);
    const encoded = Buffer.from("my-service:machine-secret").toString("base64");
    const res = await app.request("/api/auth/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encoded}`,
      },
      body: "grant_type=client_credentials",
    });
    expect(res.status).toBe(200);
  });

  it("rejects unknown client", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "unknown",
      client_secret: "whatever",
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("rejects wrong client secret", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-service",
      client_secret: "wrong-secret",
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("rejects missing client secret", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-service",
    });
    expect(res.status).toBe(401);
  });

  it("rejects public clients", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-spa",
      client_secret: "",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unauthorized_client");
  });

  it("rejects unsupported grant type", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "password",
      client_id: "my-service",
      client_secret: "machine-secret",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});

// ── Helpers for auth code flow ────────────────────────────────────────────────

async function getSessionCookie(app: ReturnType<typeof createApp>, email: string, password: string): Promise<string> {
  const res = await loginRequest(app, { email, password });
  return res.headers.get("set-cookie") ?? "";
}

async function getAuthCode(
  app: ReturnType<typeof createApp>,
  sessionCookie: string,
  params: Record<string, string>
): Promise<string> {
  const qs = new URLSearchParams(params).toString();
  const res = await app.request(`/api/auth/oauth2/authorize?${qs}`, {
    headers: { Cookie: sessionCookie },
  });
  const location = res.headers.get("Location") ?? "";
  const url = new URL(location);
  return url.searchParams.get("code") ?? "";
}

// ── Refresh token grant ───────────────────────────────────────────────────────

describe("refresh_token grant", () => {
  it("authorization_code with offline_access includes a refresh_token", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const code = await getAuthCode(app, cookie, {
      client_id: "my-app",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: "openid offline_access",
    });

    const res = await tokenRequest(app, {
      grant_type: "authorization_code",
      client_id: "my-app",
      client_secret: "app-secret",
      code,
      redirect_uri: "https://app.example.com/callback",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(typeof body.refresh_token).toBe("string");

    const rtPayload = unsafeDecodePayload(body.refresh_token);
    expect(rtPayload.type).toBe("refresh_token");
    expect(rtPayload.sub).toBe("bob@example.com");
    expect(rtPayload.client_id).toBe("my-app");
  });

  it("authorization_code without offline_access does not include refresh_token", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const code = await getAuthCode(app, cookie, {
      client_id: "my-app",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: "openid profile",
    });

    const res = await tokenRequest(app, {
      grant_type: "authorization_code",
      client_id: "my-app",
      client_secret: "app-secret",
      code,
      redirect_uri: "https://app.example.com/callback",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.refresh_token).toBeUndefined();
  });

  // Ref: https://github.com/zapplebee/nyx-auth/issues/17
  // offline_access mixed with other scopes must still produce a refresh_token
  it("authorization_code with offline_access among other scopes includes a refresh_token", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const code = await getAuthCode(app, cookie, {
      client_id: "my-app",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: "openid profile email offline_access",
    });

    const res = await tokenRequest(app, {
      grant_type: "authorization_code",
      client_id: "my-app",
      client_secret: "app-secret",
      code,
      redirect_uri: "https://app.example.com/callback",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(typeof body.refresh_token).toBe("string");
  });

  it("refresh_token grant issues new access_token, id_token, and rotated refresh_token", async () => {
    const app = createApp(testClients, testUsers);
    const rt = await issueRefreshToken(userOptOut, webClient, "openid offline_access");

    const res = await tokenRequest(app, {
      grant_type: "refresh_token",
      client_id: "my-app",
      client_secret: "app-secret",
      refresh_token: rt,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.id_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    // Rotated token must differ from the original
    expect(body.refresh_token).not.toBe(rt);

    const atPayload = unsafeDecodePayload(body.access_token);
    expect(atPayload.sub).toBe("bob@example.com");

    const newRtPayload = unsafeDecodePayload(body.refresh_token);
    expect(newRtPayload.type).toBe("refresh_token");
    expect(newRtPayload.sub).toBe("bob@example.com");
  });

  it("refresh_token grant rejects an invalid token", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "refresh_token",
      client_id: "my-app",
      client_secret: "app-secret",
      refresh_token: "not-a-valid-jwt",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("refresh_token grant rejects a token issued for a different client", async () => {
    const app = createApp(testClients, testUsers);
    // Token issued for my-service but presented as my-app
    const rt = await issueRefreshToken(userOptOut, machineClient, "openid offline_access");
    const res = await tokenRequest(app, {
      grant_type: "refresh_token",
      client_id: "my-app",
      client_secret: "app-secret",
      refresh_token: rt,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("refresh_token grant rejects wrong client secret", async () => {
    const app = createApp(testClients, testUsers);
    const rt = await issueRefreshToken(userOptOut, webClient, "openid offline_access");
    const res = await tokenRequest(app, {
      grant_type: "refresh_token",
      client_id: "my-app",
      client_secret: "wrong-secret",
      refresh_token: rt,
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("refresh_token grant rejects missing refresh_token param", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "refresh_token",
      client_id: "my-app",
      client_secret: "app-secret",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });
});

// ── RP-initiated logout ───────────────────────────────────────────────────────

describe("logout endpoint", () => {
  it("clears the nyx_session cookie", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");

    const res = await app.request("/api/auth/oauth2/logout", {
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/nyx_session=;/);
  });

  it("redirects to post_logout_redirect_uri when provided", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request(
      "/api/auth/oauth2/logout?post_logout_redirect_uri=https://app.example.com/logged-out"
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://app.example.com/logged-out");
  });

  it("includes state in post_logout_redirect_uri", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request(
      "/api/auth/oauth2/logout?post_logout_redirect_uri=https://app.example.com/logged-out&state=xyz"
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location") ?? "");
    expect(location.searchParams.get("state")).toBe("xyz");
  });

  it("returns 200 HTML when no post_logout_redirect_uri", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/oauth2/logout");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

// ── Discovery document ────────────────────────────────────────────────────────

describe("OIDC discovery document", () => {
  it("includes end_session_endpoint", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/.well-known/openid-configuration");
    const body = await res.json();
    expect(body.end_session_endpoint).toBe("http://test.nyx.local/api/auth/oauth2/logout");
  });

  it("includes refresh_token in grant_types_supported", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/.well-known/openid-configuration");
    const body = await res.json();
    expect(body.grant_types_supported).toContain("refresh_token");
  });

  it("includes offline_access in scopes_supported", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/.well-known/openid-configuration");
    const body = await res.json();
    expect(body.scopes_supported).toContain("offline_access");
  });
});

// ── Custom claims via userinfo endpoint ───────────────────────────────────────

describe("custom claims via userinfo", () => {
  const userWithClaims: UserConfig = {
    email: "carol@example.com",
    name: "Carol",
    password: "carols-password",
    otpSeed: OTP_OUT,
    clients: [{ clientId: "my-app", roles: ["user"] }],
    claims: { oid: "tenant-object-id", tid: "tenant-id", groups: ["g1", "g2"] },
  };

  const usersWithClaims = new Map([
    ...testUsers,
    ["carol@example.com", userWithClaims],
  ]);

  it("userinfo returns custom claims alongside standard claims", async () => {
    const app = createApp(testClients, usersWithClaims, { failedLoginDelayMs: DELAY_MS });

    // Login to get session, then get an access token via the auth code flow
    const cookie = await getSessionCookie(app, "carol@example.com", "carols-password");
    const code = await getAuthCode(app, cookie, {
      client_id: "my-app",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: "openid profile",
    });
    const tokenRes = await tokenRequest(app, {
      grant_type: "authorization_code",
      client_id: "my-app",
      client_secret: "app-secret",
      code,
      redirect_uri: "https://app.example.com/callback",
    });
    const { access_token } = await tokenRes.json();

    const userInfoRes = await app.request("/api/auth/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const body = await userInfoRes.json();

    expect(userInfoRes.status).toBe(200);
    expect(body.sub).toBe("carol@example.com");
    expect(body.oid).toBe("tenant-object-id");
    expect(body.tid).toBe("tenant-id");
    expect(body.groups).toEqual(["g1", "g2"]);
  });

  it("id_token contains custom claims", async () => {
    const app = createApp(testClients, usersWithClaims, { failedLoginDelayMs: DELAY_MS });

    const cookie = await getSessionCookie(app, "carol@example.com", "carols-password");
    const code = await getAuthCode(app, cookie, {
      client_id: "my-app",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: "openid",
    });
    const tokenRes = await tokenRequest(app, {
      grant_type: "authorization_code",
      client_id: "my-app",
      client_secret: "app-secret",
      code,
      redirect_uri: "https://app.example.com/callback",
    });
    const { id_token } = await tokenRes.json();
    const payload = unsafeDecodePayload(id_token);

    expect(payload.oid).toBe("tenant-object-id");
    expect(payload.tid).toBe("tenant-id");
    expect(payload.groups).toEqual(["g1", "g2"]);
    // Standard claims still correct
    expect(payload.sub).toBe("carol@example.com");
    expect(payload.email).toBe("carol@example.com");
  });
});

// ── HTTP cache headers (ref: https://github.com/zapplebee/nyx-auth/issues/9) ─

describe("HTTP cache headers on OIDC endpoints", () => {
  it("token endpoint sets Cache-Control: no-store and Pragma: no-cache (RFC 6749 §5.1)", async () => {
    const app = createApp(testClients, testUsers);
    const res = await tokenRequest(app, {
      grant_type: "client_credentials",
      client_id: "my-service",
      client_secret: "machine-secret",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  it("JWKS endpoint sets Cache-Control: public, max-age=3600", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/jwks.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("discovery endpoint sets Cache-Control: public, max-age=86400", async () => {
    const app = createApp(testClients, testUsers);
    const res = await app.request("/api/auth/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  // Ref: https://github.com/zapplebee/nyx-auth/issues/7
  // The authorize endpoint must echo state in all redirects — this is the
  // server side of OAuth CSRF protection (RFC 6749 §10.12).
  it("state is echoed in the authorization code redirect", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const res = await app.request(
      "/api/auth/oauth2/authorize?client_id=my-app&redirect_uri=https://app.example.com/callback&response_type=code&scope=openid&state=csrf-xyz-123",
      { headers: { Cookie: cookie } }
    );
    const location = new URL(res.headers.get("Location")!);
    expect(location.searchParams.get("state")).toBe("csrf-xyz-123");
    expect(location.searchParams.get("code")).toBeTruthy();
  });

  it("state is echoed in error redirects from the authorize endpoint", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    // Trigger unsupported_response_type error
    const res = await app.request(
      "/api/auth/oauth2/authorize?client_id=my-app&redirect_uri=https://app.example.com/callback&response_type=token&scope=openid&state=csrf-xyz-456",
      { headers: { Cookie: cookie } }
    );
    const location = new URL(res.headers.get("Location")!);
    expect(location.searchParams.get("error")).toBe("unsupported_response_type");
    expect(location.searchParams.get("state")).toBe("csrf-xyz-456");
  });

  it("state is preserved in the login redirect and returned with the code", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    // No session — authorize redirects to /login with all params including state
    const authorizeRes = await app.request(
      "/api/auth/oauth2/authorize?client_id=my-app&redirect_uri=https://app.example.com/callback&response_type=code&scope=openid&state=csrf-preserving-state"
    );
    expect(authorizeRes.status).toBe(302);
    const loginLocation = authorizeRes.headers.get("Location")!;
    expect(loginLocation).toContain("state=csrf-preserving-state");

    // Now simulate completing login and re-hitting authorize with the same params
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const qs = loginLocation.split("?")[1];
    const codeRes = await app.request(`/api/auth/oauth2/authorize?${qs}`, {
      headers: { Cookie: cookie },
    });
    const codeLoc = new URL(codeRes.headers.get("Location")!);
    expect(codeLoc.searchParams.get("state")).toBe("csrf-preserving-state");
    expect(codeLoc.searchParams.get("code")).toBeTruthy();
  });

  it("authorization endpoint sets Cache-Control: no-store", async () => {
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: DELAY_MS });
    const cookie = await getSessionCookie(app, "bob@example.com", "bobs-password");
    const res = await app.request(
      "/api/auth/oauth2/authorize?client_id=my-app&redirect_uri=https://app.example.com/callback&response_type=code&scope=openid",
      { headers: { Cookie: cookie } }
    );
    // authorize redirects (302) when session is valid — Cache-Control still set
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
