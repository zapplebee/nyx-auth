#!/usr/bin/env bun
// Usage: bun run users:set-password <email>
//
// Prompts for the user's plain-text password, encrypts it with AES-256-GCM
// (key derived from NYX_SECRET), and writes it back to users.yml.
//
// The encrypted value starts with "enc:" and is safe to commit.

import { readFileSync, writeFileSync } from "node:fs";
import { YAML } from "bun";
import { encryptSecret } from "../src/crypto";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun run users:set-password <email>");
  process.exit(1);
}

const authSecret = process.env.NYX_SECRET;
if (!authSecret) {
  console.error("NYX_SECRET is not set.");
  process.exit(1);
}

const path = process.env.USERS_CONFIG ?? "./users.yml";
const yamlText = readFileSync(path, "utf-8");
const config = YAML.parse(yamlText) as {
  users: Array<{ email: string; [k: string]: unknown }>;
};

const user = config.users?.find((u) => u.email.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user with email "${email}" found in ${path}.`);
  process.exit(1);
}

const plainPassword = prompt(`Enter new password for "${email}": `);
if (!plainPassword) {
  console.error("No password entered.");
  process.exit(1);
}

const encrypted = await encryptSecret(plainPassword, authSecret);
user.password = encrypted;

writeFileSync(path, serializeUsersYaml(config));
console.log(`✓ Password updated for "${email}" in ${path}`);

// ── Simple deterministic YAML serializer for users.yml ───────────────────────

interface UserClientEntry {
  clientId: string;
  roles: string[];
}

interface UserEntry {
  email: string;
  name: string;
  password?: string;
  clients: UserClientEntry[];
}

function serializeUsersYaml(cfg: { users: UserEntry[] }): string {
  const lines: string[] = ["users:"];
  for (const u of cfg.users) {
    lines.push(`  - email: ${yamlStr(u.email)}`);
    lines.push(`    name: ${yamlStr(u.name)}`);
    if (u.password !== undefined) {
      lines.push(`    password: ${yamlStr(u.password)}`);
    }
    lines.push("    clients:");
    for (const c of u.clients ?? []) {
      lines.push(`      - clientId: ${yamlStr(c.clientId)}`);
      lines.push(`        roles:`);
      for (const r of c.roles ?? []) {
        lines.push(`          - ${r}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

function yamlStr(s: string): string {
  if (/^[a-zA-Z0-9_\-./]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
