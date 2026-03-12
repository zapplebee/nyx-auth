// Hono app factory — accepts pre-loaded config maps for testability.
//
// src/index.ts is the production entry point that loads real config and calls
// createApp(). Tests can call createApp() directly with fixture data.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { ClientConfig } from "./clients";
import type { UserConfig } from "./users";
import { verifyPassword } from "./users";
import {
  issueSessionToken,
  verifySessionToken,
  issueAuthCode,
  decodeAuthCode,
  issueIdToken,
  issueAccessToken,
  verifyAccessToken,
  issuePendingTotpToken,
  verifyPendingTotpToken,
  safeEqual,
} from "./tokens";
import { loginHtml, consentHtml } from "./pages";
import { requiresTotp } from "./users";
import { generate as totpGenerate, verify as totpVerify } from "otplib";

// Dummy password used when the requested email does not exist, so the
// verifyPassword call always runs and doesn't short-circuit on missing users.
const DUMMY_PASSWORD = "nyx-dummy-password-placeholder-never-matches";

export interface AppOptions {
  /** Milliseconds to delay before returning a 401. Default: 1000. */
  failedLoginDelayMs?: number;
}

export function createApp(
  clients: Map<string, ClientConfig>,
  users: Map<string, UserConfig>,
  options: AppOptions = {}
): Hono {
  const failedLoginDelayMs = options.failedLoginDelayMs ?? 1000;

  const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = new Hono();

  app.use(
    "/api/auth/*",
    cors({
      origin: trustedOrigins.length ? trustedOrigins : "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      credentials: true,
    })
  );

  // ── Health ─────────────────────────────────────────────────────────────────

  app.get("/", (c) => c.json({ service: "nyx-auth", status: "ok" }));

  // ── OIDC Discovery ─────────────────────────────────────────────────────────

  app.get("/api/auth/.well-known/openid-configuration", (c) => {
    const issuer = process.env.NYX_URL ?? "http://localhost:3000";
    return c.json({
      issuer,
      authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
      token_endpoint: `${issuer}/api/auth/oauth2/token`,
      userinfo_endpoint: `${issuer}/api/auth/userinfo`,
      jwks_uri: `${issuer}/api/auth/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      claims_supported: ["sub", "email", "name", "roles", "nonce"],
    });
  });

  // ── JWKS ───────────────────────────────────────────────────────────────────

  app.get("/api/auth/jwks.json", async (c) => {
    const { getKeys } = await import("./keys");
    const { publicJwk } = await getKeys();
    return c.json({ keys: [publicJwk] });
  });

  // ── Authorization endpoint ─────────────────────────────────────────────────

  app.get("/api/auth/oauth2/authorize", async (c) => {
    const params = c.req.query();
    const clientId = params.client_id;
    const redirectUri = params.redirect_uri;
    const responseType = params.response_type;
    const scope = params.scope ?? "openid";
    const state = params.state;
    const nonce = params.nonce;
    const codeChallenge = params.code_challenge;
    const codeChallengeMethod = params.code_challenge_method;

    const client = clients.get(clientId);
    if (!client) return c.text("Unknown client_id", 400);
    if (!client.redirectURLs.includes(redirectUri)) return c.text("Invalid redirect_uri", 400);
    if (responseType !== "code") return redirectError(redirectUri, state, "unsupported_response_type");

    const sessionCookie = getCookie(c, "nyx_session");
    const email = await verifySessionToken(sessionCookie ?? "");

    if (!email) {
      const qs = new URLSearchParams(params).toString();
      return c.redirect(`/login?${qs}`);
    }

    const user = users.get(email);
    if (!user) {
      deleteCookie(c, "nyx_session");
      const qs = new URLSearchParams(params).toString();
      return c.redirect(`/login?${qs}`);
    }

    if (!client.skipConsent) {
      const consentGranted = params.consent_granted === "1";
      if (!consentGranted) {
        const qs = new URLSearchParams({ ...params, _email: email }).toString();
        return c.redirect(`/consent?${qs}`);
      }
    }

    const code = await issueAuthCode({
      sub: email,
      clientId,
      redirectUri,
      scope,
      ...(nonce ? { nonce } : {}),
      ...(codeChallenge ? { codeChallenge, codeChallengeMethod: codeChallengeMethod ?? "S256" } : {}),
    });

    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    if (state) dest.searchParams.set("state", state);
    return c.redirect(dest.toString());
  });

  // ── Login endpoint ─────────────────────────────────────────────────────────

  app.post("/api/auth/login", async (c) => {
    const { email, password } = await c.req.json<{ email: string; password: string }>();

    const user = users.get(email.toLowerCase());
    // Always run verifyPassword even for unknown emails to prevent user-enumeration
    // via timing differences. Use a dummy stored value when the user is not found.
    const storedPassword = user?.password ?? DUMMY_PASSWORD;
    const passwordOk = verifyPassword(storedPassword, password);
    const ok = user !== undefined && passwordOk;

    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, failedLoginDelayMs));
      return c.json({ error: "Invalid email or password." }, 401);
    }

    // If the user has a TOTP seed, issue a short-lived pending token instead of
    // a full session. The client must complete the TOTP step via POST /api/auth/totp.
    if (requiresTotp(user)) {
      const pendingToken = await issuePendingTotpToken(user.email);
      return c.json({ requiresTotp: true, pendingToken });
    }

    const sessionJwt = await issueSessionToken(user.email);
    setCookie(c, "nyx_session", sessionJwt, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 3600,
    });
    return c.json({ ok: true });
  });

  // ── TOTP verification endpoint ─────────────────────────────────────────────

  app.post("/api/auth/totp", async (c) => {
    const { pendingToken, code } = await c.req.json<{ pendingToken: string; code: string }>();

    const email = await verifyPendingTotpToken(pendingToken ?? "");
    const user = email ? users.get(email) : undefined;

    const result =
      user && requiresTotp(user)
        ? await totpVerify({ token: code, secret: user.otpSeed! })
        : null;
    const totpOk = result?.valid === true;

    if (!totpOk) {
      await new Promise((resolve) => setTimeout(resolve, failedLoginDelayMs));
      return c.json({ error: "Invalid or expired code." }, 401);
    }

    const sessionJwt = await issueSessionToken(user.email);
    setCookie(c, "nyx_session", sessionJwt, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 3600,
    });
    return c.json({ ok: true });
  });

  // ── Token endpoint ─────────────────────────────────────────────────────────

  app.post("/api/auth/oauth2/token", async (c) => {
    const body = await c.req.parseBody();
    const grantType = body.grant_type as string;

    if (grantType !== "authorization_code") {
      return c.json({ error: "unsupported_grant_type" }, 400);
    }

    const code = body.code as string;
    const redirectUri = body.redirect_uri as string;
    const codeVerifier = body.code_verifier as string | undefined;

    let clientId = body.client_id as string | undefined;
    let clientSecret = body.client_secret as string | undefined;

    const authHeader = c.req.header("Authorization") ?? "";
    if (authHeader.startsWith("Basic ")) {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
      const sep = decoded.indexOf(":");
      clientId ??= decoded.slice(0, sep);
      clientSecret ??= decoded.slice(sep + 1);
    }

    const client = clients.get(clientId ?? "");
    if (!client) return c.json({ error: "invalid_client" }, 401);

    if (client.type !== "public" && clientSecret !== undefined) {
      if (!safeEqual(client.clientSecret, clientSecret)) {
        return c.json({ error: "invalid_client" }, 401);
      }
    }

    let payload: Awaited<ReturnType<typeof decodeAuthCode>>;
    try {
      payload = await decodeAuthCode(code);
    } catch {
      return c.json({ error: "invalid_grant" }, 400);
    }

    if (payload.clientId !== clientId) return c.json({ error: "invalid_grant" }, 400);
    if (payload.redirectUri !== redirectUri) return c.json({ error: "invalid_grant" }, 400);

    if (payload.codeChallenge) {
      if (!codeVerifier) return c.json({ error: "invalid_grant", error_description: "code_verifier required" }, 400);
      const { verifyPKCE } = await import("./pkce");
      const valid = await verifyPKCE(codeVerifier, payload.codeChallenge);
      if (!valid) return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    const user = users.get(payload.sub);
    if (!user) return c.json({ error: "invalid_grant" }, 400);

    const [idToken, accessToken] = await Promise.all([
      issueIdToken(user, client, payload.nonce),
      issueAccessToken(user, client, payload.scope),
    ]);

    return c.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: payload.scope,
    });
  });

  // ── UserInfo endpoint ──────────────────────────────────────────────────────

  app.get("/api/auth/userinfo", async (c) => {
    const authHeader = c.req.header("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);

    let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
    try {
      payload = await verifyAccessToken(authHeader.slice(7));
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }

    const user = users.get(payload.sub as string);
    if (!user) return c.json({ error: "invalid_token" }, 401);

    return c.json({ sub: user.email, email: user.email, name: user.name });
  });

  // ── Login page ─────────────────────────────────────────────────────────────

  app.get("/login", (c) => {
    const qs = c.req.raw.url.split("?")[1] ?? "";
    return c.html(loginHtml(qs));
  });

  // ── Consent page ───────────────────────────────────────────────────────────

  app.get("/consent", (c) => {
    const clientId = c.req.query("client_id") ?? "";
    const scope = c.req.query("scope") ?? "openid";
    const qs = c.req.raw.url.split("?")[1] ?? "";
    return c.html(consentHtml(clientId, scope, qs));
  });

  app.get("/consent/approve", (c) => {
    const qs = c.req.raw.url.split("?")[1] ?? "";
    const params = new URLSearchParams(qs);
    params.set("consent_granted", "1");
    params.delete("_email");
    return c.redirect(`/api/auth/oauth2/authorize?${params.toString()}`);
  });

  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function redirectError(redirectUri: string, state: string | undefined, error: string): Response {
  const dest = new URL(redirectUri);
  dest.searchParams.set("error", error);
  if (state) dest.searchParams.set("state", state);
  return Response.redirect(dest.toString(), 302);
}
