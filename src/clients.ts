// Loads OIDC clients from clients.yml and decrypts their secrets at startup.
//
// clients.yml drives all client configuration — no database or API management.
// Use `bun run clients:set-secret <clientId>` to set/rotate a client secret.

import { readFileSync } from "node:fs";
import { YAML } from "bun";
import { decryptSecret } from "./crypto";

export interface ClientConfig {
  name: string;
  clientId: string;
  clientSecret: string; // "enc:..." in YAML
  type?: "web" | "native" | "user-agent-based" | "public";
  redirectURLs: string[];
  // Roles included in the OIDC token for this client.
  // The roles claim is the intersection of the user's roles and this list.
  roles: string[];
  skipConsent?: boolean;
}

interface ClientsFile {
  clients: ClientConfig[];
}

function loadRawConfig(): ClientsFile {
  const path = process.env.CLIENTS_CONFIG ?? "./clients.yml";
  const text = readFileSync(path, "utf-8");
  return YAML.parse(text) as ClientsFile;
}

// Decrypt all client secrets. Called once at startup.
export async function loadClients(): Promise<{
  trustedClients: ReturnType<typeof toTrustedClient>[];
  configByClientId: Map<string, ClientConfig>;
}> {
  const secret = process.env.BETTER_AUTH_SECRET!;
  const { clients } = loadRawConfig();

  const configByClientId = new Map<string, ClientConfig>();
  const trustedClients: ReturnType<typeof toTrustedClient>[] = [];

  for (const cfg of clients) {
    const decrypted = await decryptSecret(cfg.clientSecret, secret);
    const resolved = { ...cfg, clientSecret: decrypted };
    configByClientId.set(cfg.clientId, resolved);
    trustedClients.push(toTrustedClient(resolved));
  }

  return { trustedClients, configByClientId };
}

function toTrustedClient(cfg: ClientConfig) {
  return {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    name: cfg.name,
    type: cfg.type ?? ("web" as const),
    redirectUrls: cfg.redirectURLs,
    disabled: false,
    skipConsent: cfg.skipConsent ?? false,
  };
}
