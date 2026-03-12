#!/usr/bin/env bun
// Usage: bun run clients:set-secret <clientId>
//
// Prompts for the client's plain-text secret, encrypts it with AES-256-GCM
// (key derived from NYX_SECRET), and writes it back to clients.yml.
//
// The encrypted value starts with "enc:" and is safe to commit.

import { readFileSync, writeFileSync } from "node:fs";
import { YAML } from "bun";
import { encryptSecret } from "../src/crypto";

const clientId = process.argv[2];
if (!clientId) {
  console.error("Usage: bun run clients:set-secret <clientId>");
  process.exit(1);
}

const authSecret = process.env.NYX_SECRET;
if (!authSecret) {
  console.error("NYX_SECRET is not set.");
  process.exit(1);
}

const path = process.env.CLIENTS_CONFIG ?? "./clients.yml";
const yamlText = readFileSync(path, "utf-8");
const config = YAML.parse(yamlText) as { clients: Array<{ clientId: string; [k: string]: unknown }> };

const client = config.clients?.find((c) => c.clientId === clientId);
if (!client) {
  console.error(`No client with clientId "${clientId}" found in ${path}.`);
  process.exit(1);
}

const plainSecret = prompt(`Enter new secret for client "${clientId}": `);
if (!plainSecret) {
  console.error("No secret entered.");
  process.exit(1);
}

const encrypted = await encryptSecret(plainSecret, authSecret);
client.clientSecret = encrypted;

writeFileSync(path, serializeClientsYaml(config));
console.log(`✓ Secret updated for client "${clientId}" in ${path}`);

// ── Simple deterministic YAML serializer for our known schema ─────────────
// Bun has YAML.parse but not YAML.stringify, so we write our own.
// Only handles the structure of clients.yml — not a general-purpose serializer.

interface ClientEntry {
  name: string;
  clientId: string;
  clientSecret?: string;
  type?: string;
  redirectURLs: string[];
  roles: string[];
  skipConsent?: boolean;
}

function serializeClientsYaml(cfg: { clients: ClientEntry[] }): string {
  const lines: string[] = ["clients:"];
  for (const c of cfg.clients) {
    lines.push(`  - name: ${yamlStr(c.name)}`);
    lines.push(`    clientId: ${yamlStr(c.clientId)}`);
    if (c.clientSecret !== undefined) {
      lines.push(`    clientSecret: ${yamlStr(c.clientSecret)}`);
    }
    if (c.type !== undefined) {
      lines.push(`    type: ${c.type}`);
    }
    lines.push("    redirectURLs:");
    for (const url of c.redirectURLs ?? []) {
      lines.push(`      - ${yamlStr(url)}`);
    }
    lines.push("    roles:");
    for (const role of c.roles ?? []) {
      lines.push(`      - ${role}`);
    }
    if (c.skipConsent === true) {
      lines.push("    skipConsent: true");
    }
  }
  lines.push("");
  return lines.join("\n");
}

// Quote strings that need it; bare words are fine for simple values.
function yamlStr(s: string): string {
  if (/^[a-zA-Z0-9_\-./]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
