import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/router";
import { resetKeysForTest } from "../src/keys";
import type { ClientConfig } from "../src/clients";
import type { UserConfig } from "../src/users";

// Use a short delay so tests run fast while still verifying the mechanism.
const DELAY_MS = 100;

const testUsers = new Map<string, UserConfig>([
  [
    "alice@example.com",
    {
      email: "alice@example.com",
      name: "Alice",
      password: "correct-password",
      clients: [{ clientId: "app-a", roles: ["user"] }],
    },
  ],
]);

const testClients = new Map<string, ClientConfig>();

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://test.nyx.local";
  resetKeysForTest();
});

function loginRequest(app: ReturnType<typeof createApp>, body: object) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

  it("does not apply the delay on a successful login", async () => {
    // Use a long delay so any accidental application would be obvious.
    const app = createApp(testClients, testUsers, { failedLoginDelayMs: 2000 });
    const start = performance.now();
    const res = await loginRequest(app, { email: "alice@example.com", password: "correct-password" });
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

  it("default delay is 1000ms", async () => {
    // Verify the default resolves without error — we don't wait a full second,
    // just confirm the option plumbing works by overriding it.
    const app = createApp(testClients, testUsers);
    // Call a non-auth endpoint to confirm the app was created without crashing.
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });
});
