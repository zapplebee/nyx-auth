// Tests for src/validate.ts
// Ref: https://github.com/zapplebee/nyx-auth/issues/14

import { describe, it, expect, afterEach } from "bun:test";
import { validateClients, validateUsers, validateConfig, validateClaimKey } from "../src/validate";
import type { ClientConfig } from "../src/clients";
import type { UserConfig } from "../src/users";
import { OTP_OUT } from "../src/users";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeClient(overrides: Partial<ClientConfig> = {}): ClientConfig {
  return {
    name: "Test App",
    clientId: "test-app",
    clientSecret: "a-very-secret-value",
    type: "web",
    redirectURLs: ["https://app.example.com/callback"],
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    email: "alice@example.com",
    name: "Alice Smith",
    password: "decrypted-password",
    otpSeed: OTP_OUT,
    clients: [],
    ...overrides,
  };
}

function clientMap(...clients: ClientConfig[]): Map<string, ClientConfig> {
  return new Map(clients.map((c) => [c.clientId, c]));
}

function userMap(...users: UserConfig[]): Map<string, UserConfig> {
  return new Map(users.map((u) => [u.email.toLowerCase(), u]));
}

// ── validateClients ───────────────────────────────────────────────────────────

describe("validateClients", () => {
  it("returns no errors for a valid client", () => {
    expect(validateClients(clientMap(makeClient()))).toEqual([]);
  });

  it("errors when no clients are defined", () => {
    const errors = validateClients(new Map());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("no clients defined");
  });

  it("errors when clientId is empty", () => {
    const errors = validateClients(clientMap(makeClient({ clientId: "" })));
    expect(errors.some((e) => e.includes("clientId must not be empty"))).toBe(true);
  });

  it("errors when name is empty", () => {
    const errors = validateClients(clientMap(makeClient({ name: "  " })));
    expect(errors.some((e) => e.includes("name must not be empty"))).toBe(true);
  });

  it("errors on an invalid client type", () => {
    const errors = validateClients(
      clientMap(makeClient({ type: "server-side" as unknown as ClientConfig["type"] }))
    );
    expect(errors.some((e) => e.includes('invalid type "server-side"'))).toBe(true);
  });

  it("accepts all valid client types", () => {
    for (const type of ["web", "native", "user-agent-based", "public"] as const) {
      const client = makeClient({ type, clientSecret: type === "public" ? "" : "secret" });
      expect(validateClients(clientMap(client))).toEqual([]);
    }
  });

  it("errors when a non-public client has no clientSecret", () => {
    const errors = validateClients(clientMap(makeClient({ type: "web", clientSecret: "" })));
    expect(errors.some((e) => e.includes("clientSecret is required"))).toBe(true);
  });

  it("does not require clientSecret for public clients", () => {
    const errors = validateClients(
      clientMap(makeClient({ type: "public", clientSecret: "" }))
    );
    expect(errors.some((e) => e.includes("clientSecret"))).toBe(false);
  });

  it("errors when a redirectURL is not a valid URL", () => {
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["not-a-url", "https://good.example.com/cb"] }))
    );
    expect(errors.some((e) => e.includes('"not-a-url" is not a valid URL'))).toBe(true);
  });

  it("accepts relative-path-free callback URLs", () => {
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["https://app.example.com/auth/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("collects multiple errors at once", () => {
    const errors = validateClients(
      clientMap(makeClient({ name: "", redirectURLs: ["bad-url"] }))
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── validateUsers ─────────────────────────────────────────────────────────────

describe("validateUsers", () => {
  it("returns no errors for a valid user", () => {
    expect(validateUsers(userMap(makeUser()))).toEqual([]);
  });

  it("errors when no users are defined", () => {
    const errors = validateUsers(new Map());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("no users defined");
  });

  it("errors on an invalid email address", () => {
    const errors = validateUsers(userMap(makeUser({ email: "not-an-email" })));
    expect(errors.some((e) => e.includes("not a valid email address"))).toBe(true);
  });

  it("accepts a valid email with subdomains and plus-addressing", () => {
    const errors = validateUsers(
      userMap(makeUser({ email: "alice+tag@mail.example.co.uk" }))
    );
    expect(errors).toEqual([]);
  });

  it("errors when name is empty", () => {
    const errors = validateUsers(userMap(makeUser({ name: "" })));
    expect(errors.some((e) => e.includes("name must not be empty"))).toBe(true);
  });

  it("errors when password is empty", () => {
    const errors = validateUsers(userMap(makeUser({ password: "" })));
    expect(errors.some((e) => e.includes("password must not be empty"))).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const errors = validateUsers(
      userMap(makeUser({ name: "", password: "", email: "bad" }))
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── http redirect URI rejection in production (ref: https://github.com/zapplebee/nyx-auth/issues/12) ──

describe("validateClients — http redirect URIs in production", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it("accepts https:// redirect URIs in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["https://app.example.com/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("accepts http:// redirect URIs when not in production", () => {
    delete process.env.NODE_ENV;
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://app.example.com/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("rejects non-localhost http:// redirect URIs in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://app.example.com/callback"] }))
    );
    expect(errors.some((e) => e.includes("http://") && e.includes("not allowed in production"))).toBe(true);
  });

  it("allows http://localhost in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://localhost:3000/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("allows http://127.0.0.1 in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://127.0.0.1:8080/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("allows http://0.0.0.0 in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://0.0.0.0:4000/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("allows http://[::1] in production", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://[::1]:9000/callback"] }))
    );
    expect(errors).toEqual([]);
  });

  it("includes RFC 6749 §10.6 reference in the error message", () => {
    process.env.NODE_ENV = "production";
    const errors = validateClients(
      clientMap(makeClient({ redirectURLs: ["http://evil.example.com/callback"] }))
    );
    expect(errors.some((e) => e.includes("RFC 6749"))).toBe(true);
  });
});

// ── validateClaimKey (ref: https://github.com/zapplebee/nyx-auth/issues/21) ──

describe("validateClaimKey", () => {
  it("accepts plain short identifiers", () => {
    expect(validateClaimKey("oid")).toBeUndefined();
    expect(validateClaimKey("tid")).toBeUndefined();
    expect(validateClaimKey("groups")).toBeUndefined();
  });

  it("accepts URI claim keys with kebab-case path components", () => {
    expect(validateClaimKey("https://example.com/email-verification")).toBeUndefined();
    expect(validateClaimKey("https://example.com/tenant-id")).toBeUndefined();
    expect(validateClaimKey("https://example.com/my-app/user-role")).toBeUndefined();
  });

  it("rejects URI claim keys with camelCase path components", () => {
    const err = validateClaimKey("https://example.com/emailVerification");
    expect(err).toBeDefined();
    expect(err).toContain("camelCase");
    expect(err).toContain("email-verification");
  });

  it("includes the suggested kebab-case form in the error", () => {
    const err = validateClaimKey("https://example.com/userDisplayName");
    expect(err).toContain("user-display-name");
  });

  it("rejects camelCase in nested path segments", () => {
    const err = validateClaimKey("https://example.com/myApp/userRole");
    expect(err).toBeDefined();
    // First offending segment (myApp) is reported
    expect(err).toContain("camelCase");
  });

  it("accepts URI with all-lowercase path components", () => {
    expect(validateClaimKey("https://example.com/user")).toBeUndefined();
    expect(validateClaimKey("https://example.com/app/role")).toBeUndefined();
  });
});

// ── validateUsers custom claims integration ───────────────────────────────────

describe("validateUsers custom claims", () => {
  // Ref: https://github.com/zapplebee/nyx-auth/issues/21
  it("accepts users with no custom claims", () => {
    expect(validateUsers(userMap(makeUser()))).toEqual([]);
  });

  it("accepts users with valid plain-identifier custom claims", () => {
    const errors = validateUsers(
      userMap(makeUser({ claims: { oid: "abc", tid: "xyz", groups: ["g1"] } }))
    );
    expect(errors).toEqual([]);
  });

  it("accepts users with valid URI-style kebab-case custom claims", () => {
    const errors = validateUsers(
      userMap(makeUser({ claims: { "https://example.com/tenant-id": "abc" } }))
    );
    expect(errors).toEqual([]);
  });

  it("errors when a URI claim key uses camelCase", () => {
    const errors = validateUsers(
      userMap(makeUser({ claims: { "https://example.com/tenantId": "abc" } }))
    );
    expect(errors.some((e) => e.includes("tenantId") && e.includes("camelCase"))).toBe(true);
  });

  it("collects errors for all invalid claim keys", () => {
    const errors = validateUsers(
      userMap(makeUser({
        claims: {
          "https://example.com/tenantId": "abc",
          "https://example.com/userId": "def",
        },
      }))
    );
    expect(errors.filter((e) => e.includes("camelCase")).length).toBe(2);
  });
});

// ── validateConfig ────────────────────────────────────────────────────────────

describe("validateConfig", () => {
  it("returns no errors when both clients and users are valid", () => {
    expect(
      validateConfig(clientMap(makeClient()), userMap(makeUser()))
    ).toEqual([]);
  });

  it("accumulates errors from both clients and users", () => {
    const errors = validateConfig(new Map(), new Map());
    // At minimum: "no clients" + "no users"
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
