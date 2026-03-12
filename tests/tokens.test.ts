import { describe, it, expect, beforeEach } from "bun:test";
import { resetKeysForTest } from "../src/keys";
import {
  issueSessionToken,
  verifySessionToken,
  issueAuthCode,
  decodeAuthCode,
  issueIdToken,
  issueAccessToken,
  issueClientCredentialsToken,
  verifyAccessToken,
  issuePendingTotpToken,
  verifyPendingTotpToken,
  unsafeDecodePayload,
  safeEqual,
} from "../src/tokens";
import type { UserConfig } from "../src/users";
import type { ClientConfig } from "../src/clients";

// Use a predictable issuer for all token tests.
const TEST_ISSUER = "http://test.nyx.local";

beforeEach(() => {
  process.env.NYX_URL = TEST_ISSUER;
  resetKeysForTest();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const testUser: UserConfig = {
  email: "alice@example.com",
  name: "Alice",
  password: "irrelevant-in-token-tests",
  clients: [{ clientId: "my-app", roles: ["admin", "user"] }],
};

const testClient: ClientConfig = {
  name: "My App",
  clientId: "my-app",
  clientSecret: "super-secret",
  type: "web",
  redirectURLs: ["https://myapp.example.com/callback"],
  skipConsent: true,
};

// ── Session tokens ────────────────────────────────────────────────────────────

describe("session tokens", () => {
  it("round-trips email through issue/verify", async () => {
    const token = await issueSessionToken("alice@example.com");
    const email = await verifySessionToken(token);
    expect(email).toBe("alice@example.com");
  });

  it("returns null for empty string", async () => {
    expect(await verifySessionToken("")).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const token = await issueSessionToken("alice@example.com");
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("payload contains type=session", async () => {
    const token = await issueSessionToken("bob@example.com");
    const payload = unsafeDecodePayload(token);
    expect(payload.type).toBe("session");
    expect(payload.sub).toBe("bob@example.com");
  });
});

// ── Auth codes ────────────────────────────────────────────────────────────────

describe("auth codes", () => {
  const codeParams = {
    sub: "alice@example.com",
    clientId: "my-app",
    redirectUri: "https://myapp.example.com/callback",
    scope: "openid email",
    nonce: "n-0S6_WzA2Mj",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    codeChallengeMethod: "S256",
  };

  it("round-trips params through issue/decode", async () => {
    const code = await issueAuthCode(codeParams);
    const payload = await decodeAuthCode(code);
    expect(payload.sub).toBe(codeParams.sub);
    expect(payload.clientId).toBe(codeParams.clientId);
    expect(payload.redirectUri).toBe(codeParams.redirectUri);
    expect(payload.scope).toBe(codeParams.scope);
    expect(payload.nonce).toBe(codeParams.nonce);
    expect(payload.codeChallenge).toBe(codeParams.codeChallenge);
    expect(payload.codeChallengeMethod).toBe(codeParams.codeChallengeMethod);
  });

  it("rejects a tampered code", async () => {
    const code = await issueAuthCode(codeParams);
    const tampered = code.slice(0, -5) + "XXXXX";
    await expect(decodeAuthCode(tampered)).rejects.toThrow();
  });

  it("rejects a token that is not an auth_code", async () => {
    // Session tokens lack an issuer claim, so decodeAuthCode throws before
    // it can reach the type check — any error means rejection.
    const sessionToken = await issueSessionToken("alice@example.com");
    await expect(decodeAuthCode(sessionToken)).rejects.toThrow();
  });

  it("issues without optional fields", async () => {
    const code = await issueAuthCode({
      sub: "alice@example.com",
      clientId: "my-app",
      redirectUri: "https://myapp.example.com/callback",
      scope: "openid",
    });
    const payload = await decodeAuthCode(code);
    expect(payload.nonce).toBeUndefined();
    expect(payload.codeChallenge).toBeUndefined();
  });
});

// ── ID tokens ─────────────────────────────────────────────────────────────────

describe("ID tokens", () => {
  it("contains expected claims", async () => {
    const token = await issueIdToken(testUser, testClient, "my-nonce");
    const payload = unsafeDecodePayload(token);
    expect(payload.sub).toBe("alice@example.com");
    expect(payload.email).toBe("alice@example.com");
    expect(payload.name).toBe("Alice");
    expect(payload.nonce).toBe("my-nonce");
    expect(payload.roles).toEqual(["admin", "user"]);
    expect(payload.aud).toBe("my-app");
    expect(payload.iss).toBe(TEST_ISSUER);
  });

  it("omits nonce when not provided", async () => {
    const token = await issueIdToken(testUser, testClient);
    const payload = unsafeDecodePayload(token);
    expect(payload.nonce).toBeUndefined();
  });

  it("returns empty roles for unknown client", async () => {
    const otherClient: ClientConfig = { ...testClient, clientId: "other-app" };
    const token = await issueIdToken(testUser, otherClient);
    const payload = unsafeDecodePayload(token);
    expect(payload.roles).toEqual([]);
  });
});

// ── Access tokens ─────────────────────────────────────────────────────────────

describe("access tokens", () => {
  it("verifies and returns correct claims", async () => {
    const token = await issueAccessToken(testUser, testClient, "openid email profile");
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("alice@example.com");
    expect(payload.scope).toBe("openid email profile");
    expect(payload.roles).toEqual(["admin", "user"]);
    expect(payload.iss).toBe(TEST_ISSUER);
    expect(payload.aud).toBe(TEST_ISSUER);
  });

  it("rejects a session token as an access token", async () => {
    const sessionToken = await issueSessionToken("alice@example.com");
    await expect(verifyAccessToken(sessionToken)).rejects.toThrow();
  });

  it("rejects a tampered access token", async () => {
    const token = await issueAccessToken(testUser, testClient, "openid");
    const tampered = token.slice(0, -5) + "XXXXX";
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });
});

// ── Client credentials tokens ─────────────────────────────────────────────────

describe("client credentials tokens", () => {
  const machineClient: ClientConfig = {
    ...testClient,
    clientId: "my-service",
    roles: ["read", "write"],
  };

  it("contains expected claims", async () => {
    const token = await issueClientCredentialsToken(machineClient, "api:read");
    const payload = unsafeDecodePayload(token);
    expect(payload.sub).toBe("my-service");
    expect(payload.client_id).toBe("my-service");
    expect(payload.scope).toBe("api:read");
    expect(payload.roles).toEqual(["read", "write"]);
    expect(payload.iss).toBe(TEST_ISSUER);
    expect(payload.aud).toBe(TEST_ISSUER);
  });

  it("token verifies as a valid access token", async () => {
    const token = await issueClientCredentialsToken(machineClient, "api:read");
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("my-service");
    expect(payload.scope).toBe("api:read");
  });

  it("uses empty roles array when client has none", async () => {
    const noRolesClient: ClientConfig = { ...machineClient, roles: undefined };
    const token = await issueClientCredentialsToken(noRolesClient, "");
    const payload = unsafeDecodePayload(token);
    expect(payload.roles).toEqual([]);
  });

  it("does not contain email or name claims", async () => {
    const token = await issueClientCredentialsToken(machineClient, "api:read");
    const payload = unsafeDecodePayload(token);
    expect(payload.email).toBeUndefined();
    expect(payload.name).toBeUndefined();
  });
});

// ── Pending-TOTP tokens ───────────────────────────────────────────────────────

describe("pending TOTP tokens", () => {
  it("round-trips email through issue/verify", async () => {
    const token = await issuePendingTotpToken("alice@example.com");
    const email = await verifyPendingTotpToken(token);
    expect(email).toBe("alice@example.com");
  });

  it("returns null for empty string", async () => {
    expect(await verifyPendingTotpToken("")).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const token = await issuePendingTotpToken("alice@example.com");
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(await verifyPendingTotpToken(tampered)).toBeNull();
  });

  it("returns null for a session token (wrong type)", async () => {
    const sessionToken = await issueSessionToken("alice@example.com");
    expect(await verifyPendingTotpToken(sessionToken)).toBeNull();
  });

  it("payload contains type=pending_totp and correct issuer", async () => {
    const token = await issuePendingTotpToken("bob@example.com");
    const payload = unsafeDecodePayload(token);
    expect(payload.type).toBe("pending_totp");
    expect(payload.sub).toBe("bob@example.com");
    expect(payload.iss).toBe(TEST_ISSUER);
  });
});

// ── safeEqual ─────────────────────────────────────────────────────────────────

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeEqual("hello", "world")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeEqual("short", "a-longer-string")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

// ── Custom claims ─────────────────────────────────────────────────────────────

const userWithClaims: UserConfig = {
  email: "carol@example.com",
  name: "Carol",
  password: "irrelevant",
  clients: [{ clientId: "my-app", roles: ["user"] }],
  claims: {
    oid: "00000000-0000-0000-0000-000000000001",
    tid: "tenant-abc",
    given_name: "Carol",
    family_name: "Smith",
    groups: ["group-a", "group-b"],
    nested: { level: 1 },
  },
};

describe("custom claims in ID token", () => {
  it("includes custom claims in the ID token payload", async () => {
    const token = await issueIdToken(userWithClaims, testClient);
    const payload = unsafeDecodePayload(token);

    expect(payload.oid).toBe("00000000-0000-0000-0000-000000000001");
    expect(payload.tid).toBe("tenant-abc");
    expect(payload.given_name).toBe("Carol");
    expect(payload.family_name).toBe("Smith");
    expect(payload.groups).toEqual(["group-a", "group-b"]);
    expect(payload.nested).toEqual({ level: 1 });
  });

  it("standard claims override any matching custom claim", async () => {
    const userTryingToSpoof: UserConfig = {
      ...userWithClaims,
      claims: { sub: "evil@attacker.com", email: "evil@attacker.com", iss: "https://evil.com" },
    };
    const token = await issueIdToken(userTryingToSpoof, testClient);
    const payload = unsafeDecodePayload(token);

    expect(payload.sub).toBe("carol@example.com");
    expect(payload.email).toBe("carol@example.com");
    // iss is set by jose's .setIssuer() which overrides the payload field
    expect(payload.iss).toBe(TEST_ISSUER);
  });

  it("works correctly when no custom claims are defined", async () => {
    const token = await issueIdToken(testUser, testClient);
    const payload = unsafeDecodePayload(token);
    expect(payload.sub).toBe("alice@example.com");
    expect(payload.email).toBe("alice@example.com");
  });
});

describe("custom claims in access token", () => {
  it("includes custom claims in the access token payload", async () => {
    const token = await issueAccessToken(userWithClaims, testClient, "openid profile");
    const payload = unsafeDecodePayload(token);

    expect(payload.oid).toBe("00000000-0000-0000-0000-000000000001");
    expect(payload.tid).toBe("tenant-abc");
    expect(payload.groups).toEqual(["group-a", "group-b"]);
  });

  it("standard claims override any matching custom claim", async () => {
    const userTryingToSpoof: UserConfig = {
      ...userWithClaims,
      claims: { sub: "evil@attacker.com", scope: "admin superpower" },
    };
    const token = await issueAccessToken(userTryingToSpoof, testClient, "openid");
    const payload = unsafeDecodePayload(token);

    expect(payload.sub).toBe("carol@example.com");
    expect(payload.scope).toBe("openid");
  });
});
