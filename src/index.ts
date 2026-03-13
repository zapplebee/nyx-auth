// nyx-auth — stateless OIDC provider
//
// Production entry point. Loads config files and starts the Hono server.
// For the full app logic see src/router.ts.

import { loadClients } from "./clients";
import { loadUsers } from "./users";
import { createApp } from "./router";
import { assertEnvironment } from "./startup-checks";
import { validateConfig } from "./validate";

assertEnvironment();

const clients = await loadClients();
const users = await loadUsers();

const configErrors = validateConfig(clients, users);
if (configErrors.length > 0) {
  console.error("[nyx-auth] Startup failed — invalid configuration:\n");
  for (const err of configErrors) {
    console.error("  ✗ " + err);
  }
  console.error();
  process.exit(1);
}

const issuer = process.env.NYX_URL!;
console.log(`[nyx-auth] Loaded ${clients.size} client(s), ${users.size} user(s). Issuer: ${issuer}`);

const app = createApp(clients, users);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
