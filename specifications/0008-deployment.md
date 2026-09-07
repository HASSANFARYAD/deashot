# 0008 — Deployment & Infrastructure

**Status:** Accepted | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

Phase 7 makes Deashot reachable by real players outside a single machine: the
game is served from a public URL so several players on different machines can
connect and play a full match. Everything in phases 0–6 runs on a developer box
(`localhost`); this spec turns the same monorepo into a deployable system.

**Goal (from PLAN.md):** Deploy to production. Accessible via public URL.
**Gate:** 8 players from different machines connect and play a full match
without crashes.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Deployment target | VPS + Docker Compose (single VM, `docker compose up`) |
| Web hosting | Nginx container serving the static Vite build + reverse proxy |
| Public hostname | Raw IP for MVP; HTTPS/TLS deferred until a domain is added |
| Database | PostgreSQL for persisted player profiles (`pg`, hand-rolled migration runner) |
| Presence | Redis via `@colyseus/redis-presence` when `REDIS_URL` is set (single-instance falls back to in-memory) |
| Auth posture | Unchanged from Phase 5 (`REQUIRE_AUTH` on in prod, `JWT_SECRET` required) |
| Error tracking | Sentry, opt-in via `SENTRY_DSN` (server-side only for MVP) |
| Monitoring | Health endpoints (/health, /healthz) + Compose healthchecks + uptime |

## Architecture

```
 player browser
      │  http (static + /api proxied)     ws (/ws proxied, Upgrade)
      ▼
   Nginx "web" container (port 80)
      │  /api/* → api:4000       /ws → game-server:2567
      ▼
   api (Fastify, :4000)          game-server (Colyseus, :2567)
      │                                │
   Postgres (profiles)            Redis (optional presence)
```

## Topology changes vs phases 0–6

### 1. Web is a static build behind Nginx
- Vite build in a multi-stage Dockerfile; Nginx serves the assets with SPA
  fallback and proxies `/api/*` and `/ws`.
- The build is parameterised at image build time via Vite env vars:
  - `VITE_API_URL` — origin-relative `/api` in production.
  - `VITE_SERVER_URL` — `ws://<public-host>/ws` in production.
- Client no longer hardcodes `ws://localhost:2567`: `GameSocket` resolves the
  server URL from `VITE_SERVER_URL`, defaulting to `ws://localhost:2567` for dev
  and localhost integrations.

### 2. API persists profiles to Postgres
- New `profiles` table (keyed by JWT `sub`) replaces the process-local LRU map.
- A tiny migration runner applies versioned `.sql` files at API startup
  (idempotent, tracked in a `schema_migrations` table).
- In-memory LRU behaviour remains as the **fallback when `DATABASE_URL` is
  unset** (dev, unit tests, integration harness) so nothing else in the repo
  depends on a database being present.
- API shape (`/auth/guest`, `GET|PUT /profile/settings`, `/health`) is unchanged.

### 3. Game server reports health and supports optional Redis
- New `GET /healthz` on the game server HTTP layer: `{"status":"ok","uptime":…}`
  for Compose healthchecks.
- When `REDIS_URL` is present, Colyseus uses `RedisPresence`; otherwise the
  default in-memory presence.

### 4. One Compose stack, single public port
- Services: `web` (nginx, `80` only), `api` (:4000), `game-server` (:2567),
  `postgres` (:5432, internal), `redis` (:6379, internal).
- All secrets/config via environment (`JWT_SECRET`, `REQUIRE_AUTH`,
  `PUBLIC_HOST`, database credentials) — none committed.

### 5. CI/CD
- Existing `ci.yml` (lint → typecheck → build → unit → integration) stays.
- Docker images are built and their configuration validated by a `docker-build`
  job.
- A separate `deploy.yml` (SSH to the VPS, `docker compose pull && up -d`) runs
  on `main`; it is inert until the `VPS_*` repository secrets are configured.

### 6. Load / capacity
- `load-test.cjs` spins up 8/16/24 synthetic Colyseus clients against a
  deployed room and reports join + movement success rates.

## TLS note
TLS is out of scope for the raw-IP milestone (browsers will use http/ws).
When a domain is added, terminate TLS either at Cloudflare (proxy) or with
certbot; the Nginx server block is structured so an SSL server block can be
added without touching the upstreams.

## Acceptance criteria

- [ ] `docker compose up` on a clean VPS exposes the game at `http://<ip>`.
- [ ] Two browsers on different machines join the same room and move with no
      rubber-banding.
- [ ] `GET/PUT /profile/settings` survive an API restart (stored in Postgres).
- [ ] Game server answers `GET /healthz`; API answers `GET /health`.
- [ ] All Compose services pass their healthchecks; stack survives restarts.
- [ ] `JWT_SECRET` set + `NODE_ENV=production` → both services refuse to start
      without it.
- [ ] 24 concurrent synthetic players connect and move in load testing.
- [ ] Gate: 8 real players from 8 different machines complete a full match.

## Changelog
- v1.0 — Accepted; initial deployment architecture (raw IP, Compose, nginx,
  Postgres profiles, Redis presence, health, Sentry opt-in, CI/CD, load test).