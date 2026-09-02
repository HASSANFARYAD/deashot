# 0002 — Architecture

**Status:** Implemented | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

Deashot is a TypeScript monorepo managed by pnpm workspaces + Turborepo.
The server is authoritative: all game simulation runs on the server, clients
receive authoritative snapshots and reconcile state.

## Repository layout

```
/
├── apps/
│   ├── web/            # Browser client (Three.js, React, Vite)
│   ├── game-server/    # Colyseus 0.15 authoritative server
│   └── api/            # Fastify REST API (auth, health)
├── packages/
│   ├── shared/         # Protocol types (PlayerInput, state schemas, constants)
│   ├── game-config/    # Weapon + player physics tuning (source of truth)
│   └── math/           # Pure math helpers (clamp, lerp, normalizeAngle)
├── scripts/            # Dev/CI scripts (integration runner, fixup)
├── specifications/     # Behavioural specs (this folder)
└── PLAN.md             # Phase plan and gate criteria
```

## Package management

- pnpm 11 workspaces (`pnpm-workspace.yaml`)
- Turborepo orchestrates dev/build/typecheck/test across packages
- `onlyBuiltDependencies: [esbuild, msgpackr-extract]` configured in `pnpm-workspace.yaml`

## Dual-build (ESM + CJS)

`packages/*` compile to **both**:
- `dist/esm/` — ESNext + bundler resolution (consumed by Vite/web via the `import` condition)
- `dist/cjs/` — CommonJS + node10 resolution (consumed by Node apps via the `require` condition)

A nested `dist/esm/package.json` (`"type": "module"`) and `dist/cjs/package.json`
(`"type": "commonjs"`) ensure Node interprets each output correctly regardless of
the package root's `type` field. `scripts/fix-package-type.mjs` writes these files
as a post-build step.

Each package.json exposes `exports` with `import` and `require` conditions pointing
to the respective `.d.ts` and `.js` in each dist folder.

## Applications

| App | Runtime | Port | Notes |
|---|---|---|---|
| `web` | Vite (browser) | 5173 | React + Three.js, `/ws` proxy to 2567 |
| `game-server` | Node CJS (`node dist/index.js`) | 2567 | Colyseus 0.15, 60 Hz sim |
| `api` | Node CJS (`node dist/index.js`) | 4000 | Fastify, guest JWT, /health |

Game-server and API are CommonJS (no `"type": "module"` in their package.json)
so `colyseus` named imports resolve via its CJS `main` field at runtime.

## Colyseus 0.15 server

```ts
const server = new Server();
server.define("tdm", TeamDeathmatchRoom);
server.listen(2567);
```

Room state uses `@colyseus/schema` `Schema` + `MapSchema` with decorators
(`experimentalDecorators: true`, `useDefineForClassFields: false`).
Simulation runs at 60 Hz via `setSimulationInterval`. Clients send `"input"`
messages; server broadcasts `PlayerState` snapshots at 20 Hz.

## Client architecture

`GameEngine` drives the main loop via `requestAnimationFrame`. Each frame:

1. `InputManager.poll()` — reads accumulated keyboard + pointer state
2. `FPSCamera.handleInput()` — applies mouse look (yaw/pitch)
3. `FPSCamera.updateAim()` — smooths FOV toward ADS value
4. `PlayerController.update()` — integrates WASD movement with physics
5. `Weapon.update()` — fire rate, hitscan ray, muzzle position, ADS gun position
6. `Effects.update()` — particle lifetime management
7. `renderer.render()` — Three.js render pass

The camera uses Euler order `"YXZ"`. Camera forward (horizontal) is
`(-sin(yaw), -cos(yaw))`, which matches the standard three.js right-hand
FPS convention.

## Test infrastructure

- **Unit tests:** `vitest` in `packages/{math,shared,game-config}/src/*.test.ts`
- **Integration:** `scripts/run-integration.cjs` starts the game server, runs
  `apps/web/scripts/test-colyseus.cjs` (two Colyseus clients join same room),
  asserts player count ≥ 2 and same room ID
- **CI:** GitHub Actions runs `typecheck → build → test:unit → test:integration`

## Type model (current)

All shared types live in `packages/shared/src/protocol/`. Interfaces are plain
TypeScript (no runtime dependency on `@colyseus/schema` for the wire format).
`@colyseus/schema` decorators are only used in the game-server for room state.

---

**Changelog**

- v1.0 — Initial spec (Phase 0 + 1 architecture)