#!/usr/bin/env bun
// Validate clients.yml and users.yml without starting the server.
//
// Run with:
//   bun run validate:config
//
// Requires NYX_SECRET (to decrypt enc:... values) and optionally
// CLIENTS_CONFIG / USERS_CONFIG to point at non-default paths.
//
// Exit code 0 = config is valid. Exit code 1 = validation failed.

import { loadClients } from "../src/clients";
import { loadUsers } from "../src/users";
import { validateConfig } from "../src/validate";

const secret = process.env.NYX_SECRET;
if (!secret) {
  console.error("Error: NYX_SECRET is required to decrypt config secrets.");
  console.error("  Usage: NYX_SECRET=<secret> bun run validate:config");
  process.exit(1);
}

let clients: Awaited<ReturnType<typeof loadClients>>;
let users: Awaited<ReturnType<typeof loadUsers>>;

try {
  clients = await loadClients();
} catch (err) {
  console.error(`Failed to load clients config: ${(err as Error).message}`);
  process.exit(1);
}

try {
  users = await loadUsers();
} catch (err) {
  console.error(`Failed to load users config: ${(err as Error).message}`);
  process.exit(1);
}

const errors = validateConfig(clients, users);

if (errors.length === 0) {
  const clientsPath = process.env.CLIENTS_CONFIG ?? "./clients.yml";
  const usersPath = process.env.USERS_CONFIG ?? "./users.yml";
  console.log(`✓ Config is valid (${clients.size} client(s), ${users.size} user(s))`);
  console.log(`  clients: ${clientsPath}`);
  console.log(`  users:   ${usersPath}`);
  process.exit(0);
} else {
  console.error(`Config validation failed — ${errors.length} error(s):\n`);
  for (const err of errors) {
    console.error("  ✗ " + err);
  }
  console.error();
  process.exit(1);
}
