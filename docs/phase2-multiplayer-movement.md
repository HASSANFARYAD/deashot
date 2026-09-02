# Phase 2 — Multiplayer Movement (Execution Guide)

> **Branch:** `feat/phase2-multiplayer-movement`
> **Plan reference:** `PLAN.md` §6 Phase 2, §5 Networking Model
> **Specs to update:** `specifications/0002-architecture.md`, `specifications/0003-networking-protocol.md`
>
> This document is the shared context for any agent working on Phase 2.
> Read the whole thing before writing code.

---

## 1. Goal & Gate

**Goal:** Multiple players connect, move around the same map, and see each other
smoothly — all server-authoritative.

**Gate (from PLAN.md):** 8 concurrent players with smooth movement, no visible
desync, client prediction feels instant. Deliverable: "8 players connect, move
around the map, see each other smoothly, no rubberbanding."

Per AGENTS.md, this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green.

---

## 2. Current State (what already exists)

### Server (`apps/game-server`)
- `index.ts` — Colyseus server, room `"tdm"`, port **2567**.
- `rooms/TeamDeathmatchRoom.ts` — a **working, near-complete** Phase 2 server:
  - `PlayerStateSchema` / `MatchStateSchema` using `@colyseus/schema`
  - 60 Hz `setSimulationInterval` tick
  - Handles `"input"` message → updates yaw/pitch + integrates physics
  - Auto-assigns teams (blue/red), spawns at `SPAWNS`, respawns dead players
  - Auto-starts match on first join
- **Note:** the server's movement is **world-axial** (W = -Z, S = +Z, etc.) and does **not**
  rotate movement with the camera yaw. Rotation (`yaw/pitch`) syncs, but movement
  direction is fixed to world axes. This is a simplification to be revisited.

