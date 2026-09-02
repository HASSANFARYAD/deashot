# Deashot.io

A server-authoritative browser FPS (Deadshot.io-style) being built in phases. Playable sandbox MVP with an offline shooting range, plus a Colyseus powering the game server foundation for multiplayer.

## Status

- **Phase 0 (Foundation)** — done: monorepo, shared protocol types, game server, API, Docker.
- **Phase 1 (FPS Sandbox)** — done: three.js FPS with movement, shooting, ADS zoom, HUD.
- **Phase 2 (Multiplayer Movement)** — next.

## Stack

- **Web:** React 19, Three.js, Vite, TypeScript — `apps/web`
- **Game server:** Colyseus 0.15 (WebSocket, 60 Hz simulation) — `apps/game-server`
- **API:** Fastify (auth/guest) — `apps/api`
- **Shared packages:** `@deashot/shared` (protocol), `@deashot/game-config` (weapons/physics), `@deashot/math`
- **Tooling:** pnpm 11 + Turborepo, dual ESM/CJS package builds

## Getting started

```bash
pnpm install
pnpm dev:web          # Vite dev server on http://localhost:5173
pnpm dev:server       # Colyseus game server on ws://localhost:2567
pnpm dev:api          # Fastify API on :4000
```

Click the canvas to lock the mouse, then:

| Control | Action |
|---|---|
| WASD / Space | Move / jump |
| Mouse | Look |
| Left click | Shoot (hold for auto) |
| Right click | Aim down sights (zoom) |
| R | Reload |

## Commands

```bash
pnpm build           # build all packages + apps
pnpm typecheck       # typecheck all packages + apps
pnpm lint
```

### Verify multiplayer connection

```bash
pnpm --filter web test:connect   # joins 2 Colyseus clients to the same room
```

## Project layout

```
apps/
  web/            # Browser client (Three.js + React)
  game-server/    # Colyseus authoritative server
  api/            # Fastify REST API
packages/
  shared/         # Protocol types + match constants
  game-config/    # Weapon/player tuning (client + server)
  math/           # Math helpers
```

## Roadmap

1. Mutliplayer movement (client prediction, snapshots, interpolation)
2. Combat (damage, death, respawn, kills)
3. Team Deathmatch rules + scoreboard
4. Lobby / matchmaking
5. Polish (audio, animations, map art)
6. Deployment (Docker, CI/CD)

See [PLAN.md](./PLAN.md) for the detailed phase plan and gate criteria.