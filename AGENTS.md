# AGENTS.md — Rules for deashot

## Project overview

A server-authoritative browser FPS (Deadshot.io-style) being developed in strict phases.
Every phase must pass its gate in `PLAN.md` before the next phase begins.

## End goal

8-player Team Deathmatch, 1 map, 1 assault rifle (hitscan), 60 FPS client,
server-authoritative simulation, leaderboard, and a polished public launch.

Phases 0–1 are complete (monorepo foundation + offline FPS sandbox).
Phase 2 (multiplayer movement) is next.

## Game rules (gameplay)

- **Mode:** Team Deathmatch. Two teams (blue/red). First to `KILL_LIMIT` (50) wins.
- **Match length:** 10 minutes (`MATCH_DURATION`). If no team reaches the limit, the higher score wins.
- **Spawning:** Players spawn at team-specific locations. On death, respawn after `RESPAWN_DELAY`.
- **Weapon:** Assault rifle. 30-round magazine, 2.1s reload, 600 RPM, 25 damage (2x headshot).
- **Movement:** 6.5 m/s base speed, 4.8 m/s jump velocity, gravity –14. ADS slows to 65%.
- **Health:** 100 HP. Damage is hitscan. Headshots detected by angle (dot product > 0.85).
- **Server is authoritative.** Client sends inputs, server simulates, snapshots reconcile state.
- See `packages/game-config` and `packages/shared` for the source of truth on all tuning values.

## Spec-first workflow

**Every code change must reference a specification in `specifications/`.**

- Before writing new code, find or create the relevant spec.
- Update the spec version/changelog when behavior changes.
- PR descriptions must link to the spec(s) they implement or modify.
- Specs go through: `Proposed → Accepted → Implemented → Changed` (see `specifications/README.md`).

## Branching strategy

- `main` — protected, always deployable, reflects current `Implemented` specs.
- Feature branches: `feat/<phase>-<short-slug>` (e.g. `feat/phase2-multiplayer-movement`).
- Branch naming:
  - `feat/` — new features or phases
  - `fix/` — bug fixes
  - `chore/` — tooling, config, non-functional changes
  - `docs/` — documentation or spec updates
  - `test/` — test additions or fixes
  - `perf/` — performance improvements
- Each `PLAN.md` phase maps to one feature branch; the phase branch merges to `main` when its gate passes.

## Merging strategy

1. **PR required.** No direct pushes to `main`.
2. **CI must pass** (typecheck, build, unit tests, integration test).
3. **Specs updated.** Any behavior/interface change requires a matching spec update in the same PR.
4. **Squash merge** to keep `main` history clean and readable.
5. **Semantic commits:** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `perf:`.
6. **At least 1 review** before merge (for team; solo work follows the same PR discipline for traceability).

## Test cases (written)

All tests live alongside source in `*.test.ts` files and run via `vitest`.

### Unit tests (`pnpm test:unit`)

| Package | File | Tests |
|---|---|---|
| `@deashot/math` | `src/math.test.ts` | clamp, lerp, length3, normalizeAngle (incl. non-finite and large-magnitude input), lookVectorFromYawPitch |
| `@deashot/shared` | `src/protocol.test.ts` | PlayerInput JSON round-trip, default shape, match constant sanity |
| `@deashot/game-config` | `src/config.test.ts` | ASSAULT_RIFLE stats validity, weapon lookup, player physics sanity |

### Integration tests (`pnpm test:integration`)

| Test | What it does |
|---|---|
| `scripts/test-colyseus.cjs` | Two Colyseus clients join the same room, verify player count ≥ 2 |
| `apps/web/scripts/test-combat.cjs` | Two clients: one shoots the other, verifies server-authoritative damage, death, respawn (Phase 3) |
| `apps/web/scripts/test-match-end.cjs` | Two clients plus a fast kill-limit room: verifies win-by-kill-limit, match end, winner + accurate scores (Phase 4) |
| `apps/web/scripts/test-warmup.cjs` | A room holds in warmup at 1 player, then countdowns to in-progress at 2 (Phase 5) |
| `apps/web/scripts/test-shot-validation.cjs` | A fires at B with a spoofed facing and a spoofed muzzle origin: both must deal zero damage, while an honest shot must still land (anti-cheat, audit P0-1) |
| `apps/web/scripts/test-auth-hardening.cjs` | Starts its own server with the test escape hatches off: tokenless and forged joins rejected, valid token trusted, client-supplied room tuning ignored (audit P0-4, P0-5) |
| `apps/web/scripts/test-browser-gate.cjs` | Two browser tabs, guest login via API, join, see each other, movement syncs (Phase 2+5, Playwright) |

