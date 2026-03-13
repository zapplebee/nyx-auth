# Usage Guide

Practical patterns for deploying nyx-auth and integrating it with admin panels.

---

## Table of contents

- [Defining clients](#defining-clients)
- [Defining users](#defining-users)
- [Standard OIDC claims](#standard-oidc-claims)
- [TOTP setup](#totp-setup)
- [Refresh tokens and offline access](#refresh-tokens-and-offline-access)
- [Connecting a client app](#connecting-a-client-app)
- [Machine-to-machine tokens (client credentials)](#machine-to-machine-tokens-client-credentials)
- [End-to-end testing without a browser login](#end-to-end-testing-without-a-browser-login)
- [Using roles](#using-roles)
- [Rotating secrets](#rotating-secrets)
- [Startup validation](#startup-validation)
- [Validating config before deploy](#validating-config-before-deploy)
- [Docker deployment](#docker-deployment)
- [Multi-replica deployment](#multi-replica-deployment)
- [Environment reference](#environment-reference)

---

## Defining clients

`clients.yml` defines every OIDC client. Edit the file and restart the service — there is no runtime API for client management.

```yaml
clients:
  - name: Internal Admin          # display name shown on the consent screen
    clientId: admin-panel         # sent by the client in authorize requests
    clientSecret: "enc:..."       # set with: bun run clients:set-secret admin-panel
    type: web                     # web | native | user-agent-based | public
    redirectURLs:
      - https://admin.example.com/callback
    skipConsent: true             # skip consent for trusted internal apps
```

### Setting a client secret

```bash
NYX_SECRET=<your-secret> bun run clients:set-secret admin-panel
```

The script prompts for the plain-text secret, encrypts it with AES-256-GCM, and writes the `enc:...` value back to `clients.yml`. The file is safe to commit.

### Client types

| Type | Secret required | Notes |
|---|---|---|
| `web` | Yes | Server-side apps with a secure backend |
| `public` | No | SPAs, mobile apps — PKCE required |
| `native` | No | Desktop / CLI tools |

For public clients, omit `clientSecret` entirely and ensure the client sends a PKCE `code_challenge` with every authorize request.

> **Production redirect URIs:** When `NODE_ENV=production`, `redirectURLs` that use `http://` are rejected at startup unless the host is a loopback address (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`). All production redirect URIs should use `https://`.

---

## Defining users

`users.yml` defines every user. The format:

```yaml
users:
  - email: alice@example.com
    name: Alice Smith
    password: "enc:..."           # set with: bun run users:set-password alice@example.com
    otpSeed: "enc:..."            # set with: bun run users:set-totp-seed alice@example.com

    # Standard OIDC profile claims (optional — included in tokens when profile scope is requested)
    preferred_username: alice
    given_name: Alice
    family_name: Smith
    picture: https://example.com/avatars/alice.jpg
    website: https://alice.example.com

    # Standard OIDC email claim (optional — included when email scope is requested)
    email_verified: true

    clients:
      - clientId: admin-panel
        roles: [admin]
      - clientId: metrics
        roles: [viewer]

  - email: bob@example.com
    name: Bob Jones
    password: "enc:..."
    otpSeed: OPT_OUT              # TOTP disabled for this user
    clients:
      - clientId: admin-panel
        roles: [viewer]
```

### Adding a user

1. Add the entry to `users.yml` with placeholder `enc:` values
2. Set the password: `bun run users:set-password alice@example.com`
3. Set the TOTP seed: `bun run users:set-totp-seed alice@example.com` (or set `otpSeed: OPT_OUT`)
4. Restart nyx-auth

### Per-client roles

Each user entry lists the clients they can access and the roles they hold for each. A user who is not listed under a given `clientId` can still authenticate — they will receive an empty `roles` array in their token.

To prevent a user from accessing a client entirely, do not list them — or enforce access at the client by checking for a required role.

---

## Standard OIDC claims

nyx-auth maps the standard OIDC scopes to user profile fields per [OIDC Core §5.4](https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims). Claims are included in both the ID token and the userinfo endpoint response based on which scopes the client requested.

### Scope-to-claims mapping

| Scope | Claims included |
|---|---|
| `openid` | `sub`, `email`, `name` |
| `profile` | `name`, `preferred_username`, `given_name`, `family_name`, `picture`, `website` |
| `email` | `email`, `email_verified` |

Only fields that are set in `users.yml` are included. Unset optional fields are omitted entirely — they will not appear as `null` in tokens.

### Configuring user profile fields

Add any of these optional fields to a user entry in `users.yml`:

| Field | Scope | Description |
|---|---|---|
| `preferred_username` | profile | Short name or handle (e.g. `alice`) |
| `given_name` | profile | First name |
| `family_name` | profile | Last name |
| `picture` | profile | Absolute URL of a profile photo |
| `website` | profile | Absolute URL of the user's website |
| `email_verified` | email | `true` if the email address has been verified |

### Example token claims

Given a user with `preferred_username`, `given_name`, `family_name`, and `email_verified` set, and a client requesting `openid profile email`:

```json
{
  "sub": "alice@example.com",
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice Smith",
  "preferred_username": "alice",
  "given_name": "Alice",
  "family_name": "Smith",
  "roles": ["admin"]
}
```

### Custom claims

For non-standard claims (e.g. Microsoft Entra's `oid`, `tid`, or custom `groups`), use the `claims` field. These are merged into every token for this user regardless of scope:

```yaml
users:
  - email: alice@example.com
    name: Alice Smith
    claims:
      oid: "550e8400-e29b-41d4-a716-446655440000"
      department: engineering
```

Standard claims always override any matching key in `claims`.

#### Naming convention for custom claim keys

Short, unnamespaced identifiers (`oid`, `tid`, `groups`) are accepted as-is.

For URI-namespaced claims the path components must use **kebab-case** — not camelCase:

```yaml
claims:
  # ✓ correct
  https://example.com/tenant-id: "abc"
  https://example.com/email-verification: true

  # ✗ rejected at startup (camelCase path component)
  https://example.com/tenantId: "abc"
```

nyx-auth validates claim key names at startup and will exit with an error if a URI-style key contains camelCase. Run `bun run validate:config` to check without starting the server.

---

## TOTP setup

nyx-auth uses RFC 6238 TOTP (the same standard as Google Authenticator, Authy, 1Password, and most authenticator apps).

### Enrolling a user

1. Generate a base32 seed:

   ```bash
   bun -e "import { generateSecret } from 'otplib'; console.log(generateSecret())"
   ```

2. Register it in `users.yml`:

   ```bash
   bun run users:set-totp-seed alice@example.com
   # Enter the base32 seed at the prompt
   ```

3. Give Alice the seed to scan as a QR code, or enter it manually into her authenticator app. Tools like `qrencode` can generate a QR from an `otpauth://` URI:

   ```
   otpauth://totp/nyx-auth:alice%40example.com?secret=<BASE32_SEED>&issuer=nyx-auth
   ```

### Opting out

Set `otpSeed: OPT_OUT` in `users.yml`. The user will log in with password only. Useful for service accounts or during initial onboarding before TOTP is configured.

### Rotating a TOTP seed

Run `bun run users:set-totp-seed <email>` with the new seed, restart the service, and re-enroll the user in their authenticator app. The old seed stops working immediately on restart.

---

## Refresh tokens and offline access

nyx-auth only issues a refresh token when the authorization request explicitly includes the `offline_access` scope. This follows [OIDC Core §11](https://openid.net/specs/openid-connect-core-1_0.html#OfflineAccess) and prevents clients from receiving long-lived credentials they did not ask for.

### Requesting a refresh token

Include `offline_access` in the `scope` parameter when redirecting to the authorization endpoint:

```
scope=openid profile email offline_access
```

The token response will then include a `refresh_token` alongside `access_token` and `id_token`:

```json
{
  "access_token": "<jwt>",
  "id_token": "<jwt>",
  "refresh_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

If `offline_access` is not in the requested scope, no `refresh_token` is returned. The client must redirect the user to log in again when the access token expires.

### Refresh token rotation

Every time a refresh token is used, a new one is returned in the response and the previous one is retired. This limits the window of exposure if a refresh token is leaked — an attacker who uses it will immediately invalidate the legitimate client's token.

### Lifetime

Refresh tokens expire after 30 days. After expiry the user must log in again.

### OIDC library configuration

Most OIDC libraries request `offline_access` automatically when you set a `refreshToken` or `silentRenew` option. Check your library's docs for the exact setting. For `oidc-client-ts`:

```typescript
const auth = new UserManager({
  authority: "https://auth.example.com/api/auth",
  client_id: "admin-panel",
  redirect_uri: `${window.location.origin}/callback`,
  scope: "openid profile email offline_access",
  automaticSilentRenew: true,
});
```

---

## Connecting a client app

Any OIDC-capable library works. The discovery document at `/api/auth/.well-known/openid-configuration` provides all endpoint URLs automatically.

### Example: oidc-client-ts (browser SPA)

```typescript
import { UserManager } from "oidc-client-ts";

const auth = new UserManager({
  authority: "https://auth.example.com/api/auth",
  client_id: "admin-panel",
  redirect_uri: `${window.location.origin}/callback`,
  scope: "openid profile email",
  // For public clients, PKCE is handled automatically
});

// Redirect to login
await auth.signinRedirect();

// After redirect back, process the callback
const user = await auth.signinRedirectCallback();
console.log(user.profile.email, user.profile.roles);
```

### Example: server-side (Node/Bun with openid-client)

```typescript
import { discovery, authorizationCodeGrant } from "openid-client";

const config = await discovery(
  new URL("https://auth.example.com/api/auth"),
  "admin-panel",
  "your-client-secret"
);

// In your login route handler:
const redirectUrl = config.authorizationUrl({ redirect_uri, scope: "openid email profile" });

// In your callback route handler:
const tokens = await authorizationCodeGrant(config, callbackRequest);
const claims = tokens.claims(); // { sub, email, name, roles, ... }
```

### OIDC configuration values

```
issuer:          https://auth.example.com/api/auth
                 (value of NYX_URL + /api/auth is wrong — issuer IS NYX_URL)
client_id:       <clientId from clients.yml>
client_secret:   <plain-text value you set via clients:set-secret>
redirect_uri:    must exactly match one entry in clients.yml redirectURLs
scopes:          openid profile email
```

> The `issuer` is the value of `NYX_URL` exactly (e.g. `https://auth.example.com`). Discovery is at `<issuer>/api/auth/.well-known/openid-configuration`.

### Required scope

Every authorization request **must** include `openid` in the `scope` parameter. Requests without it are rejected with an `invalid_scope` error redirect. Standard usage is:

```
scope=openid profile email
```

### CSRF protection with the state parameter

The `state` parameter is an OAuth 2.0 security requirement ([RFC 6749 §10.12](https://datatracker.ietf.org/doc/html/rfc6749#section-10.12)). Every authorization request should include a cryptographically random `state` value. Validate that the value returned in the callback matches the one you sent — reject any callback where it is missing or different.

nyx-auth echoes the `state` back unchanged in every redirect (both success and error), so the client can always perform this check.

Most OIDC libraries handle `state` generation and validation automatically. If you are implementing the redirect manually:

```typescript
// Generate and store state before redirecting
const state = crypto.randomBytes(16).toString("hex");
session.oauthState = state;

// Include it in the authorize redirect
params.set("state", state);

// In the callback, validate it before exchanging the code
if (req.query.state !== session.oauthState) {
  return res.status(400).send("Invalid state — possible CSRF attack");
}
```

---

## Machine-to-machine tokens (client credentials)

The OAuth2 client credentials grant lets a service authenticate as itself — no user login, no browser, no session. Use this for cron jobs, backend services, CI pipelines, or any process that needs to call a protected API.

### Client config

Machine clients are defined in `clients.yml` like any other client. They do not need `redirectURLs` and should not be marked `public`:

```yaml
clients:
  - name: Deployment Bot
    clientId: deploy-bot
    clientSecret: "enc:..."        # set with: bun run clients:set-secret deploy-bot
    type: web
    redirectURLs: []
    roles:
      - deploy
      - read
```

The `roles` field defines what roles appear in machine tokens for this client. There is no user involved, so roles come entirely from the client config.

### Requesting a token

Send a `POST` to the token endpoint with `grant_type=client_credentials`:

```bash
curl -X POST https://auth.example.com/api/auth/oauth2/token \
  -d grant_type=client_credentials \
  -d client_id=deploy-bot \
  -d client_secret=your-plain-text-secret \
  -d scope=deploy
```

Or using HTTP Basic authentication:

```bash
curl -X POST https://auth.example.com/api/auth/oauth2/token \
  -u deploy-bot:your-plain-text-secret \
  -d grant_type=client_credentials \
  -d scope=deploy
```

> **Note on Basic auth encoding ([RFC 6749 §2.3.1](https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1)):** If `client_id` or `client_secret` contain special characters (e.g. `+`, `=`, `&`, `%`), URL-encode each component before base64-encoding the `client_id:client_secret` pair. nyx-auth URL-decodes both components after base64-decoding, so compliant clients using this encoding will authenticate correctly. `curl -u` handles this automatically; if you are constructing the header manually, apply `encodeURIComponent()` to both values before concatenating them.

Response:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "deploy"
}
```

No `id_token` is returned — there is no user.

### Token claims

The access token contains:

```json
{
  "sub": "deploy-bot",
  "client_id": "deploy-bot",
  "scope": "deploy",
  "roles": ["deploy", "read"],
  "iss": "https://auth.example.com",
  "aud": "https://auth.example.com"
}
```

### Verifying a machine token

Machine tokens use the same signing key and issuer as user tokens. Verify them the same way:

```typescript
import { jwtVerify, createRemoteJWKSet } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://auth.example.com/api/auth/jwks.json"));

const { payload } = await jwtVerify(token, JWKS, {
  issuer: "https://auth.example.com",
  audience: "https://auth.example.com",
});

// Distinguish machine tokens from user tokens:
if (payload.client_id && !payload.email) {
  // machine token — payload.sub is the clientId
} else {
  // user token — payload.sub is the user's email
}
```

### Restrictions

- `public` clients cannot use the client credentials grant. A machine token requires a verified secret.
- Machine tokens are not accepted by the userinfo endpoint — there is no user to describe.

---

## End-to-end testing without a browser login

nyx-auth is an HTTP service with no magic middleware. Every step of the login flow is a plain API call, so tests can acquire tokens programmatically — no browser navigation, no `cy.origin()`, no waiting for redirects.

### Choose the right approach for your test

| What you're testing | Approach |
|---|---|
| API endpoints (no user context needed) | [Client credentials](#pattern-a-client-credentials-for-api-tests) |
| UI behaviour as a specific user | [Programmatic login → inject token](#pattern-b-programmatic-user-login) |
| Full login UI (smoke test of the login flow itself) | `cy.origin()` as shown in the repo's own Cypress suite |

---

### Test config files

Keep test credentials in dedicated config files so they never touch production data:

**`clients.test.yml`**
```yaml
clients:
  - name: Test App
    clientId: test-app
    clientSecret: "enc:..."     # bun run clients:set-secret test-app
    type: web
    redirectURLs:
      - http://localhost:3000/callback
    skipConsent: true           # never show consent screen in tests

  - name: Test Machine
    clientId: test-machine
    clientSecret: "enc:..."
    type: web
    redirectURLs: []
    roles: [admin]
```

**`users.test.yml`**
```yaml
users:
  - email: testuser@example.com
    name: Test User
    password: "enc:..."         # bun run users:set-password testuser@example.com
    otpSeed: OPT_OUT            # no TOTP in tests — avoids time-sensitive codes
    clients:
      - clientId: test-app
        roles: [admin]
```

`OPT_OUT` is the key detail: it removes the TOTP step entirely so tests never need to generate time-sensitive codes. Use it for all test users.

Run nyx-auth pointed at these files:

```bash
NYX_SECRET=$(openssl rand -base64 32) NYX_URL=http://localhost:3001 \
  CLIENTS_CONFIG=./clients.test.yml USERS_CONFIG=./users.test.yml \
  bun run start
```

---

### Pattern A: Client credentials for API tests

If your app's API accepts machine tokens, there is nothing to log in to. One request gets a token:

```typescript
const res = await fetch("http://localhost:3001/api/auth/oauth2/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: "test-machine",
    client_secret: "plain-text-secret",
    scope: "api:admin",
  }),
});
const { access_token } = await res.json();

// Use it in your test requests
await fetch("http://localhost:8080/api/admin/users", {
  headers: { Authorization: `Bearer ${access_token}` },
});
```

**Cypress:**

```javascript
// cypress/support/commands.js
Cypress.Commands.add("getClientToken", (scope = "") => {
  return cy.request({
    method: "POST",
    url: `${Cypress.env("AUTH_URL")}/api/auth/oauth2/token`,
    form: true,
    body: {
      grant_type: "client_credentials",
      client_id: Cypress.env("TEST_MACHINE_CLIENT_ID"),
      client_secret: Cypress.env("TEST_MACHINE_CLIENT_SECRET"),
      scope,
    },
  }).its("body.access_token");
});

// In a test:
it("admin endpoint requires admin role", () => {
  cy.getClientToken("api:admin").then((token) => {
    cy.request({
      url: "/api/admin/users",
      headers: { Authorization: `Bearer ${token}` },
    }).its("status").should("eq", 200);
  });
});
```

---

### Pattern B: Programmatic user login

For tests that need a real user session — testing role-based UI rendering, personalised content, or anything that reads the user's identity from the token:

**Step 1: Log in and get a session cookie**

```typescript
const loginRes = await fetch("http://localhost:3001/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "testuser@example.com", password: "plain-text-password" }),
  credentials: "include",
});
// loginRes sets the nyx_session cookie; no TOTP step because otpSeed is OPT_OUT
```

**Step 2: Exchange for tokens via the authorize endpoint**

```typescript
const params = new URLSearchParams({
  client_id: "test-app",
  redirect_uri: "http://localhost:3000/callback",
  response_type: "code",
  scope: "openid email profile",
  code_challenge: "<pkce_challenge>",
  code_challenge_method: "S256",
});

// Follow the redirect chain — the session cookie is sent automatically
const authorizeRes = await fetch(
  `http://localhost:3001/api/auth/oauth2/authorize?${params}`,
  { redirect: "follow", credentials: "include" }
);
// authorizeRes.url is now: http://localhost:3000/callback?code=<auth_code>

const code = new URL(authorizeRes.url).searchParams.get("code");
```

**Step 3: Exchange the code for tokens**

```typescript
const tokenRes = await fetch("http://localhost:3001/api/auth/oauth2/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: "http://localhost:3000/callback",
    client_id: "test-app",
    client_secret: "plain-text-secret",
    code_verifier: "<pkce_verifier>",
  }),
});
const { access_token, id_token } = await tokenRes.json();
```

**Cypress with `cy.session()`:**

`cy.session()` caches the authenticated state across tests in the same run, so login only happens once per suite:

```javascript
// cypress/support/commands.js
Cypress.Commands.add("loginAs", (email, password) => {
  cy.session([email], () => {
    cy.request({
      method: "POST",
      url: `${Cypress.env("AUTH_URL")}/api/auth/login`,
      body: { email, password },
    });
    // Session cookie is now set and cached by cy.session()
  });
});

// In a test:
beforeEach(() => {
  cy.loginAs("testuser@example.com", "plain-text-password");
});
```

**Playwright:**

```typescript
// auth.setup.ts — runs once, saves auth state to a file
import { test as setup } from "@playwright/test";

setup("authenticate", async ({ request, page }) => {
  await request.post("http://localhost:3001/api/auth/login", {
    data: { email: "testuser@example.com", password: "plain-text-password" },
  });
  // Playwright automatically carries cookies forward
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
```

```typescript
// playwright.config.ts
export default {
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "tests",
      dependencies: ["setup"],
      use: { storageState: "playwright/.auth/user.json" },
    },
  ],
};
```

---

### What to keep in mind

**Use `OPT_OUT` for all test users.** TOTP codes are time-sensitive and introduce flakiness. Reserve TOTP testing for the small suite that explicitly validates the TOTP flow itself.

**Use `skipConsent: true` on test clients.** The consent screen adds an extra redirect that is irrelevant to most tests.

**Never reuse production `NYX_SECRET`.** Run nyx-auth for tests with a separate `NYX_SECRET` and separate config files. This ensures test `enc:` values cannot decrypt production secrets.

**Prefer client credentials for pure API tests.** The full authorization code flow involves redirect handling and PKCE, which adds complexity. If the test is about your API rather than your login flow, a machine token is simpler and faster.

---

## Using roles

The `roles` claim in the ID token and access token is an array of strings. It contains whatever roles the user holds for the specific client they authenticated against.

### In a SPA

```typescript
const user = await auth.getUser();
const roles = (user?.profile?.roles as string[]) ?? [];

if (!roles.includes("admin")) {
  // redirect to 403
}
```

### In a server-side middleware

```typescript
import { jwtVerify, createRemoteJWKSet } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://auth.example.com/api/auth/jwks.json"));

async function requireRole(token: string, role: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://auth.example.com",
    audience: "admin-panel",
  });
  const roles = (payload.roles as string[]) ?? [];
  if (!roles.includes(role)) throw new Error("Forbidden");
  return payload;
}
```

### Role design pattern

Keep roles simple and coarse: `admin`, `editor`, `viewer`. Assign fine-grained permissions in the application using roles as a starting point — don't try to encode every permission in the token.

---

## Rotating secrets

### Client secret

```bash
bun run clients:set-secret <clientId>
```

Updates `clients.yml`. Restart nyx-auth to pick it up. Update the secret in your client app at the same time.

### User password

```bash
bun run users:set-password <email>
```

Updates `users.yml`. Active sessions remain valid until they expire (1 hour). The user must re-authenticate after their session expires.

### TOTP seed

```bash
bun run users:set-totp-seed <email>
```

Updates `users.yml`. The old seed stops working as soon as the service restarts. Coordinate with the user — they must re-enroll in their authenticator app.

### Encryption key (`NYX_SECRET`)

The encryption key cannot be rotated without re-encrypting all `enc:` values in `clients.yml` and `users.yml`. If you need to rotate:

1. Set the new `NYX_SECRET` in your environment
2. Re-run `clients:set-secret` for every client
3. Re-run `users:set-password` and `users:set-totp-seed` for every user
4. Restart nyx-auth

---

## Startup validation

nyx-auth validates its environment and config files before serving any requests. If something is wrong it exits immediately with a descriptive message listing every problem at once.

### Environment checks

On startup, nyx-auth checks:

- **`NYX_SECRET`** is set, is valid base64, and decodes to exactly 32 bytes
- **`NYX_URL`** is set and is a valid URL; when `NODE_ENV=production`, it must use HTTPS

Example output when `NYX_SECRET` is missing and `NYX_URL` is invalid:

```
[nyx-auth] Startup failed — invalid configuration:

  ✗ NYX_SECRET is not set.
      NYX_SECRET is the master encryption key for all secrets stored in clients.yml and users.yml.
      Generate one with: openssl rand -base64 32
  ✗ NYX_URL is not a valid URL (got: auth.example.com).
```

### Config checks

After loading `clients.yml` and `users.yml`, nyx-auth validates:

**Clients:**
- At least one client is defined
- `clientId` and `name` are non-empty
- `type` is one of `web`, `native`, `user-agent-based`, or `public`
- Non-public clients have a `clientSecret` set
- All `redirectURLs` are well-formed absolute URLs
- When `NODE_ENV=production`, `redirectURLs` that use `http://` are rejected unless the host is a loopback address (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`) — per [RFC 6749 §10.6](https://datatracker.ietf.org/doc/html/rfc6749#section-10.6)

**Users:**
- At least one user is defined
- `email` is a valid email address with no duplicates
- `name` and `password` are non-empty
- URI-style `claims` keys must use kebab-case path components (see [Custom claims](#custom-claims))

Any validation error exits with a non-zero status code and a message pointing to the specific field and the fix.

---

## Validating config before deploy

Use `bun run validate:config` to check `clients.yml` and `users.yml` without starting the server. This is useful as a pre-deploy CI step to catch config errors before they reach production.

```bash
NYX_SECRET=<your-secret> bun run validate:config
```

Example success output:

```
✓ Config is valid (2 client(s), 3 user(s))
  clients: ./clients.yml
  users:   ./users.yml
```

Example failure output:

```
Config validation failed — 2 error(s):

  ✗ client "admin-panel": redirectURL "admin.example.com/callback" is not a valid URL
  ✗ user "bob@example.com": password must not be empty — run: bun run users:set-password bob@example.com
```

### CI integration example

```yaml
# GitHub Actions
- name: Validate nyx-auth config
  run: NYX_SECRET=${{ secrets.NYX_SECRET }} bun run validate:config
  env:
    CLIENTS_CONFIG: ./clients.prod.yml
    USERS_CONFIG: ./users.prod.yml
```

---

## Docker deployment

```dockerfile
# The image is built from the repo's Dockerfile
docker run -d \
  --name nyx-auth \
  -e NODE_ENV=production \
  -e NYX_SECRET=<secret> \
  -e NYX_URL=https://auth.example.com \
  -e TRUSTED_ORIGINS=https://admin.example.com \
  -v $(pwd)/clients.yml:/app/clients.yml:ro \
  -v $(pwd)/users.yml:/app/users.yml:ro \
  -p 3000:3000 \
  harbor.prettybird.zapplebee.online/library/nyx-auth:latest
```

Config files are mounted read-only. No persistent volume is needed — there is no database.

`NODE_ENV=production` enables the HTTPS check on `NYX_URL` so misconfigured HTTP deployments are caught at startup rather than silently serving insecure tokens.

### Docker Compose example

```yaml
services:
  nyx-auth:
    image: harbor.prettybird.zapplebee.online/library/nyx-auth:latest
    restart: unless-stopped
    environment:
      NODE_ENV: production
      NYX_SECRET: ${NYX_AUTH_SECRET}
      NYX_URL: https://auth.example.com
      TRUSTED_ORIGINS: https://admin.example.com
    volumes:
      - ./clients.yml:/app/clients.yml:ro
      - ./users.yml:/app/users.yml:ro
    ports:
      - "3000:3000"
```

---

## Multi-replica deployment

By default nyx-auth generates an ephemeral ES256 signing key at startup. This means each replica signs tokens with a different key — tokens from one replica cannot be verified by another.

To share a stable key across all replicas, generate a key pair once and set `SIGNING_PRIVATE_JWK`:

```bash
bun -e "
  import { generateKeyPair, exportJWK } from 'jose';
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  console.log(JSON.stringify(await exportJWK(privateKey)));
"
```

Set the output as the `SIGNING_PRIVATE_JWK` environment variable on every replica. All replicas will share the same key and can verify each other's tokens.

The `kid` field is derived from the JWK. Add one manually if you want predictable key IDs for JWKS consumers:

```json
{ "kty": "EC", "crv": "P-256", "kid": "nyx-2026", "d": "...", "x": "...", "y": "..." }
```

---

## Environment reference

| Variable | Required | Description |
|---|---|---|
| `NYX_SECRET` | Yes | Master encryption key for all `enc:` values in `clients.yml` and `users.yml`. Must be a **base64-encoded value that decodes to exactly 32 bytes**. Generate with `openssl rand -base64 32`. Never commit this value. |
| `NYX_URL` | Yes | Public URL of this service (e.g. `https://auth.example.com`). Used as the OIDC issuer. Must be HTTPS when `NODE_ENV=production`. |
| `NODE_ENV` | No | Set to `production` to enforce HTTPS on `NYX_URL`. Recommended for all production deployments. |
| `TRUSTED_ORIGINS` | No | Comma-separated CORS origins allowed to call `/api/auth/*`. Defaults to `*` if not set. |
| `SIGNING_PRIVATE_JWK` | No | JSON-serialized ES256 private key JWK. Generated ephemerally if not set. Required for multi-replica deployments. |
| `CLIENTS_CONFIG` | No | Path to clients YAML. Defaults to `./clients.yml`. |
| `USERS_CONFIG` | No | Path to users YAML. Defaults to `./users.yml`. |
| `PORT` | No | HTTP port. Defaults to `3000`. |
