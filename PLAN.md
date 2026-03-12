# nyx-auth — next session plan

## Where we are

All infrastructure is live on nyx:
- **Traefik** — ingress + TLS (`nyx-docker/docker-compose.yml`)
- **Vela** — CI/CD, building and pushing to Harbor (`nyx-docker/docker-compose.vela.yml`)
- **Harbor** — container registry at `harbor.prettybird.zapplebee.online`
- **nyx-entrypoint** — aurora landing page at `prettybird.zapplebee.online`
- **nyx-auth** — OIDC IDP built and tested locally, **not yet deployed**

## Step 1 — Deploy nyx-auth

Create `nyx-docker/docker-compose.auth.yml`:

```yaml
services:
  auth:
    image: harbor.prettybird.zapplebee.online/library/nyx-auth:latest
    container_name: nyx-auth
    restart: unless-stopped
    env_file: auth.env
    volumes:
      - nyx_auth_data:/app/data
      - /home/zac/github.com/zapplebee/nyx-auth/clients.yml:/app/clients.yml:ro
    networks: [nyx_svc_auth]
    labels:
      - traefik.enable=true
      - traefik.docker.network=nyx_svc_auth
      - traefik.http.routers.nyx-auth.rule=Host(`auth.prettybird.zapplebee.online`)
      - traefik.http.routers.nyx-auth.entrypoints=websecure
      - traefik.http.routers.nyx-auth.tls=true
      - traefik.http.routers.nyx-auth.tls.certresolver=le
      - traefik.http.routers.nyx-auth.priority=10
      - traefik.http.services.nyx-auth.loadbalancer.server.port=3000

volumes:
  nyx_auth_data:

networks:
  nyx_svc_auth:
    external: true
    name: nyx_svc_auth
```

Also needed:
- Add `nyx_svc_auth` network + DNS aliases to `docker-compose.yml` (control plane)
- Add fallback router for `auth.prettybird.zapplebee.online` to `fallback` service
- Add `auth.env` (from `.env.example`) — secrets go here, not in compose file
- Add a Vela pipeline to `nyx-auth` to build + push to Harbor on every push (same pattern as `velatest`)

## Step 2 — Wire nyx-entrypoint to nyx-auth

The aurora landing page at `prettybird.zapplebee.online` is currently public. Add authentication:

1. Register `nyx-entrypoint` as a client in `clients.yml` with a redirect URL
2. In `nyx-entrypoint/server.ts`, implement the OIDC callback route and session middleware using `better-auth` client
3. Protect routes that should require login
4. The entrypoint is the logical "home" for nyx — a logged-in dashboard view of running services

## Step 3 — Build something real with nyx-auth

The IDP exists to support a real app. Candidate: a simple internal app that uses nyx-auth for SSO and the role system for access control. Ideas:

- **nyx-dashboard** — admin view of nyx services, system stats, CI builds. Roles: `admin` only.
- **notes / paste** — simple internal notes/pastebin. Roles: `user`, `admin`.

The `getAdditionalUserInfoClaim` role filtering in `nyx-auth` means each client sees only the roles it declares — use this to restrict admin tools to `admin` role users at the IDP level.

## Step 4 — Secrets hygiene

Currently `BETTER_AUTH_SECRET`, `ADMIN_API_KEY`, and client secrets are managed manually. Consider:

- Moving all nyx secrets into a single encrypted store (e.g. `age`-encrypted file committed to `nyx-docker`)
- Or using Vela's native secret store to inject secrets into the auth container at deploy time

## Notes

- `clients.yml` is mounted read-only into the container — adding a new client requires editing the file on the host and restarting the container (or a Vela deploy)
- `data/auth.db` persists in a named Docker volume — back it up before major changes
- The `db:migrate` script must be run manually after upgrading Better Auth or changing the schema; consider a migration init container
- The `auth` export in `src/auth.ts` is a stub for the Better Auth CLI — it is not used at runtime
