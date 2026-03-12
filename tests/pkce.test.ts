import { describe, it, expect } from "bun:test";
import { b64url, verifyPKCE } from "../src/pkce";

describe("b64url", () => {
  it("encodes an empty buffer", () => {
    expect(b64url(new ArrayBuffer(0))).toBe("");
  });

  it("produces URL-safe base64 without padding", () => {
    const result = b64url(new Uint8Array([0xfb, 0xff, 0xfe]).buffer);
    expect(result).not.toContain("+");
    expect(result).not.toContain("/");
    expect(result).not.toContain("=");
  });

  it("matches known RFC 7636 example encoding", async () => {
    // code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // SHA-256 of that is known; check that b64url round-trips the digest
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    );
    const encoded = b64url(digest);
    expect(encoded).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("verifyPKCE", () => {
  it("returns true for a matching verifier/challenge pair", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await verifyPKCE(verifier, challenge)).toBe(true);
  });

  it("returns false when the verifier does not match", async () => {
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await verifyPKCE("wrong-verifier", challenge)).toBe(false);
  });

  it("returns false when verifier is empty", async () => {
    expect(await verifyPKCE("", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
  });

  it("returns false when challenge is empty", async () => {
    expect(await verifyPKCE("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "")).toBe(false);
  });

  it("returns false for a tampered challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const tampered = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cN"; // last char changed
    expect(await verifyPKCE(verifier, tampered)).toBe(false);
  });
});
