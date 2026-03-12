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
  clientSecret: string; // "enc:..." in YAML, decrypted at load time
  type?: "web" | "native" | "user-agent-based" | "public";
  redirectURLs: string[];
  skipConsent?: boolean;
}

interface ClientsFile {
  clients: ClientConfig[];
}

// Decrypt all client secrets. Called once at startup.
export async function loadClients(): Promise<Map<string, ClientConfig>> {
  const secret = process.env.BETTER_AUTH_SECRET!;
  const path = process.env.CLIENTS_CONFIG ?? "./clients.yml";
  const { clients } = YAML.parse(readFileSync(path, "utf-8")) as ClientsFile;

  const map = new Map<string, ClientConfig>();
  for (const cfg of clients) {
    map.set(cfg.clientId, {
      ...cfg,
      clientSecret: await decryptSecret(cfg.clientSecret, secret),
    });
  }
  return map;
}
