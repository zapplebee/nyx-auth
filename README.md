# nyx-auth

A stateless OpenID Connect identity provider for small teams. Designed for adding SSO to internal admin panels without running a database or an identity platform.

Users and clients are defined in YAML config files. All session state lives in signed JWTs. There is no admin API and no database.

## Stack

| | |
|---|---|
| Runtime | Bun |
| Web framework | Hono |
| JWT | jose (ES256) |
| TOTP | otplib |
| Config format | YAML (encrypted secrets) |

## How it works

**Browser login (authorization code + PKCE)**

1. A client app redirects to `/api/auth/oauth2/authorize`
2. The user enters email + password, then a TOTP code (unless opted out)
3. nyx-auth issues a signed authorization code and redirects back
4. The client exchanges the code for an ID token and access token
5. The ID token contains `email`, `name`, and per-client `roles`

**Machine-to-machine (client credentials)**

1. A service POSTs `grant_type=client_credentials` with its `client_id` and `client_secret`
2. nyx-auth returns a signed access token — no user, no browser, no session
3. The token contains `sub: <clientId>`, `roles`, and `scope`

Discovery document at `/api/auth/.well-known/openid-configuration`.

## Quick start

### 1. Install

```bash
bun install
```

### 2. Environment

```env
# Master encryption key — used to decrypt all enc:... values in clients.yml / users.yml.
# Must be at least 32 characters. Never commit this to source control.
# Generate with: openssl rand -base64 32
NYX_SECRET=<random 32+ char string>

# Public HTTPS URL of this service — used as the OIDC issuer claim.
NYX_URL=https://auth.example.com

# Comma-separated CORS origins allowed to call /api/auth/*
TRUSTED_ORIGINS=https://admin.example.com

PORT=3000
```

nyx-auth validates `NYX_SECRET` and `NYX_URL` at startup and exits with a clear error message if either is missing or invalid.

### 3. Define clients

```bash
cp clients.yml.example clients.yml
# set each client's secret (prompts, then writes enc:... back to the file)
bun run clients:set-secret <clientId>
```

### 4. Define users

Create `users.yml` (see [USAGE.md](USAGE.md) for the full format), then encrypt passwords and TOTP seeds:

```bash
bun run users:set-password <email>
bun run users:set-totp-seed <email>   # or set otpSeed: OPT_OUT to skip TOTP
```

### 5. Run

```bash
bun run dev     # watch mode
bun run start   # production
```

## OIDC endpoints

All under `/api/auth/`:

| Endpoint | Path |
|---|---|
| Discovery | `GET .well-known/openid-configuration` |
| JWKS | `GET jwks.json` |
| Authorization | `GET oauth2/authorize` |
| Token | `POST oauth2/token` |
| Userinfo | `GET userinfo` |

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start with file watching |
| `bun run start` | Start for production |
| `bun run test` | Run unit tests |
| `bun run test:coverage` | Run unit tests with coverage |
| `bun run clients:set-secret <clientId>` | Encrypt and store a client secret |
| `bun run users:set-password <email>` | Encrypt and store a user password |
| `bun run users:set-totp-seed <email>` | Encrypt and store a TOTP seed |
| `bun run validate:config` | Validate `clients.yml` and `users.yml` without starting the server |

## Deployment

See [USAGE.md](USAGE.md) for Docker, multi-replica, and client integration examples.

See [PRINCIPLES.md](PRINCIPLES.md) for the design philosophy behind the stateless, config-first approach.
