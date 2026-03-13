// Tests for src/startup-checks.ts
// Ref: https://github.com/zapplebee/nyx-auth/issues/13
// Ref: https://github.com/zapplebee/nyx-auth/issues/19
// Ref: https://github.com/zapplebee/nyx-auth/issues/30

import { describe, it, expect, afterEach } from "bun:test";
import { validateEnvironment } from "../src/startup-checks";

// A valid NYX_SECRET: base64 encoding of exactly 32 zero bytes.
// Equivalent to: openssl rand -base64 32 (same format, deterministic for tests).
const VALID_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// A valid base64 string that decodes to only 16 bytes (wrong length).
const SHORT_SECRET = "AAAAAAAAAAAAAAAAAAAAAA=="; // 16 bytes

// A valid base64 string that decodes to 48 bytes (wrong length).
const LONG_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 48 bytes

const savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

describe("validateEnvironment — NYX_SECRET", () => {
  it("returns no errors when NYX_SECRET is valid base64 (32 bytes) and NYX_URL is valid", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    expect(validateEnvironment()).toEqual([]);
  });

  it("errors when NYX_SECRET is not set", () => {
    setEnv({ NYX_SECRET: undefined, NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("NYX_SECRET is not set");
    expect(errors[0]).toContain("openssl rand -base64 32");
  });

  it("errors when NYX_SECRET is not valid base64", () => {
    setEnv({ NYX_SECRET: "not-valid-base64!!!", NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("not valid base64");
    expect(errors[0]).toContain("openssl rand -base64 32");
  });

  it("errors when NYX_SECRET is valid base64 but decodes to fewer than 32 bytes", () => {
    setEnv({ NYX_SECRET: SHORT_SECRET, NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    // Ref issue #30: message must include expected and actual byte counts
    expect(errors[0]).toContain("expected 32 bytes");
    expect(errors[0]).toContain("got 16 byte(s)");
    expect(errors[0]).toContain("openssl rand -base64 32");
  });

  it("errors when NYX_SECRET is valid base64 but decodes to more than 32 bytes", () => {
    setEnv({ NYX_SECRET: LONG_SECRET, NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("expected 32 bytes");
    expect(errors[0]).toContain("got 48 byte(s)");
  });

  it("passes when NYX_SECRET is valid base64 decoding to exactly 32 bytes", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "https://auth.example.com", NODE_ENV: undefined });
    expect(validateEnvironment()).toEqual([]);
  });
});

describe("validateEnvironment — NYX_URL", () => {
  it("errors when NYX_URL is not set", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: undefined, NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("NYX_URL is not set");
  });

  it("errors when NYX_URL is not a valid URL", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "not-a-url", NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("NYX_URL is not a valid URL");
    expect(errors[0]).toContain("not-a-url");
  });

  it("allows HTTP when NODE_ENV is not production", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "http://auth.example.com", NODE_ENV: undefined });
    expect(validateEnvironment()).toEqual([]);
  });

  it("allows HTTP for any hostname when NODE_ENV is not production", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "http://nyx-auth:3000", NODE_ENV: "test" });
    expect(validateEnvironment()).toEqual([]);
  });

  it("errors when NODE_ENV=production and NYX_URL uses HTTP", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "http://auth.example.com", NODE_ENV: "production" });
    const errors = validateEnvironment();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("NYX_URL must use HTTPS in production");
  });

  it("passes when NODE_ENV=production and NYX_URL uses HTTPS", () => {
    setEnv({ NYX_SECRET: VALID_SECRET, NYX_URL: "https://auth.example.com", NODE_ENV: "production" });
    expect(validateEnvironment()).toEqual([]);
  });

  it("reports all errors at once when multiple vars are invalid", () => {
    setEnv({ NYX_SECRET: undefined, NYX_URL: undefined, NODE_ENV: undefined });
    const errors = validateEnvironment();
    expect(errors.length).toBe(2);
    expect(errors.some((e) => e.includes("NYX_SECRET is not set"))).toBe(true);
    expect(errors.some((e) => e.includes("NYX_URL is not set"))).toBe(true);
  });
});
