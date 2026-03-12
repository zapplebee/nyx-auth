import { betterAuth } from "better-auth";
import { oidcProvider, admin } from "better-auth/plugins";
import { db } from "./db";

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
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
      // Disable dynamic public registration — clients are created via admin API only
      allowDynamicClientRegistration: false,
    }),
    admin(),
  ],
});
