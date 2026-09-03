# Phase 3 — Combat (Execution Guide)

> **Branch:** `feat/phase3-combat`
> **Plan reference:** `PLAN.md` §6 Phase 3, §5 Networking Model, §10 Anti-Cheat
> **Specs to update:** `specifications/0005-combat.md`
>
> This document is the shared context for any agent working on Phase 3.
> Read the whole thing before writing code.

---

## 1. Goal & Gate

**Goal:** Players can shoot each other, deal damage, die, and respawn — all
server-authoritative.

**Gate (from PLAN.md):** No client-side damage calculation. Server validates
everything. Feels responsive despite network latency. Deliverable: "Two players
can shoot each other, see hit markers, take damage, die, respawn. All
server-authoritative."

Per AGENTS.md, this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green.

---

## 2. Current State (what already exists, on `main` after Phase 2)

### Server (`apps/game-server`)
- `rooms/TeamDeathmatchRoom.ts` — Phase 2 server with:
  - `PlayerStateSchema` / `MatchStateSchema` (`@colyseus/schema`)
  - 60 Hz tick, camera-relative movement, `MAP_SPAWNS`/`MAP_BOUNDS`
  - Team auto-assignment, spawns, respawn
  - Handles `"input"` message (movement/rotation). **No combat yet** — `shoot`
    and `reload` booleans arrive in input but are ignored for damage.
- **No weapon state** on the server. No hit detection, damage, or kill logic.

### Shared protocol (`packages/shared`)
- `src/protocol/input.ts` — `PlayerInput` (has `shoot`/`reload` booleans).
- `src/protocol/state.ts` — `PlayerState`, `MatchState` interfaces. Note: the
  old `KillEvent`/`DamageEvent` interfaces were removed in Phase 2 (dead code).
- `src/constants.ts` — rates + limits.

### Game config (`packages/game-config`)
- `src/weapons.ts` — `ASSAULT_RIFLE` config (damage 25, headMultiplier 2, 600
  RPM, magazine 30, reload 2.1s, range 200).
- `src/player.ts` — `PLAYER_MAX_HEALTH`=100, `PLAYER_HEIGHT`=1.8,
  `PLAYER_RADIUS`=0.4, `RESPAWN_DELAY`=3.

### Web client (`apps/web`)
- `GameSocket.ts` — Phase 2 networking (sendInput, snapshot polling). No combat
  event handling yet.
- `GameEngine.ts` — online mode, prediction, reconciliation, remote players. No
  combo event wiring.
- `Weapon.ts` — client-side hitscan for **offline feel/display** (fire rate,
  ammo, reload, tracer). Its `update()` returns a `shootEvent` with
  `origin`/`point` already computed.
- `Effects.ts` — tracer, muzzle flash, hit markers (client-side only).
- `HUD.tsx` — crosshair, health bar, ammo display. No hit marker / damage
  indicator / kill feed yet.

---

## 3. Known Issues to Resolve During Phase 3

1. **Server has no weapon/combat state.** Need ammo, fire rate, reload timer,
   last fire time per player on the server.
2. **`shoot` is a held boolean in input.** The server needs a discrete `"shoot"`
   event carrying the muzzle origin + direction for accurate hitscan.
3. **Client `Weapon` is authoritative for feel.** It already enforces fire rate
   / ammo / reload locally. The server must re-validate the same rules so the
   gate ("no client-side damage calculation, server validates everything")
   holds. Server ammo/health sync through the snapshot for HUD correctness.
4. **Hitscan target geometry.** Server players are currently just schema
   points. Need capsule raycast (radius `PLAYER_RADIUS`, height `PLAYER_HEIGHT`).
5. **No hit/damage/kill events or HUD feedback.**
6. **Friendly fire** must be off (Phase 3 PLAN bullet; also matches AGENTS rules
   — Phase 4 lists friendly fire "off" but combat should not damage teammates).

---

## 4. Phase 3 Steps (in order)

### Step 3.1 — Server weapon state (schema + sim)
- Add `ammo` and `reloading` to `PlayerStateSchema` (synced via snapshot).
- Add `lastFireTime` and `reloadTimer` to `SimPlayer` (non-synced).
- Initialize ammo to `ASSAULT_RIFLE.stats.magazineSize` on join and respawn.
- Add a "shoot" message handler in `onCreate` that validates input shape.
- Process the reload timer (and refill ammo) each tick for living players.

### Step 3.2 — Shared shoot/event types
- Define `ShootEvent` (ox/oy/oz/dx/dy/dz) in `packages/shared/src/protocol/input.ts`.
- Define `HitEvent`, `KillEvent`, `DamageEvent` (server→client) in the same file
  (these were removed from `state.ts` in Phase 2 — re-add in `input.ts` and
  export from `packages/shared/src/index.ts`).

### Step 3.3 — Server hitscan + handleShoot
- On a valid `"shoot"` message: validate (alive, fire rate, ammo, not reloading),
  deduct ammo, auto-reload when empty.
- Normalize direction; raycast from muzzle origin against living **enemy**
  capsules (skip self + teammates).
- Closest hit wins; headshot if hit above `y + PLAYER_HEIGHT * 0.85`.

