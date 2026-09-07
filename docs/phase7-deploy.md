# Phase 7 — Infrastructure & Deployment (Execution Guide)

> **Branch:** `feat/phase7-deploy`
> **Plan reference:** `PLAN.md` §6 Phase 7
> **Specs to update:** `specifications/0008-deployment.md` (this phase is its own spec)
>
> This document is the shared context for any agent working on Phase 7.
> Read the whole thing before writing code.

---

## 1. Goal & Gate

**Goal:** Deploy to production. The game is accessible at a public URL and
players on different machines can connect.

**Gate (from PLAN.md):** 8 players from different machines connect and play a
full match without crashes.

Per AGENTS.md, this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green.

**Confirmed decisions (from the owner):**

| Topic | Decision |
|---|---|
| Target | VPS + Docker Compose (single VM, one `docker compose up`) |
| Web | Nginx container: static build + reverse proxy on one public port |
| Hostname | Raw IP for MVP → HTTPS/TLS deferred until a domain is added |
| Database | Postgres for persisted player profiles |
| Presence | Redis (`@colyseus/redis-presence`) when `REDIS_URL` set |
| Sentry | Server-side opt-in via `SENTRY_DSN` |
| CI/CD | ci.yml stays; new Docker build job + guarded `deploy.yml` |

---

## 2. Current State (on `main` after Phase 6)

- **Web** (`apps/web`): Vite + React static build. `VITE_API_URL` read in
  `src/settings/api.ts`, but **`GameSocket.ts` hardcodes `ws://localhost:2567`**
  → deploy blocker, must use `VITE_SERVER_URL`.
- **API** (`apps/api/src/index.ts`): Fastify, no DB (LRU in-memory profile
  store), `ALLOWED_ORIGINS`/`JWT_SECRET` from env, `/health` route.
- **Game server** (`apps/game-server`): Colyseus `tdm` room, no HTTP health
  endpoint, no Redis presence. `config.ts` already enforces production safety
  (`JWT_SECRET` required, `REQUIRE_AUTH` default on, test room options off).
- **CI** only (`.github/workflows/ci.yml`). No Docker, compose, nginx, TLS,
  migrations, monitoring, or load tooling.

---

## 3. Inventory of shipped infra (file map)

| Concern | Files |
|---|---|
| Spec | `specifications/0008-deployment.md` |
| Client server URL | `apps/web/src/game/networking/GameSocket.ts` |
| Postgres profile store | `apps/api/src/db.ts`, `apps/api/src/migrate.ts`, `apps/api/migrations/*.sql` |
| API wired to store | `apps/api/src/index.ts` |
| Game health + Redis | `apps/game-server/src/index.ts`, `apps/game-server/src/config.ts` |
| Images | `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/game-server/Dockerfile`, sibling `.dockerignore`s, root `.dockerignore` |
| Edge + proxy | `docker/nginx.conf`, `docker/healthcheck` helpers |
| Stack | `docker-compose.yml` + `.env.example` (compose vars) |
| CI/CD | `.github/workflows/ci.yml` (add docker-build job), `.github/workflows/deploy.yml` |
| Load test | `apps/web/scripts/load-test.cjs`; root script `test:load` |
| Runbook | this guide §8 |

---

## 4. Design

### 4.1 Request path (production)

```
browser ─ http :80 (nginx) ── /             → static web build (SPA fallback)
                              /api/*        → api:4000           (proxy_pass, strip prefix)
                              /ws           → game-server:2567  (Upgrade headers)
```

WebSocket upgrade through nginx requires `proxy_set_header Upgrade`/`Connection
"upgrade"` — without it Colyseus immediately drops connections.

### 4.2 Client URL resolution

`GameSocket.ts` replaces the literal with:

```ts
const VITE_SERVER_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
```

Production compose passes `VITE_SERVER_URL=ws://<PUBLIC_HOST>/ws`. Dev and the
integration harness keep the `localhost` default. No wire/protocol change.

### 4.3 Profile persistence

