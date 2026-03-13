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
  issueRefreshToken,
  verifyRefreshToken,
  issueClientCredentialsToken,
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
    // Discovery document changes infrequently; clients may cache for up to 24h.
    c.header("Cache-Control", "public, max-age=86400");
    const issuer = process.env.NYX_URL ?? "http://localhost:3000";
    return c.json({
      issuer,
      authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
      token_endpoint: `${issuer}/api/auth/oauth2/token`,
      userinfo_endpoint: `${issuer}/api/auth/userinfo`,
      jwks_uri: `${issuer}/api/auth/jwks.json`,
      end_session_endpoint: `${issuer}/api/auth/oauth2/logout`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      claims_supported: ["sub", "email", "name", "roles", "nonce", "client_id"],
    });
  });

  // ── JWKS ───────────────────────────────────────────────────────────────────

  app.get("/api/auth/jwks.json", async (c) => {
    // Public keys change infrequently; clients may cache for up to 1h.
    c.header("Cache-Control", "public, max-age=3600");
    const { getKeys } = await import("./keys");
    const { publicJwk } = await getKeys();
    return c.json({ keys: [publicJwk] });
  });

  // ── Authorization endpoint ─────────────────────────────────────────────────

  app.get("/api/auth/oauth2/authorize", async (c) => {
    // Auth codes must never be cached — each response is a unique one-time value.
    c.header("Cache-Control", "no-store");
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
        ? await totpVerify({ token: code, secret: user.otpSeed!, window: 2 })
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
    // RFC 6749 §5.1: token responses MUST include Cache-Control: no-store and Pragma: no-cache.
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    const body = await c.req.parseBody();
    const grantType = body.grant_type as string;

    // Resolve client credentials from body or Authorization header (both grant types)
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

    // ── client_credentials grant ──────────────────────────────────────────────

    if (grantType === "client_credentials") {
      // Public clients cannot use client_credentials — there is no user context
      // to justify issuing a machine token without a verified secret.
      if (client.type === "public") {
        return c.json({ error: "unauthorized_client" }, 400);
      }
      if (!clientSecret || !safeEqual(client.clientSecret, clientSecret)) {
        return c.json({ error: "invalid_client" }, 401);
      }

      const scope = (body.scope as string | undefined) ?? "";
      const accessToken = await issueClientCredentialsToken(client, scope);

      return c.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope,
      });
    }

    // ── refresh_token grant ───────────────────────────────────────────────────

    if (grantType === "refresh_token") {
      const rawToken = body.refresh_token as string | undefined;
      if (!rawToken) return c.json({ error: "invalid_grant" }, 400);

      let rtPayload: Awaited<ReturnType<typeof verifyRefreshToken>>;
      try {
        rtPayload = await verifyRefreshToken(rawToken);
      } catch {
        return c.json({ error: "invalid_grant" }, 400);
      }

      if (rtPayload.client_id !== clientId) return c.json({ error: "invalid_grant" }, 400);

      if (client.type !== "public") {
        if (!clientSecret || !safeEqual(client.clientSecret, clientSecret)) {
          return c.json({ error: "invalid_client" }, 401);
        }
      }

      const user = users.get(rtPayload.sub);
      if (!user) return c.json({ error: "invalid_grant" }, 400);

      // Rotate: issue a fresh refresh token alongside new access + id tokens.
      const [idToken, accessToken, refreshToken] = await Promise.all([
        issueIdToken(user, client, undefined),
        issueAccessToken(user, client, rtPayload.scope),
        issueRefreshToken(user, client, rtPayload.scope),
      ]);

      return c.json({
        access_token: accessToken,
        id_token: idToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: rtPayload.scope,
      });
    }

    // ── authorization_code grant ──────────────────────────────────────────────

    if (grantType !== "authorization_code") {
      return c.json({ error: "unsupported_grant_type" }, 400);
    }

    const code = body.code as string;
    const redirectUri = body.redirect_uri as string;
    const codeVerifier = body.code_verifier as string | undefined;

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

    const wantsRefresh = payload.scope.split(" ").includes("offline_access");

    const [idToken, accessToken, refreshToken] = await Promise.all([
      issueIdToken(user, client, payload.nonce),
      issueAccessToken(user, client, payload.scope),
      wantsRefresh ? issueRefreshToken(user, client, payload.scope) : Promise.resolve(undefined),
    ]);

    return c.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: payload.scope,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
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

    return c.json({ ...(user.claims ?? {}), sub: user.email, email: user.email, name: user.name });
  });

  // ── RP-initiated logout (end_session_endpoint) ────────────────────────────

  app.get("/api/auth/oauth2/logout", (c) => {
    deleteCookie(c, "nyx_session", { path: "/" });
    const postLogoutUri = c.req.query("post_logout_redirect_uri");
    const state = c.req.query("state");
    if (postLogoutUri) {
      const dest = new URL(postLogoutUri);
      if (state) dest.searchParams.set("state", state);
      return c.redirect(dest.toString());
    }
    return c.html("<html><body><p>Logged out.</p></body></html>");
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

  // ── Coverage endpoints (only active when COVERAGE=1) ──────────────────────

  if (process.env.COVERAGE) {
    // @cypress/code-coverage reads r.body.coverage, so wrap accordingly.
    app.get("/__coverage__", (c) => {
      return c.json({ coverage: (globalThis as Record<string, unknown>).__coverage__ ?? {} });
    });

    app.post("/__coverage__/reset", (c) => {
      (globalThis as Record<string, unknown>).__coverage__ = {};
      return c.json({ ok: true });
    });
  }

  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function redirectError(redirectUri: string, state: string | undefined, error: string): Response {
  const dest = new URL(redirectUri);
  dest.searchParams.set("error", error);
  if (state) dest.searchParams.set("state", state);
  return Response.redirect(dest.toString(), 302);
}
