import { describe, it, expect } from "bun:test";
import { verifyPassword, rolesForClient, requiresTotp, OTP_OUT, type UserConfig } from "../src/users";

const user: UserConfig = {
  email: "alice@example.com",
  name: "Alice",
  password: "correct-horse-battery-staple",
  otpSeed: "JBSWY3DPEHPK3PXP",
  clients: [
    { clientId: "app-a", roles: ["admin", "editor"] },
    { clientId: "app-b", roles: ["viewer"] },
    { clientId: "app-c", roles: [] },
  ],
};

describe("verifyPassword", () => {
  it("returns true when passwords match", () => {
    expect(verifyPassword("correct-horse-battery-staple", "correct-horse-battery-staple")).toBe(true);
  });

  it("returns false when passwords differ", () => {
    expect(verifyPassword("correct-horse-battery-staple", "wrong-password")).toBe(false);
  });

  it("returns false for empty provided password", () => {
    expect(verifyPassword("correct-horse-battery-staple", "")).toBe(false);
  });

  it("returns false when stored is empty and provided is not", () => {
    expect(verifyPassword("", "something")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(verifyPassword("", "")).toBe(true);
  });
});

describe("rolesForClient", () => {
  it("returns roles for a known client", () => {
    expect(rolesForClient(user, "app-a")).toEqual(["admin", "editor"]);
    expect(rolesForClient(user, "app-b")).toEqual(["viewer"]);
  });

  it("returns an empty array for a client with no roles defined", () => {
    expect(rolesForClient(user, "app-c")).toEqual([]);
  });

  it("returns an empty array for an unknown client", () => {
    expect(rolesForClient(user, "unknown-client")).toEqual([]);
  });
});

describe("requiresTotp", () => {
  it("returns true when otpSeed is a real seed", () => {
    expect(requiresTotp({ ...user, otpSeed: "JBSWY3DPEHPK3PXP" })).toBe(true);
  });

  it("returns false when otpSeed is OPT_OUT", () => {
    expect(requiresTotp({ ...user, otpSeed: OTP_OUT })).toBe(false);
  });

  it("returns false when otpSeed is undefined", () => {
    const { otpSeed: _, ...noOtp } = user;
    expect(requiresTotp(noOtp as UserConfig)).toBe(false);
  });
});
