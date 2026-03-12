// Stateless JWT token issuance and verification.
//
// All tokens are ES256-signed JWTs. No storage required — validity is proven
// by the signature alone. The signing key is managed by src/keys.ts.

import { SignJWT, jwtVerify, decodeJwt, type JWTPayload } from "jose";
import { getKeys } from "./keys";
import { rolesForClient, type UserConfig } from "./users";
import type { ClientConfig } from "./clients";

// Read lazily so tests can set NYX_URL before any function is called.
const getIssuer = () => process.env.NYX_URL ?? "http://localhost:3000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthCodePayload {
  type: "auth_code";
  sub: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export interface AuthCodeParams {
  sub: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

// ── Session tokens (internal cookie, no issuer check) ─────────────────────────

/**
 * Issue a 1-hour session JWT. Stored as an httpOnly cookie after login.
 * Not part of the OIDC protocol — purely internal session tracking.
 */
export async function issueSessionToken(email: string): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ sub: email, type: "session" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Verify a session token and return the email (sub), or null if invalid/expired.
 * Does not check issuer — session tokens are internal only.
 */
export async function verifySessionToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { publicKey } = await getKeys();
    const { payload } = await jwtVerify(token, publicKey);
    if (payload.type !== "session" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ── Pending-TOTP tokens (5-min, issued after password check) ─────────────────

/**
 * Issue a short-lived "pending TOTP" token after a successful password check.
 * The client must present this token together with the TOTP code to complete login.
 */
export async function issuePendingTotpToken(email: string): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ sub: email, type: "pending_totp" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

/**
 * Verify a pending-TOTP token and return the email (sub), or null if invalid.
 */
export async function verifyPendingTotpToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { publicKey } = await getKeys();
    const { payload } = await jwtVerify(token, publicKey, { issuer: getIssuer() });
    if (payload.type !== "pending_totp" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ── Authorization codes (2-min OIDC code grant) ───────────────────────────────

/**
 * Issue a signed authorization code JWT containing all authorize params.
 * Expires in 2 minutes — the token endpoint must exchange it before then.
 */
export async function issueAuthCode(params: AuthCodeParams): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ ...params, type: "auth_code" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
}

/**
 * Verify and decode an authorization code. Throws if the code is invalid,
 * expired, or has been tampered with.
 */
export async function decodeAuthCode(code: string): Promise<AuthCodePayload> {
  const { publicKey } = await getKeys();
  const { payload } = await jwtVerify(code, publicKey, { issuer: getIssuer() });
  if (payload.type !== "auth_code") throw new Error("Not an auth code token");
  return payload as unknown as AuthCodePayload;
}

// ── OIDC tokens (ID token + access token) ────────────────────────────────────

/**
 * Issue an ID token for the authenticated user.
 * Audience is the client_id. Contains email, name, and per-client roles.
 */
export async function issueIdToken(
  user: UserConfig,
  client: ClientConfig,
  nonce?: string
): Promise<string> {
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
    .setIssuer(getIssuer())
    .setAudience(client.clientId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Issue an access token for calling the userinfo endpoint.
 * Audience is the issuer (server itself). Contains sub, scope, and roles.
 */
export async function issueAccessToken(
  user: UserConfig,
  client: ClientConfig,
  scope: string
): Promise<string> {
  const { privateKey, kid } = await getKeys();
  const roles = rolesForClient(user, client.clientId);
  return new SignJWT({ sub: user.email, scope, roles })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(getIssuer())
    .setAudience(getIssuer())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Issue an access token for the client_credentials grant.
 * Sub is the client_id (no user involved). Roles come from the client config.
 */
export async function issueClientCredentialsToken(
  client: ClientConfig,
  scope: string
): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({
    sub: client.clientId,
    client_id: client.clientId,
    scope,
    roles: client.roles ?? [],
  })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(getIssuer())
    .setAudience(getIssuer())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Verify an access token and return its payload. Throws if invalid/expired.
 * Used by the userinfo endpoint.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload & Record<string, unknown>> {
  const { publicKey } = await getKeys();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: getIssuer(),
    audience: getIssuer(),
  });
  return payload as JWTPayload & Record<string, unknown>;
}

/**
 * Decode a JWT payload without verification. Useful for inspecting token
 * contents in tests or debugging. Do NOT use for security decisions.
 */
export function unsafeDecodePayload(token: string): JWTPayload & Record<string, unknown> {
  return decodeJwt(token) as JWTPayload & Record<string, unknown>;
}

// ── Refresh tokens (30-day, rotated on use) ───────────────────────────────────

export interface RefreshTokenPayload {
  type: "refresh_token";
  sub: string;
  client_id: string;
  scope: string;
}

/**
 * Issue a refresh token. Only issued when the scope includes "offline_access".
 * Expires in 30 days. Rotated on every use — the old token becomes invalid
 * when a new one is returned.
 */
export async function issueRefreshToken(
  user: UserConfig,
  client: ClientConfig,
  scope: string
): Promise<string> {
  const { privateKey, kid } = await getKeys();
  return new SignJWT({ sub: user.email, client_id: client.clientId, scope, type: "refresh_token" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(getIssuer())
    .setAudience(getIssuer())
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(privateKey);
}

/**
 * Verify a refresh token and return its payload. Throws if invalid or expired.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { publicKey } = await getKeys();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: getIssuer(),
    audience: getIssuer(),
  });
  if (payload.type !== "refresh_token") throw new Error("Not a refresh token");
  return payload as unknown as RefreshTokenPayload;
}

// ── Client secret comparison ──────────────────────────────────────────────────

/** Constant-time string compare to prevent timing attacks on client secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