- `profiles(sub TEXT PRIMARY KEY, sensitivity..., volume..., crosshair_color...)`.
- `migrate.ts`: tiny versioned runner — applies `.sql` files in order, records
  applied versions in `schema_migrations`, idempotent, ran at API boot.
- `db.ts`: `createProfileStore()` returns `{ get, put }` backed by `pg.Pool`
  when `DATABASE_URL` is set, else the existing LRU map. `index.ts` selects the
  store once at boot — the HTTP surface is untouched.
- `GET /profile/settings` reads the store (defaults when absent); `PUT` upserts
  then returns the merged value (same validation schema as today).

### 4.4 Game server extras

- **`GET /healthz`**: Colyseus `Server` can be fed an existing `http.Server`
  (via `server` option). We mount a tiny route on that raw server before
  handing it to Colyseus: `{"status":"ok","uptime":<sec>}`.
- **Redis presence**: `REDIS_URL` → `new RedisPresence(...)` passed to
  `new Server({ presence })`; unset keeps default in-memory. `@colyseus/redis-presence`
  is a runtime dep of the game-server. Errors surface at boot (fail fast).

### 4.5 Docker

All images use a Node 22 base, `pnpm` from `corepack`/`pnpm/action-setup`
equivalent, and the **monorepo** context (the repo root is the build context so
workspace deps resolve). Each app Dockerfile:

1. Builder stage: `pnpm install --frozen-lockfile` (offline-ish → `--prefer-offline`),
   `pnpm build` filtered to the app + its workspace deps (turbo outputs).
2. Runtime stage: `pnpm install --prod` of just the app (or copy
   `node_modules`/dist). Apps run as CJS (`node dist`).
3. Non-root user; `NODE_ENV=production`.

`.dockerignore` excludes `node_modules`, `dist`, `.turbo`, logs — per-package
and a root one so the monorepo context stays lean.

**Nginx** (`docker/nginx.conf`): single `server` on `80`; `location /` serves
`/usr/share/nginx/html` with `try_files $uri /index.html`; `location /api/`
proxies to `http://api:4000/` (strips the prefix); `location /ws` proxies with
Upgrade headers to `http://game-server:2567`. `client_max_body_size` small;
gzip on for static assets.

**Compose** (`docker-compose.yml`):

| service | build | exposes | healthcheck |
|---|---|---|---|
| `web` | `apps/web` (Dockerfile) | `80` (published) | nginx `nginx -t`-style via wget on index |
| `api` | `apps/api` | none (internal) | `node -e fetch http://localhost:4000/health` |
| `game-server` | `apps/game-server` | none | `node -e fetch http://localhost:2567/healthz` |
| `postgres` | `postgres:17-alpine` | none | `pg_isready` |
| `redis` | `redis:7-alpine` | none | `redis-cli ping` |

Env flows: a **compose `.env`** (gitignored, template in `.env.example.deploy`)
with `PUBLIC_HOST`, `JWT_SECRET`, DB creds, `REQUIRE_AUTH=1`, and `POSTGRES_*`/
`REDIS` defaults wired into service env + API `build.args` (VITE vars). The
public port is `80` on the raw IP → players use `http://<PUBLIC_HOST>`.

### 4.6 CI/CD

- **ci.yml** gains a `docker-build` job: `docker compose build` (buildkit) on the
  PR (cached) so every merge candidate is provably image-buildable. Uses
  `docker/setup-buildx-action` + `docker/metadata-action`.
- **deploy.yml** (workflow_dispatch + on push to main): SSH into the VPS
  (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` secrets) → `git pull --ff-only`,
  `docker compose -f docker-compose.yml pull && up -d --build`, healthcheck
  poll. **Inert until secrets are set** (fail-safe guard step).

### 4.7 Monitoring & Sentry

- Health routes + Compose healthchecks (§4.5) = basic uptime.
- Sentry: `@sentry/node` in api + game-server, `Sentry.init` guarded by
  `SENTRY_DSN` presence; Fastify error handler attached when enabled. Inert
  without a DSN; a web Sentry pass needs a DSN at build time and is deferred.

### 4.8 Load test

`apps/web/scripts/load-test.cjs` (reuses colyseus.js + jsonwebtoken already in
web deps): `--players 8|16|24`, `--url ws://…/ws`, `--token <jwt>` (or mint
from the API), connect all, signal movement inputs for a few seconds, report
success/failure counts and per-client connect/move. Root script
`test:load` = `node apps/web/scripts/load-test.cjs`.

