# Design Principles

nyx-auth is built around a small number of deliberate constraints. This document explains what those constraints are, why they exist, and what they cost.

---

## Stateless by design

nyx-auth holds no state between requests. There is no database, no cache, no session store.

All state is encoded in signed JWTs:

| Token | Lifetime | Contents |
|---|---|---|
| Session cookie (`nyx_session`) | 1 hour | `sub` (email), `type: session` |
| Pending TOTP (`pending_totp`) | 5 minutes | `sub` (email), issued after correct password |
| Authorization code | 2 minutes | All authorize params including PKCE challenge |
| ID token | 1 hour | `sub`, `email`, `name`, `roles`, `nonce` |
| Access token | 1 hour | `sub`, `scope`, `roles` |

Validity is proven by the ES256 signature alone. A token is valid if the signature checks out and it has not expired. There is no token revocation — a session ends when the JWT expires or the user's browser discards the cookie.

**What this enables:** Any number of replicas can run simultaneously with zero coordination. Deploy two containers behind a load balancer and both can issue and verify tokens without talking to each other, provided they share a signing key (`SIGNING_PRIVATE_JWK`).

**What this costs:** There is no way to invalidate an active session before it expires naturally. If a user's account is compromised, the attacker's session will remain valid for up to one hour. For most internal admin panel use cases, this is an acceptable trade-off. If you need immediate revocation, nyx-auth is not the right tool.

---

## Config-first provisioning

Users and clients are defined in YAML files checked into source control. There is no admin API, no web UI for user management, no runtime provisioning.

```
clients.yml   — OIDC client definitions (client IDs, secrets, redirect URLs, skipConsent)
users.yml     — User accounts (emails, passwords, TOTP seeds, per-client roles)
```

Secrets are encrypted at rest using AES-256-GCM with a key derived from `BETTER_AUTH_SECRET` via PBKDF2. The `enc:...` values in the YAML files are safe to commit to a private repository.

**What this enables:**

- User and client configuration is reviewed and audited through the same pull request process as code.
- No network access is needed to add a user — edit a file, restart the service.
- The full state of the authorization system is recoverable from the config files and environment variables alone. There is no database to back up.
- Configuration drift between environments is impossible — the file is the source of truth.

**What this costs:** Adding a user requires access to the config file and a service restart. This is intentional — nyx-auth targets small teams where the set of users is stable and changes infrequently. It is not suitable for systems where users self-register or where accounts change constantly.

---

## No admin API

There is no API for creating users, changing passwords, or modifying clients at runtime.

This is a deliberate choice, not an oversight. An admin API is an attack surface. It requires authentication (a bootstrapping problem), authorization, audit logging, and rate limiting — all of which add complexity and potential failure modes. For a tool used by a small team with direct access to config files, none of that overhead is necessary.

Operational tasks that would otherwise require an API are handled by CLI scripts:

```bash
bun run users:set-password <email>      # change a password
bun run users:set-totp-seed <email>     # enroll or rotate TOTP
bun run clients:set-secret <clientId>   # rotate a client secret
```

These scripts write encrypted values directly to the YAML files. A service restart picks up the changes.

---

## Security choices

### Timing attack prevention

All failed login attempts — wrong password, unknown email, wrong TOTP code, invalid pending token — are delayed by a configurable amount (default: 1 second) before the response is returned. This prevents attackers from using response timing to distinguish valid emails from invalid ones, or to narrow down a correct password.

Password comparison uses a constant-time algorithm regardless of whether the email was found, by always running the comparison against a dummy value for unknown users.

### PKCE

The authorization endpoint supports and enforces PKCE (S256) for clients that send a `code_challenge`. This prevents authorization code interception attacks — the authorization code is useless without the `code_verifier` that matches the stored challenge.

### TOTP

TOTP provides a second factor that is independent of the password. The TOTP seed is stored encrypted in `users.yml`. A compromised password alone is not sufficient to complete login for any user without `otpSeed: OPT_OUT`.

The login flow is intentionally two-step: the server does not reveal whether a password was correct or incorrect until after the TOTP step (from the attacker's perspective, the 1-second delay on failure makes both paths look identical).

### ES256 over HS256

JWTs are signed with ES256 (ECDSA over P-256) rather than HS256. This allows the public key to be published at the JWKS endpoint so relying parties can verify tokens locally without sharing a secret. The private key never leaves the nyx-auth process.

---

## What nyx-auth is not

**Not a user directory.** nyx-auth does not store or manage user profiles beyond what is needed for authentication. Email, name, and roles come from `users.yml`. There is no profile edit flow.

**Not a federation hub.** nyx-auth does not support logging in via Google, GitHub, Microsoft, or any other external identity provider. It authenticates users against its own local user list only.

**Not a multi-tenant platform.** All clients share the same user pool. There is no concept of organizations, workspaces, or tenant isolation.

**Not suitable for consumer-facing apps.** The small-team, config-driven model does not scale to self-registration, password reset flows, email verification, or account recovery. Those features require a database and the complexity that comes with it.

---

## The right fit

nyx-auth works well when:

- You have a small, known set of users (a team, not the public)
- You need SSO across several internal tools without paying for Okta or Auth0
- You want auth configuration to live in your infrastructure repo alongside everything else
- You need to run multiple replicas without a shared database
- You want to understand exactly what your auth layer is doing

It is not the right tool when users can self-register, when accounts need to be provisioned programmatically at scale, or when you need immediate session revocation.
