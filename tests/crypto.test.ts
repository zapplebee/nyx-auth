import { describe, it, expect } from "bun:test";
import { encryptSecret, decryptSecret } from "../src/crypto";

const SECRET = "test-master-secret-32chars-padded";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", async () => {
    const ciphertext = await encryptSecret("my-client-secret", SECRET);
    const plaintext = await decryptSecret(ciphertext, SECRET);
    expect(plaintext).toBe("my-client-secret");
  });

  it("output starts with enc: prefix", async () => {
    const ciphertext = await encryptSecret("value", SECRET);
    expect(ciphertext.startsWith("enc:")).toBe(true);
  });

  it("produces unique ciphertexts (random IV)", async () => {
    const a = await encryptSecret("same-value", SECRET);
    const b = await encryptSecret("same-value", SECRET);
    expect(a).not.toBe(b);
  });

  it("decrypts ciphertexts from different encryptions to the same value", async () => {
    const a = await encryptSecret("same-value", SECRET);
    const b = await encryptSecret("same-value", SECRET);
    expect(await decryptSecret(a, SECRET)).toBe("same-value");
    expect(await decryptSecret(b, SECRET)).toBe("same-value");
  });

  it("throws on wrong secret", async () => {
    const ciphertext = await encryptSecret("my-value", SECRET);
    await expect(decryptSecret(ciphertext, "wrong-secret")).rejects.toThrow();
  });

  it("throws when enc: prefix is missing", async () => {
    await expect(decryptSecret("plaintext-no-prefix", SECRET)).rejects.toThrow("enc:");
  });

  it("throws on truncated ciphertext", async () => {
    const ciphertext = await encryptSecret("my-value", SECRET);
    const truncated = ciphertext.slice(0, ciphertext.length - 10);
    await expect(decryptSecret(truncated, SECRET)).rejects.toThrow();
  });

  it("round-trips an empty string", async () => {
    const ciphertext = await encryptSecret("", SECRET);
    expect(await decryptSecret(ciphertext, SECRET)).toBe("");
  });
});