Phases reference their specs and execution guides: Phase 3 → `specifications/0005-combat.md`
+ `docs/phase3-combat.md`; Phase 4 → `specifications/0006-team-deathmatch.md`
+ `docs/phase4-tdm.md`; Phase 5 → `specifications/0007-lobby-match-flow.md`
+ `docs/phase5-lobby.md`.

### Manual smoke checklist (pre-merge for web changes)

- [ ] `pnpm dev:web` → http://localhost:5173
- [ ] Click to lock pointer, WASD movement works, mouse look works
- [ ] Right-click zooms (ADS), slows movement, gun centers
- [ ] Left-click fires, tracer visible to impact point
- [ ] R reloads, ammo counter updates, auto-reload at 0
- [ ] Space jumps, gravity pulls down, collision with walls/floor
- [ ] Esc unlocks pointer, overlay reappears

## CI pipeline (GitHub Actions)

Defined in `.github/workflows/ci.yml`. Runs on every push to `main` and every PR to `main`.

```
install → lint → typecheck → build → unit tests → integration test
```

| Step | Command | Purpose |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | Reproducible deps |
| Lint | `pnpm lint` | ESLint flat config across the whole monorepo |
| Typecheck | `pnpm typecheck` | Catch type errors early |
| Build | `pnpm build` | Compile all packages + apps |
| Unit tests | `pnpm test:unit` | Math, protocol, config correctness |
| Integration | `pnpm test:integration` | Game server starts, two clients join same room |

Concurrency is enabled: only one CI run per branch at a time; earlier runs cancel.

## Code conventions

- TypeScript strict mode everywhere. No `any` unless unavoidable (document why).
- Monorepo packages compile dual ESM + CJS. Game server and API run as CJS via `node dist`.
- Three.js: use `Euler(..., "YXZ")` for FPS cameras. Forward is `(-sin(yaw), -cos(yaw))`.
- New constants go in `packages/game-config` (player/weapons) or `packages/shared` (protocol).
- Lint config is a single flat `eslint.config.mjs` at the repo root covering every
  workspace; `pnpm lint` runs it in one pass. Type-aware rules are deliberately off
  because `pnpm typecheck` already runs `tsc --noEmit` over every package.
- Never use the global `isFinite`/`isNaN` — they coerce their argument, so
  `isFinite("5")` is `true`. Use `Number.isFinite`/`Number.isNaN` (lint-enforced).
- React components: functional only, TypeScript props interfaces, no comments unless non-obvious.
- Formatting: 2-space indent, no semicolons enforced by editor (consistent across files).

## Asset policy

- MVP uses colored boxes and geometric primitives only.
- No placeholder URLs or external asset imports in committed code.
- Any asset additions require explicit approval before merge.

## Secrets and environment

- `.env` is gitignored. `.env.example` is committed as a template.
- Never commit API keys, tokens, or database URLs.
- Colyseus `authToken` and JWT `SECRET` are set via environment variables at runtime only.
- `JWT_SECRET` is shared by the API (signs guest tokens) and the game server
  (verifies them). Both fall back to a development literal outside production
  and **refuse to start** when `NODE_ENV=production` without it — that literal
  is public in this repo, so any deploy using it accepts forged tokens.
- Escape hatches that weaken the trust boundary are opt-in, off by default, and
  forced off in production: `REQUIRE_AUTH=0` (allow tokenless joins) and
  `ALLOW_TEST_ROOM_OPTIONS=1` (honour client-supplied match tuning). Only the
  integration harness sets them. See `apps/game-server/src/config.ts`.