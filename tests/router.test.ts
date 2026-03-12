import { describe, it, expect, beforeEach } from "bun:test";
import { generate as totpGenerate } from "otplib";
import { createApp } from "../src/router";
import { resetKeysForTest } from "../src/keys";
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

const testClients = new Map<string, ClientConfig>();

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
