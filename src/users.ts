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

export interface UserConfig {
  email: string;       // also used as sub
  name: string;
  password: string;    // "enc:..." in YAML
  clients: UserClientEntry[];
}

interface UsersFile {
  users: UserConfig[];
}

// Decrypt all user passwords. Called once at startup.
export async function loadUsers(): Promise<Map<string, UserConfig>> {
  const secret = process.env.BETTER_AUTH_SECRET!;
  const path = process.env.USERS_CONFIG ?? "./users.yml";
  const { users } = YAML.parse(readFileSync(path, "utf-8")) as UsersFile;

  const map = new Map<string, UserConfig>();
  for (const u of users) {
    map.set(u.email.toLowerCase(), {
      ...u,
      password: await decryptSecret(u.password, secret),
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
