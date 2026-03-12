# nyx-auth

OIDC identity provider for the nyx homelab. Built on [Better Auth](https://better-auth.com), [Hono](https://hono.dev), and Bun.

## What it does

- Issues OpenID Connect tokens (authorization code flow) so other apps on nyx can delegate auth here
- Email + password authentication with a dark-themed login page
- Per-client consent page (approve/deny)
- SQLite database for users and sessions
- Admin REST API (bearer token) for user management
- All OIDC clients defined in static YAML config — no runtime client management

## Stack

| | |
|---|---|
| Runtime | Bun |
| Web framework | Hono |
| Auth library | Better Auth 1.x |
| Database | SQLite (`bun:sqlite`, WAL mode) |
| OIDC | Better Auth `oidcProvider` plugin |

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

# Public URL this service is served at
BETTER_AUTH_URL=https://auth.prettybird.zapplebee.online

# Comma-separated allowed CORS origins
TRUSTED_ORIGINS=https://vela.prettybird.zapplebee.online

# Bearer token for the admin API — generate with: openssl rand -base64 32
ADMIN_API_KEY=

PORT=3000
```

### 3. Configure clients

```bash
cp clients.yml.example clients.yml
```

Edit `clients.yml` to define your OIDC clients (see [Clients](#clients) below), then set each client's secret:

```bash
bun run clients:set-secret <clientId>
```

This prompts for the plain-text secret, encrypts it with AES-256-GCM (key derived from `BETTER_AUTH_SECRET`), and writes the `enc:...` value back into `clients.yml`. The encrypted value is safe to commit.

### 4. Run database migration

```bash
bun run db:migrate
```

Creates all Better Auth tables in `data/auth.db`. Re-run after upgrading Better Auth.

### 5. Create your first user

```bash
curl -X POST https://auth.prettybird.zapplebee.online/admin/users \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "...", "name": "Your Name", "role": "admin"}'
```

### 6. Start

```bash
bun run dev    # development (watch mode)
bun run start  # production
```

## Clients

All OIDC clients are defined in `clients.yml`. There is no API for managing clients — edit the file and restart the service.

```yaml
clients:
  - name: Vela CI              # human-readable display name
    clientId: vela             # used in OIDC authorize requests
    clientSecret: "enc:..."    # set via: bun run clients:set-secret vela
    type: web                  # web | native | user-agent-based | public
    redirectURLs:
      - https://vela.prettybird.zapplebee.online/callback
    roles:                     # roles included in the OIDC token for this client
      - user
      - admin
    skipConsent: true          # skip the consent screen (recommended for internal apps)
```

### `roles` per client

The `roles` claim in the OIDC token is the intersection of the user's role and the client's `roles` list. A client that only declares `[user]` will never receive `admin` in the token, even for admin users. Apps use this to enforce role-based access.

### Rotating a client secret

```bash
bun run clients:set-secret <clientId>
```

The old secret is replaced in `clients.yml`. Restart the service to pick it up.

## Admin API

All endpoints require `Authorization: Bearer $ADMIN_API_KEY`.

### Users

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `GET` | `/admin/users` | `?search=&limit=&offset=` | List users |
| `POST` | `/admin/users` | `{email, password, name?, role?}` | Create user |
| `PATCH` | `/admin/users/:id/password` | `{password}` | Set password |
| `PATCH` | `/admin/users/:id/role` | `{role}` | Set role |
| `DELETE` | `/admin/users/:id` | | Delete user |
| `POST` | `/admin/users/:id/ban` | `{reason?, expiresAt?}` | Ban user |
| `POST` | `/admin/users/:id/unban` | | Unban user |

## OIDC endpoints

Exposed automatically by Better Auth. Discovery document at `/.well-known/openid-configuration`.

| Endpoint | Path |
|---|---|
| Discovery | `GET /.well-known/openid-configuration` |
| Authorization | `GET /api/auth/oauth2/authorize` |
| Token | `POST /api/auth/oauth2/token` |
| Userinfo | `GET /api/auth/oauth2/userinfo` |
| JWKS | `GET /api/auth/jwks` |
| End session | `GET /api/auth/oauth2/endsession` |

### Registering nyx-auth with a client app

Use the standard OIDC authorization code flow. Example values:

```
issuer:         https://auth.prettybird.zapplebee.online
client_id:      <clientId from clients.yml>
client_secret:  <plain-text secret you set with clients:set-secret>
redirect_uri:   one of the URLs listed in clients.yml
scopes:         openid profile email
```

## Deployment on nyx

Add to `nyx-docker/docker-compose.auth.yml` (not yet created) and point Traefik at `auth.prettybird.zapplebee.online`. The `data/` directory containing `auth.db` should be bind-mounted to a persistent path on the host.

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start with file watching |
| `bun run start` | Start for production |
| `bun run db:migrate` | Create / update database schema |
| `bun run clients:set-secret <clientId>` | Encrypt and store a client secret |