### Shared protocol (`packages/shared`)
- `src/protocol/input.ts` — `PlayerInput` interface (client → server)
- `src/protocol/state.ts` — `PlayerState`, `MatchState`, `KillEvent`, `DamageEvent` interfaces
  (NOTE: `MatchState` interface here uses `scores: Record<Team, number>` and `killLimit`,
  but the server's `MatchStateSchema` uses flat `blueScore`/`redScore`. Reconcile these.)
- `src/constants.ts` — `SERVER_TICK_RATE=60`, `CLIENT_INPUT_RATE=30`,
  `SERVER_SNAPSHOT_RATE=20`, `MAX_PLAYERS=8`, `MATCH_DURATION=600`, `KILL_LIMIT=50`

### Web client (`apps/web`)
- `colyseus.js` is already a dependency.
- `vite.config.ts` already proxies `/ws` → `ws://localhost:2567` (for dev). Expose
  how the client connects — prefer `ws://localhost:2567` directly for dev, or use the `/ws` proxy.
- The app currently runs **offline-only**: `src/pages/GamePage.tsx` → `src/game/Game.ts`
  (`createGame`) → `src/game/GameEngine.ts` runs a **local** `PlayerController` and **no
  networking**. Remote player rendering and client prediction do **not** exist yet.
- Existing offline systems to reuse: `InputManager` (returns `InputState`), `FPSCamera`,
  `ArenaMap`, `CollisionWorld`, `Weapon`, `Effects`. CSP: The online mode will replace the
  local `PlayerController` authoritative path with server-driven state.

---

## 3. Known Issues to Resolve During Phase 2

1. **Coordinate mismatch.** Server `SPAWNS` are at `x = ±20` (`TeamDeathmatchRoom.ts:67`).
   Client `ArenaMap.buildMap` spawns at `x = ±30` (`ArenaMap.ts:86-88`), and `CollisionWorld`
   clamps to `±48`. Pick ONE source of truth (recommend the server: ±20) and make the client
   map / collision bounds match, or centralize map/spawn config in `packages/game-config`
   and consume it from BOTH client renderer and server.
2. **Movement facing.** Server movement must be camera-relative (forward should follow `yaw`)
   to match client expectation, OR the client must send pre-rotated movement. Decide and
   document. Recommended: server computes movement from `yaw` (matches PLAN §5 "client sends
   input, server simulates").
3. **State schema mismatch.** `MatchState` interface (`packages/shared/src/protocol/state.ts`)
   uses `scores`/`killLimit`; server `MatchStateSchema` uses `blueScore`/`redScore`, no
   `killLimit`. Unify so the shared types are the source of truth and the client parses what
   the server sends.
4. **Map/arena boundaries.** `ArenaMap` and server must share the same wall bounds so the
   client doesn't predict through walls the server rejects (rubber-banding).

---

## 4. Phase 2 Steps (in order)

### Step 2.1 — Reconcile shared state schema
- Update `packages/shared/src/protocol/state.ts` so `MatchState` matches the server's
  `MatchStateSchema` shape (`blueScore`, `redScore`, remove or map `scores`/`killLimit`).
- Update server `MatchStateSchema` if needed so it matches the shared interface.
- Keep `PlayerInput` as-is (it already matches the server's `"input"` handler).
- Update `specifications/0003-networking-protocol.md` (v2) to document the final schema.

### Step 2.2 — Centralize map/spawn config (optional but recommended)
- Add a `MAP_SPAWNS` / `MAP_BOUNDS` export to `packages/game-config` (or `packages/shared`).
- Both `apps/game-server` and `apps/web` import it. Removes the ±20 vs ±30 mismatch.

### Step 2.3 — Client networking layer (`GameSocket`)
Create `apps/web/src/game/networking/GameSocket.ts` (mirror the `networking/` folder from
PLAN §4). Responsibilities:
- `joinOrCreate("tdm")` via `colyseus.js` `Client`.
- Read incoming `state` (the `MatchStateSchema`): on first `onChange`/`onStateChange`,
  cache the current snapshot.
- Emit `"input"` at `CLIENT_INPUT_RATE` (30 Hz) — a `PlayerInput` object every 33 ms.
- Provide typed access: `room.sessionId`, `room.state`, `room.send("input", ...)`.
- Handle `room.onLeave` / reconnect basics.
- Emit snapshots to a consumer callback so `GameEngine` can update remote players.

### Step 2.4 — Client prediction loop
Refactor `GameEngine` so that for the **local player**:
- `InputManager.poll()` → `InputState` stays.
- Build a `PlayerInput` from `InputState` each frame; send it via `GameSocket` at 30 Hz
  (throttle) AND feed the same input into the local `PlayerController.update()` so the
  player moves instantly (prediction).
- Track the last input `sequence` sent.

### Step 2.5 — Server reconciliation
- On each incoming `MatchStateSchema` snapshot, if the local player's predicted position
  differs from the server's authoritative position by more than a tolerance
  (e.g. `0.5` m), snap/correct to the server position.
- (For v1: simple "snap to authoritative if error > tolerance". Full replay of
  unacknowledged inputs is Phase 2 stretch, not required for the gate.)

### Step 2.6 — Render remote players
- Add meshes (colored capsules/boxes per team — reuse the geometric primitive asset policy)
  for every player in `room.state.players` that is **not** the local player.
- On each snapshot, update each remote mesh's `position` and `orientation` (yaw/pitch ->
  `Euler(..., "YXZ")`).
- Remove meshes on player leave.
- Reuse `ArenaMap`/`CollisionWorld` for the shared world.

### Step 2.7 — Remote player interpolation
- Buffer the last **two** snapshots per remote player (t0, t1).
- Between snapshots, interpolate position linearly over the snapshot interval
  (≈ 50 ms at 20 Hz). Use time since the newer snapshot to compute `t`.
- Do NOT snap remote players to the latest position directly (PLAN §5). This removes
  the "rubber-banding" / jitter the gate targets.
- `@deashot/math` `lerp` can be reused.

### Step 2.8 — Connect the game entry
- `GamePage.tsx` / `Game.ts` (`createGame`) should now accept a mode: `offline` (Phase 1
  sandbox) or `online` (server-backed). For the gate we test `online`.
- The local `PlayerController` still computes prediction; remote players come from `GameSocket`.

### Step 2.9 — Multiplayer test utility
- Extend `apps/web/scripts/test-colyseus.cjs` (or add a new script) to:
  - Join 2+ clients, send `"input"` with movement, and confirm the server state position changes.
  - This is the automated integration check for the gate (runs in CI via `pnpm test:integration`).

### Step 2.10 — Gate verification
- Run `apps/game-server` (`pnpm dev:server`) + `pnpm dev:web`.
- Open **two** browser windows (or one + a node client), both join, verify:
  - They see each other's player mesh.
  - Moving in one is reflected in the other.
  - No rubber-banding on the local player (prediction feels instant).
  - Remote player moves smoothly (interpolation working).
- Ideally test with a script simulating multiple clients (test with 2 → 4 → 8).
- Confirm `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration` all pass.

---

## 5. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Client sends | `PlayerInput` at 30 Hz (not position) | Server-authoritative, anti-cheat |
| Server simulates | 60 Hz tick | Matches `SERVER_TICK_RATE` |
| Snapshot broadcast | 20 Hz (`SERVER_SNAPSHOT_RATE`) | Bandwidth vs smoothness (Colyseus sends deltas) |
| Local player | Client-predicted, reconciled on snapshot | Instant response (gate requirement) |
| Remote player | Two-snapshot buffer + linear interp | Removes rubber-banding (gate requirement) |
| Position authority | Server only | PLAN §5, §10 anti-cheat |
| Player rendering | Team-colored primitives (boxes/capsules) | Asset policy (§9), fast |

---

## 6. Files You Will Likely Touch

- `packages/shared/src/protocol/state.ts` — unify `MatchState` with server schema
- `packages/shared/src/constants.ts` — unchanged (rates already correct)
- `packages/game-config/src/*` — add map spawn/bounds config (Step 2.2, optional)
- `apps/web/src/game/networking/GameSocket.ts` — NEW (client networking)
- `apps/web/src/game/networking/ClientPrediction.ts` — NEW (helper, optional)
- `apps/web/src/game/networking/Interpolation.ts` — NEW (remote player smoothing)
- `apps/web/src/game/GameEngine.ts` — add online mode, prediction, remote mesh updates
- `apps/web/src/game/Game.ts` — accept `mode: "offline" | "online"`
- `apps/web/src/pages/GamePage.tsx` — pass mode + start online
- `apps/web/src/game/map/ArenaMap.ts` — align spawns with server (±20 recommended)
- `apps/game-server/src/rooms/TeamDeathmatchRoom.ts` — camera-relative movement (Step 2.5/2.9), spawns from shared config
- `apps/web/scripts/test-colyseus.cjs` or `scripts/run-integration.cjs` — movement assertion

---

## 7. Gotchas / Things to Watch

- **Colyseus schema listeners:** With `@colyseus/schema`, prefer `room.onStateChange` /
  `state.players.onAdd / onChange / onRemove` over polling a raw object, for delta efficiency.
- **Frozen snapshot for interpolation:** Clone or snapshot the two most recent states; do not
  mutate the same object you read.
- **dt / fixed timestep:** Server uses fixed `h = 1/60`. Client prediction may use variable
  `dt` (from `performance.now()`); keep tolerance-based reconciliation to avoid fighting.
- **Performance:** 8 players × 60 fps is trivial. Don't over-engineer; simple meshes +
  buffer + lerp is enough for the gate.
- **Never trust client position** for authoritative correctness (AGENTS.md / PLAN §10).
  Prediction is purely cosmetic responsiveness, always subordinated to server snapshots.
- **Keep unit + integration tests green** after each step — the CI gate blocks merging.

---

## 8. Definition of Done

- [ ] Two+ clients join `tdm` and see each other's meshes
- [ ] Local player movement is instant (prediction) with no rubber-banding
- [ ] Remote players move smoothly (interpolation)
- [ ] Server remains authoritative for position
- [ ] Coordinate/spawn mismatch resolved
- [ ] Shared `MatchState` schema unifies client and server
- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test:unit` / `pnpm test:integration` green
- [ ] Specs `0002-architecture.md`, `0003-networking-protocol.md` updated to `v2` with changelog
- [ ] Merge `feat/phase2-multiplayer-movement` → `main` via PR (squash), CI green
