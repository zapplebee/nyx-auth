# Usage Guide

Practical patterns for deploying nyx-auth and integrating it with admin panels.

---

## Table of contents

- [Defining clients](#defining-clients)
- [Defining users](#defining-users)
- [TOTP setup](#totp-setup)
- [Connecting a client app](#connecting-a-client-app)
- [Machine-to-machine tokens (client credentials)](#machine-to-machine-tokens-client-credentials)
- [Using roles](#using-roles)
- [Rotating secrets](#rotating-secrets)
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

---

## Defining users

`users.yml` defines every user. The format:

```yaml
users:
  - email: alice@example.com
    name: Alice Smith
    password: "enc:..."           # set with: bun run users:set-password alice@example.com
    otpSeed: "enc:..."            # set with: bun run users:set-totp-seed alice@example.com
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

## Docker deployment

```dockerfile
# The image is built from the repo's Dockerfile
docker run -d \
  --name nyx-auth \
  -e NYX_SECRET=<secret> \
  -e NYX_URL=https://auth.example.com \
  -e TRUSTED_ORIGINS=https://admin.example.com \
  -v $(pwd)/clients.yml:/app/clients.yml:ro \
  -v $(pwd)/users.yml:/app/users.yml:ro \
  -p 3000:3000 \
  harbor.prettybird.zapplebee.online/library/nyx-auth:latest
```

Config files are mounted read-only. No persistent volume is needed — there is no database.

### Docker Compose example

```yaml
services:
  nyx-auth:
    image: harbor.prettybird.zapplebee.online/library/nyx-auth:latest
    restart: unless-stopped
    environment:
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
| `NYX_SECRET` | Yes | Encryption key for `enc:` values. Min 32 chars. |
| `NYX_URL` | Yes | Public URL of this service (e.g. `https://auth.example.com`). Used as OIDC issuer. |
| `TRUSTED_ORIGINS` | No | Comma-separated CORS origins. Defaults to `*` if not set. |
| `SIGNING_PRIVATE_JWK` | No | JSON-serialized ES256 private key JWK. Generated ephemerally if not set. |
| `CLIENTS_CONFIG` | No | Path to clients YAML. Defaults to `./clients.yml`. |
| `USERS_CONFIG` | No | Path to users YAML. Defaults to `./users.yml`. |
| `PORT` | No | HTTP port. Defaults to `3000`. |
