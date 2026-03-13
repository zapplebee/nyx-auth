// Loads users from users.yml and provides password verification.
//
// users.yml drives all user configuration — no database or admin API.
// Use `bun run users:set-password <email>` to set/rotate a user's password.

import { readFileSync } from "node:fs";
import { YAML } from "bun";
import { decryptSecret } from "./crypto";

export interface UserClientEntry {
  clientId: string;
  // Roles included in OIDC tokens when this user authenticates to this client.
  roles: string[];
}

export const OTP_OUT = "OPT_OUT";

export interface UserConfig {
  email: string;       // also used as sub
  name: string;
  password: string;    // "enc:..." in YAML
  /** Base32 TOTP secret (decrypted), or OPT_OUT, or undefined (treated as OPT_OUT). */
  otpSeed?: string;
  clients: UserClientEntry[];
  /**
   * Arbitrary extra claims included verbatim in the ID token and access token.
   * Use this to emulate IdP-specific fields (e.g. Microsoft Entra's `oid`,
   * `tid`, `groups`, `given_name`). Standard claims (sub, email, name, roles,
   * iss, aud, iat, exp) always override any matching key defined here.
   */
  claims?: Record<string, unknown>;
}

/** Returns true when the user must present a TOTP code at login. */
export function requiresTotp(user: UserConfig): boolean {
  return !!user.otpSeed && user.otpSeed !== OTP_OUT;
}

interface UsersFile {
  users: UserConfig[];
}

// Decrypt all user passwords. Called once at startup.
export async function loadUsers(): Promise<Map<string, UserConfig>> {
  const secret = process.env.NYX_SECRET!;
  const path = process.env.USERS_CONFIG ?? "./users.yml";
  const { users } = YAML.parse(readFileSync(path, "utf-8")) as UsersFile;

  const map = new Map<string, UserConfig>();
  for (const u of users) {
    const raw = u as UserConfig & { otpSeed?: string };
    const otpSeed =
      raw.otpSeed && raw.otpSeed !== OTP_OUT
        ? await decryptSecret(raw.otpSeed, secret)
        : raw.otpSeed; // undefined or "OPT_OUT" — no decryption needed
    map.set(u.email.toLowerCase(), {
      ...u,
      password: await decryptSecret(u.password, secret),
      otpSeed,
    });
  }
  return map;
}

// Constant-time string comparison to avoid timing attacks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Returns the user's roles for a given client, or [] if the client isn't listed.
export function rolesForClient(user: UserConfig, clientId: string): string[] {
  return user.clients.find((c) => c.clientId === clientId)?.roles ?? [];
}

export function verifyPassword(stored: string, provided: string): boolean {
  return safeEqual(stored, provided);
}
