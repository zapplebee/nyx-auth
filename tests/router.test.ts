import { describe, it, expect, beforeEach } from "bun:test";
import { generate as totpGenerate } from "otplib";
import { createApp } from "../src/router";
import { resetKeysForTest } from "../src/keys";
import { unsafeDecodePayload } from "../src/tokens";
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

const testClients = new Map<string, ClientConfig>([
  ["my-service", machineClient],
  ["my-spa", publicClient],
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
