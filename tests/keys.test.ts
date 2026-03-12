import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getKeys, resetKeysForTest } from "../src/keys";

beforeEach(() => {
  resetKeysForTest();
  delete process.env.SIGNING_PRIVATE_JWK;
});

afterEach(() => {
  resetKeysForTest();
  delete process.env.SIGNING_PRIVATE_JWK;
});

describe("getKeys", () => {
  it("generates a key pair with expected shape", async () => {
    const keys = await getKeys();
    expect(keys.privateKey).toBeDefined();
    expect(keys.publicKey).toBeDefined();
    expect(keys.publicJwk).toBeDefined();
    expect(typeof keys.kid).toBe("string");
  });

  it("public JWK has the correct fields", async () => {
    const { publicJwk } = await getKeys();
    expect(publicJwk.kty).toBe("EC");
    expect(publicJwk.crv).toBe("P-256");
    expect(publicJwk.use).toBe("sig");
    expect(publicJwk.alg).toBe("ES256");
    expect(publicJwk.kid).toBeDefined();
    // Private key field must not be present
    expect((publicJwk as Record<string, unknown>).d).toBeUndefined();
  });

  it("returns the same singleton on repeated calls", async () => {
    const first = await getKeys();
    const second = await getKeys();
    expect(first).toBe(second);
  });

  it("generates a new key after resetKeysForTest()", async () => {
    const first = await getKeys();
    resetKeysForTest();
    const second = await getKeys();
    expect(first).not.toBe(second);
  });

  it("imports from SIGNING_PRIVATE_JWK when set", async () => {
    // Use { extractable: true } so the private key can be exported as JWK.
    const { generateKeyPair, exportJWK } = await import("jose");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = await exportJWK(privateKey);
    jwk.kid = "stable-test-key";

    process.env.SIGNING_PRIVATE_JWK = JSON.stringify(jwk);

    const keys = await getKeys();
    expect(keys.kid).toBe("stable-test-key");
    expect((keys.publicJwk as Record<string, unknown>).d).toBeUndefined();
  });

  it("imported key uses provided kid", async () => {
    const { generateKeyPair, exportJWK } = await import("jose");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = { ...(await exportJWK(privateKey)), kid: "my-custom-kid" };
    process.env.SIGNING_PRIVATE_JWK = JSON.stringify(jwk);

    const { kid } = await getKeys();
    expect(kid).toBe("my-custom-kid");
  });
});