### Step 3.4 — Server damage / kill / death / respawn
- Apply `damage` (25) or `headMultiplier * damage` (50). Clamp health ≥ 0.
- On `health <= 0`: mark dead, set `respawnAt = now + RESPAWN_DELAY`, increment
  killer `kills` / victim `deaths`, bump team score.
- Broadcast `"hit"` (shooter), `"damage"` (victim), `"kill"` (all).
- Respawn already exists in `onTick` (full health + ammo).

### Step 3.5 — Client: GameSocket combat events
- Add `onHit` / `onKill` / `onDamage` callbacks + `room.onMessage` listeners.
- Add `sendShoot(ox,oy,oz,dx,dy,dz)` method.

### Step 3.6 — Client: wire shoot to server + combat events
- In `GameEngine`, when `Weapon.update()` returns a shoot event, call
  `socket.sendShoot(...)` with origin + normalized direction.
- Route `onHit/onKill/onDamage` from socket through to `GameCallbacks`.
- Display authoritative ammo/health/reloading in HUD from snapshot
  (`serverSelf`), rather than the local `Weapon` state, while online.

### Step 3.7 — Client UI: hit marker, damage indicator, kill feed
- Add `HitMarker`, `DamageIndicator`, `KillFeed` HUD components.
- Wire in `GamePage.tsx` via combat callbacks from `Game.ts`.

### Step 3.8 — Gate verification
- Run server + web, open two tabs, verify: shoot an enemy → hit marker; get
  shot → red damage indicator; kill → kill feed entry; death → game continues
  and respawns after 3s.
- **Verify no client-side damage:** temporarily assert the client never sends
  damage numbers (only origin+direction) — this is structural in the code.
- Extend the integration test (Playwright) to drive a kill/respawn and assert
  a `kill` event / alive→dead→alive transition.
- Confirm `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration`.

---

## 5. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Damage authority | Server only | Gate requirement; PLAN §10 anti-cheat |
| Client sends | `"shoot"` event (origin+direction), not damage | Server validates + computes damage |
| Fire-rate/ammo | Enforced on both; **authority on server** | Client for feel, server for truth |
| Hitscan target | Player capsule (radius + height) | Approximates player, simple raycast |
| Headshot | Hit above 85% of capsule height | Cheap, deterministic; matches PLAN "dot > 0.85" spirit |
| Friendly fire | Off | Team Deathmatch default |
| HUD ammo/health | From server snapshot | Authoritative display, avoids desync |

---

## 6. Files You Will Likely Touch

- `packages/shared/src/protocol/input.ts` — `ShootEvent`, `HitEvent`, `KillEvent`, `DamageEvent`
- `packages/shared/src/protocol/state.ts` — (remove dup events if needed)
- `apps/game-server/src/rooms/TeamDeathmatchRoom.ts` — weapon state, `handleShoot`, capsule raycast, death/respawn, broadcasts
- `apps/web/src/game/networking/GameSocket.ts` — combat listeners + `sendShoot`
- `apps/web/src/game/GameEngine.ts` — send shoot, combat callback routing, authoritative HUD
- `apps/web/src/game/Game.ts` — expose combat `GameCallbacks`
- `apps/web/src/pages/GamePage.tsx` — hit marker / damage indicator / kill feed state
- `apps/web/src/components/HUD/HitMarker.tsx` — NEW
- `apps/web/src/components/HUD/DamageIndicator.tsx` — NEW
- `apps/web/src/components/HUD/KillFeed.tsx` — NEW
- `apps/web/src/components/HUD/HUD.tsx` — render new components
- `apps/web/src/game/Game.ts` — type re-exports
- integration test (`scripts/run-integration.cjs` / `apps/web/scripts/test-browser-gate.cjs`)

---

## 7. Gotchas / Things to Watch

- **Keep client/server fire-rate + ammo rules consistent** to avoid the HUD
  showing different ammo than the server accepts.
- **The server must reject shots when `p.reloading` or `s.reloadTimer > 0`** and
  when `p.ammo <= 0`. Do not trust the client's `shoot: false` to stop the server.
- **Use `Date.now()/1000` for authoritative time** on the server (matches the
  existing respawn logic).
- **Broadcast events not just via schema** — `hit`/`damage`/`kill` are Colyseus
  `room.onMessage`/`broadcast` messages so they arrive promptly, not on the 20 Hz
  snapshot.
- **Restore the removed `KillEvent`/`DamageEvent`** carefully — the Phase 2 merge
  deleted the old ones from `state.ts`. Re-add them in `input.ts` (wire protocol
  types), and update `packages/shared/src/index.ts`.

---

## 8. Definition of Done

- [ ] Server owns weapon state (ammo, fire rate, reload timer, last fire time)
- [ ] Client sends discrete `"shoot"` event (origin + direction)
- [ ] Server validates alive / fire-rate / ammo / reload on every shot
- [ ] Server hitscan raycast against player capsules (head vs body)
- [ ] Server applies damage authoritatively; broadcasts `hit`/`damage`/`kill`
- [ ] Death + 3s respawn at team spawn with full health + ammo
- [ ] Client hit marker, damage indicator, kill feed render
- [ ] No client-side damage calculation (server validates everything)
- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test:unit` / `pnpm test:integration` green
- [ ] Integration test asserts a kill/respawn flow
- [ ] Spec `0005-combat.md` updated to `v1` Implemented with changelog
- [ ] Merge `feat/phase3-combat` → `main` via PR (squash), CI green
