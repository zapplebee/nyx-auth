# CLAUDE.md — nyx-auth

Guidance for working in this repository.

---

## Commands

```bash
bun test tests/               # run all unit tests
bun test tests/foo.test.ts    # run one test file
bun test --coverage tests/    # unit tests with lcov coverage

bun run dev                   # start with file watching
bun run start                 # production start
bun run validate:config       # validate clients.yml + users.yml without starting

bun run clients:set-secret <clientId>   # encrypt and write a client secret
bun run users:set-password <email>      # encrypt and write a user password
bun run users:set-totp-seed <email>     # encrypt and write a TOTP seed
```

Run `bun test` before every commit. The full suite takes ~2 seconds.

---

## Source map

| File | Role |
|---|---|
| `src/index.ts` | Production entry point — loads config, calls `createApp()` |
| `src/router.ts` | All OIDC endpoints (Hono app factory); import as `createApp()` in tests |
| `src/tokens.ts` | JWT issuance and verification (session, auth code, ID/access/refresh tokens) |
| `src/users.ts` | Load and decrypt `users.yml`; password verify; `rolesForClient()` |
| `src/clients.ts` | Load and decrypt `clients.yml` |
| `src/crypto.ts` | AES-256-GCM encrypt/decrypt for `enc:...` YAML values |
| `src/keys.ts` | ES256 signing key management; `resetKeysForTest()` for test isolation |
| `src/startup-checks.ts` | Environment variable validation (`NYX_SECRET`, `NYX_URL`) |
| `src/validate.ts` | Config validation (`validateClients`, `validateUsers`, `validateClaimKey`) |
| `src/pkce.ts` | PKCE S256 helpers |
| `src/pages.ts` | Login/TOTP HTML pages |

Tests live in `tests/`, one file per source module. Each test file references the GitHub issue(s) that motivated it in a comment near the relevant describe/it block.

---

## Architecture constraints

**Stateless.** No database, no cache, no session store. All state lives in signed JWTs. Do not introduce any in-process state that persists across requests.

**Config-first.** Users and clients are loaded once at startup from YAML files. There is no runtime provisioning API. Secrets are stored as `enc:...` values (AES-256-GCM via PBKDF2 from `NYX_SECRET`).

**No revocation.** Tokens are valid until they expire. This is a deliberate trade-off documented in `PRINCIPLES.md`.

---

## Key conventions

### NYX_SECRET format

`NYX_SECRET` must be a base64-encoded string that decodes to **exactly 32 bytes**. Generate one with:

```bash
openssl rand -base64 32
```

The startup check (`src/startup-checks.ts`) validates this and exits with a clear error if it fails. Do not use a plain string.

### CI config (`clients.ci.yml`, `users.ci.yml`, `.vela.yml`)

If you ever change `NYX_SECRET` in `.vela.yml`, you **must** re-encrypt every `enc:...` value in `clients.ci.yml` and `users.ci.yml` with the new key. The plaintext values are documented in comments above each field.

Current CI secret key string: `ci-nyx-auth-test-secret-key-2026` (base64: `Y2ktbnl4LWF1dGgtdGVzdC1zZWNyZXQta2V5LTIwMjY=`)

### Tests

- Router tests call `createApp(clients, users)` directly with in-memory fixture maps — no config files, no real crypto keys loaded from disk.
- `resetKeysForTest()` from `src/keys.ts` clears the cached signing key between test suites.
- No mocking of crypto primitives or JWT signing. Tests use real ES256 keys generated ephemerally.
- The TOTP window tolerance is 4 (±4 × 30 s = ±2 min). TOTP tests that need a previous or next period use `generate({ secret, timestamp: Date.now() ± 30_000 })` from `otplib`.

### Validation

- **Environment checks** go in `src/startup-checks.ts` (`validateEnvironment()`).
- **Config checks** (clients, users) go in `src/validate.ts` (`validateClients()` / `validateUsers()`).
- URI-style custom claim keys must use kebab-case path components. `validateClaimKey()` is exported from `validate.ts` and called inside `validateUsers()`.
- When `NODE_ENV=production`, `http://` redirect URIs are rejected unless the host is a loopback address (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`).

### Branching and PRs

- Feature/fix branches cut from the current release branch (e.g. `release-1.3`), not `main`.
- One branch per issue, one PR per branch.
- After all issue PRs are merged to the release branch, open a docs reconciliation PR (`docs/release-X.Y-reconciliation`) before opening the release → `main` PR.
- CI must pass before merging any PR.

### Issue references in tests

When a test was written to close or cover a GitHub issue, add a comment near the test:

```typescript
// Ref: https://github.com/zapplebee/nyx-auth/issues/21
```

---

## CI pipeline (Vela)

The pipeline in `.vela.yml` runs:

1. **wait-for-services** — waits for `nyx-auth`, `test-app`, and `cookie-test-app` containers to be ready
2. **unit-test** — `bun test --coverage tests/`
3. **cypress** — full E2E browser flow via `test-app` (SPA login with PKCE)
4. **cypress-cookie** — cookie-session flow via `cookie-test-app`
5. **merge-coverage** + **upload-artifacts** — always runs; uploads coverage HTML and Cypress videos to MinIO

If the `nyx-auth` service never starts, all downstream steps are killed. The most common cause is a bad `NYX_SECRET` or a config validation error — check the `nyx-auth` container logs first.

Coverage and Cypress recordings are available at:
`https://bucket.prettybird.zapplebee.online/cypress-videos/<build-number>/`
