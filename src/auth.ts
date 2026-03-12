import { betterAuth } from "better-auth";
import { oidcProvider, admin } from "better-auth/plugins";
import { db } from "./db";
import type { ClientConfig } from "./clients";

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Clients are loaded asynchronously at startup and injected here.
// See createAuth() in index.ts.
export function createAuth(
  clients: ReturnType<typeof import("./clients").loadClients> extends Promise<infer T> ? T : never
) {
  const { trustedClients, configByClientId } = clients;

  return betterAuth({
    database: db,
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL!,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      oidcProvider({
        loginPage: "/login",
        consentPage: "/consent",
        allowDynamicClientRegistration: false,
        trustedClients,
        // Filter the roles claim to only roles the client declares it understands.
        // If a client has roles: [user, admin] and the user's role is "admin",
        // the token includes roles: ["admin"]. If the client only lists [user],
        // the token includes roles: [] for that user.
        getAdditionalUserInfoClaim(user, _scopes, client) {
          const cfg: ClientConfig | undefined = configByClientId.get(client.clientId);
          const userRoles = (user.role as string | undefined)
            ?.split(",")
            .map((r) => r.trim())
            .filter(Boolean) ?? [];
          const allowedRoles = cfg?.roles ?? userRoles;
          return { roles: userRoles.filter((r) => allowedRoles.includes(r)) };
        },
      }),
      admin(),
    ],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

// Stub export for the better-auth CLI migration tool.
// The CLI reads this file to determine the schema — clients are not needed for that.
export const auth = createAuth({ trustedClients: [], configByClientId: new Map() });
