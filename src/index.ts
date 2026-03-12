// nyx-auth — stateless OIDC provider
//
// All state is encoded in signed JWTs. No database required.
// Users and clients are driven entirely by config files.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { loadClients, type ClientConfig } from "./clients";
import { loadUsers, verifyPassword, rolesForClient, type UserConfig } from "./users";
import { getKeys } from "./keys";

// ── Startup ─────────────────────────────────────────────────────────────────

const clients = await loadClients();
const users = await loadUsers();
const issuer = process.env.BETTER_AUTH_URL!; // e.g. http://nyx-auth:3000

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`[nyx-auth] Loaded ${clients.size} client(s), ${users.size} user(s). Issuer: ${issuer}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** base64url-encode a buffer (no padding). */
function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64url");
}

/** Verify PKCE: SHA-256(verifier) must equal the stored challenge. */
async function verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest) === challenge;
}

/** Constant-time string compare to protect client secret checks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Issue a short-lived session cookie JWT after successful login. */
async function issueSessionCookie(email: string): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ sub: email, type: "session" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/** Issue a short-lived signed authorization code (contains all auth params). */
async function issueAuthCode(params: {
  sub: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ ...params, type: "auth_code" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
}

/** Issue ID token for the authenticated user + client. */
async function issueIdToken(user: UserConfig, client: ClientConfig, nonce?: string): Promise<string> {
  const { privateKey, kid } = await getKeys();
  const roles = rolesForClient(user, client.clientId);
  return new SignJWT({
    sub: user.email,
    email: user.email,
    name: user.name,
    roles,
    ...(nonce ? { nonce } : {}),
  })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer(issuer)
    .setAudience(client.clientId)
    .sign(privateKey);
}

/** Issue access token (used to call /userinfo). */
async function issueAccessToken(user: UserConfig, client: ClientConfig, scope: string): Promise<string> {
  const { privateKey, kid } = await getKeys();
  const roles = rolesForClient(user, client.clientId);
  return new SignJWT({ sub: user.email, scope, roles })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer(issuer)
    .setAudience(issuer)
    .sign(privateKey);
}

/** Verify any JWT signed by our key and return its payload. */
async function verifyToken(token: string) {
  const { publicKey } = await getKeys();
  const { payload } = await jwtVerify(token, publicKey, { issuer });
  return payload;
}

/** Verify the session cookie and return the email, or null. */
async function sessionEmail(cookieValue: string | undefined): Promise<string | null> {
  if (!cookieValue) return null;
  try {
    const { publicKey } = await getKeys();
    const { payload } = await jwtVerify(cookieValue, publicKey);
    if (payload.type !== "session" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ── App ──────────────────────────────────────────────────────────────────────

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

// ── Health ───────────────────────────────────────────────────────────────────

app.get("/", (c) => c.json({ service: "nyx-auth", status: "ok" }));

// ── OIDC Discovery ───────────────────────────────────────────────────────────

const discovery = {
  issuer,
  authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
  token_endpoint: `${issuer}/api/auth/oauth2/token`,
  userinfo_endpoint: `${issuer}/api/auth/userinfo`,
  jwks_uri: `${issuer}/api/auth/jwks.json`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  scopes_supported: ["openid", "profile", "email"],
  token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
  code_challenge_methods_supported: ["S256"],
  claims_supported: ["sub", "email", "name", "roles", "nonce"],
};

app.get("/api/auth/.well-known/openid-configuration", (c) => c.json(discovery));

// ── JWKS ─────────────────────────────────────────────────────────────────────

app.get("/api/auth/jwks.json", async (c) => {
  const { publicJwk } = await getKeys();
  return c.json({ keys: [publicJwk] });
});

// ── Authorization endpoint ───────────────────────────────────────────────────

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

  // Validate client
  const client = clients.get(clientId);
  if (!client) return c.text("Unknown client_id", 400);
  if (!client.redirectURLs.includes(redirectUri)) return c.text("Invalid redirect_uri", 400);
  if (responseType !== "code") return redirectError(redirectUri, state, "unsupported_response_type");

  // Check session
  const sessionCookie = getCookie(c, "nyx_session");
  const email = await sessionEmail(sessionCookie);

  if (!email) {
    // Not logged in — redirect to login page, pass all authorize params as qs
    const qs = new URLSearchParams(params).toString();
    return c.redirect(`/login?${qs}`);
  }

  const user = users.get(email);
  if (!user) {
    deleteCookie(c, "nyx_session");
    const qs = new URLSearchParams(params).toString();
    return c.redirect(`/login?${qs}`);
  }

  // Consent check
  if (!client.skipConsent) {
    const consentGranted = params.consent_granted === "1";
    if (!consentGranted) {
      const qs = new URLSearchParams({ ...params, _email: email }).toString();
      return c.redirect(`/consent?${qs}`);
    }
  }

  // Issue authorization code
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

// ── Login endpoint (credential verification) ─────────────────────────────────

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  const user = users.get(email.toLowerCase());
  if (!user || !verifyPassword(user.password, password)) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  const sessionJwt = await issueSessionCookie(user.email);
  setCookie(c, "nyx_session", sessionJwt, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 3600,
  });
  return c.json({ ok: true });
});

// ── Token endpoint ───────────────────────────────────────────────────────────

app.post("/api/auth/oauth2/token", async (c) => {
  const body = await c.req.parseBody();
  const grantType = body.grant_type as string;

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const code = body.code as string;
  const redirectUri = body.redirect_uri as string;
  const codeVerifier = body.code_verifier as string | undefined;

  // Resolve client credentials (body or Authorization header)
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

  // Public clients (no secret) skip secret check; confidential clients must match
  if (client.type !== "public" && clientSecret !== undefined) {
    if (!safeEqual(client.clientSecret, clientSecret)) {
      return c.json({ error: "invalid_client" }, 401);
    }
  }

  // Verify and decode the auth code JWT
  let payload: Record<string, unknown>;
  try {
    payload = await verifyToken(code) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_grant" }, 400);
  }

  if (payload.type !== "auth_code") return c.json({ error: "invalid_grant" }, 400);
  if (payload.clientId !== clientId) return c.json({ error: "invalid_grant" }, 400);
  if (payload.redirectUri !== redirectUri) return c.json({ error: "invalid_grant" }, 400);

  // PKCE verification
  if (payload.codeChallenge) {
    if (!codeVerifier) return c.json({ error: "invalid_grant", error_description: "code_verifier required" }, 400);
    const valid = await verifyPKCE(codeVerifier, payload.codeChallenge as string);
    if (!valid) return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  const email = payload.sub as string;
  const user = users.get(email);
  if (!user) return c.json({ error: "invalid_grant" }, 400);

  const [idToken, accessToken] = await Promise.all([
    issueIdToken(user, client, payload.nonce as string | undefined),
    issueAccessToken(user, client, payload.scope as string),
  ]);

  return c.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: payload.scope,
  });
});

// ── UserInfo endpoint ────────────────────────────────────────────────────────

app.get("/api/auth/userinfo", async (c) => {
  const authHeader = c.req.header("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await verifyToken(authHeader.slice(7)) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_token" }, 401);
  }

  const user = users.get(payload.sub as string);
  if (!user) return c.json({ error: "invalid_token" }, 401);

  return c.json({ sub: user.email, email: user.email, name: user.name });
});

// ── Login page ───────────────────────────────────────────────────────────────

app.get("/login", (c) => {
  const qs = c.req.raw.url.split("?")[1] ?? "";
  return c.html(loginHtml(qs));
});

// ── Consent page ─────────────────────────────────────────────────────────────

app.get("/consent", (c) => {
  const clientId = c.req.query("client_id") ?? "";
  const scope = c.req.query("scope") ?? "openid";
  // Pass all authorize params through so the approve button can re-submit them
  const qs = c.req.raw.url.split("?")[1] ?? "";
  return c.html(consentHtml(clientId, scope, qs));
});

// Consent approval: re-run the authorize flow with consent_granted=1
app.get("/consent/approve", (c) => {
  const qs = c.req.raw.url.split("?")[1] ?? "";
  const params = new URLSearchParams(qs);
  params.set("consent_granted", "1");
  params.delete("_email"); // internal param
  return c.redirect(`/api/auth/oauth2/authorize?${params.toString()}`);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function redirectError(redirectUri: string, state: string | undefined, error: string): Response {
  const dest = new URL(redirectUri);
  dest.searchParams.set("error", error);
  if (state) dest.searchParams.set("state", state);
  return Response.redirect(dest.toString(), 302);
}

// ── HTML pages ────────────────────────────────────────────────────────────────

function loginHtml(qs: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>nyx-auth — sign in</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e2e2e2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #181818; border: 1px solid #2a2a2a; border-radius: 10px; padding: 2rem; width: 100%; max-width: 360px; }
    h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1.5rem; color: #fff; letter-spacing: 0.02em; }
    label { display: block; font-size: 0.8125rem; color: #999; margin-bottom: 0.3rem; }
    input { display: block; width: 100%; padding: 0.6rem 0.75rem; background: #111; border: 1px solid #333; border-radius: 6px; color: #e2e2e2; font-size: 0.9375rem; margin-bottom: 1rem; transition: border-color 0.15s; }
    input:focus { outline: none; border-color: #4f8ef7; }
    button { width: 100%; padding: 0.7rem; background: #3b7cf4; border: none; border-radius: 6px; color: #fff; font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #2d6ce0; }
    button:disabled { background: #2a4a80; cursor: not-allowed; }
    .error { display: none; color: #f87171; font-size: 0.8125rem; margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: #2a1212; border: 1px solid #5a2020; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>nyx-auth</h1>
    <div class="error" id="err"></div>
    <form id="form">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit" id="btn">Sign in</button>
    </form>
  </div>
  <script>
    const qs = ${JSON.stringify(qs)};
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const err = document.getElementById('err');
      btn.disabled = true;
      btn.textContent = 'Signing in\u2026';
      err.style.display = 'none';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          }),
          credentials: 'include',
        });
        if (res.ok) {
          window.location.href = '/api/auth/oauth2/authorize?' + qs;
        } else {
          const data = await res.json().catch(() => ({}));
          err.textContent = data.error || 'Invalid email or password.';
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      } catch {
        err.textContent = 'Network error. Please try again.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;
}

function consentHtml(clientId: string, scope: string, qs: string): string {
  const scopes = scope.split(" ").filter(Boolean);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>nyx-auth — authorize</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e2e2e2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #181818; border: 1px solid #2a2a2a; border-radius: 10px; padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff; }
    .sub { font-size: 0.8125rem; color: #888; margin-bottom: 1.5rem; }
    .scopes { list-style: none; margin-bottom: 1.5rem; }
    .scopes li { font-size: 0.875rem; padding: 0.35rem 0; color: #ccc; }
    .scopes li::before { content: '\u2713 '; color: #4ade80; }
    .actions { display: flex; gap: 0.75rem; }
    a, button { flex: 1; padding: 0.7rem; border: none; border-radius: 6px; font-size: 0.9375rem; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none; display: inline-block; transition: background 0.15s; }
    .approve { background: #3b7cf4; color: #fff; }
    .approve:hover { background: #2d6ce0; }
    .deny { background: #2a2a2a; color: #ccc; border: 1px solid #333; }
    .deny:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize access</h1>
    <p class="sub">Client: <strong>${clientId}</strong></p>
    <ul class="scopes">
      ${scopes.map((s) => `<li>${s}</li>`).join("\n      ")}
    </ul>
    <div class="actions">
      <a class="deny" href="/login?${qs}">Deny</a>
      <a class="approve" href="/consent/approve?${qs}">Approve</a>
    </div>
  </div>
</body>
</html>`;
}

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