---

## 5. Production security posture (unchanged intent, now enforced at deploy)

- `NODE_ENV=production` + missing `JWT_SECRET` → api/game-server **refuse to
  start** (existing `config.ts` + API boot logic).
- `REQUIRE_AUTH=1` in compose → tokenless joins rejected.
- `ALLOW_TEST_ROOM_OPTIONS` stays `0` in prod.
- `ALLOWED_ORIGINS=http://<PUBLIC_HOST>` scopes CORS to the deployment origin.
- Postgres/Redis are **internal** (no published ports in compose).
- DB credentials via env only; `POSTGRES_PASSWORD` from the compose `.env`.

---

## 6. What NOT to do (guardrails)

- ❌ No protocol/wire changes — client URL resolution and profile storage are
  internal; the `tdm` room wire stays as spec `0003`/`0005`/`0006`/`0007`.
- ❌ No client-side auth bypass or anti-cheat relaxation.
- ❌ Don't commit real secrets — compose `.env` is gitignored; only templates
  land in the repo.
- ❌ Don't swap physics / collision — nothing gameplay-related in this phase.
- ❌ Don't add ORM framework weight — the hand-rolled migration runner + `pg`
  is enough for two tables; revisit only if schema grows.
- ❌ Don't publish DB/Redis ports, don't bind api/game-server to the VM's public
  interface directly — the single nginx `80` is the only ingress.

---

## 7. Verification (before PR)

- [ ] `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm build`, `pnpm test:unit`
- [ ] `pnpm test:integration` (dev-mode paths unchanged — profile store falls
      back to in-memory without DATABASE_URL)
- [ ] New unit tests: migration runner order/idempotency (mock pool), profile
      store parity (in-memory), config guards (Redis URL parse / healthz payload)
- [ ] `docker compose build` — all images build on the dev box
- [ ] `docker compose up` local stack: all healthchecks green;
      `curl http://localhost/health`, `/healthz`; two `colyseus.js` clients join
      the proxied `/ws` through nginx
- [ ] `apps/web/scripts/load-test.cjs --players 24` against the local stack

## 8. Runbook — deploying to the VPS

1. **Requisites:** a VPS (≥2 vCPU / 2 GB RAM), Docker Engine + Compose plugin,
   `git`. A DNS name is recommended but not required for the MVP (raw IP).
2. **On the repo host:** `gh repo sync` etc. → push a `v7` tag / merge
   `feat/phase7-deploy` to `main`.
3. **On the VPS:**
   ```bash
   git clone https://github.com/HASSANFARYAD/deashot.git && cd deashot
   cp .env.example.deploy .env     # fill in JWT_SECRET, PUBLIC_HOST, DB password
   openssl rand -hex 32            # → JWT_SECRET
   docker compose up -d --build
   docker compose ps               # all healthy?
   curl http://localhost/health && curl http://localhost/healthz
   ```
4. **Gate:** 8 players from 8 machines → `http://<PUBLIC_HOST>` (guest login,
   Quick Play), play a 10-minute TDM to `KILL_LIMIT` with no crashes.
5. If the repo deploy is desired: set `VPS_*` secrets → run `deploy.yml`
   (workflow_dispatch) on `main`.

## 9. Follow-ups (explicitly out of scope for this milestone)

- **TLS/HTTPS** once a domain exists (Cloudflare proxy or certbot; nginx SSL
  server block). Browsers without it run http/ws fine today.
- Vertical scaling beyond one VM, multiple game-server instances with Redis
  presence (the wiring is in place but untested across hosts).
- Web-side Sentry (needs a release DSN at build time).
- WSS behind TLS, domain-rate limiting, geo placement.