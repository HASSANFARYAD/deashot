# Phase 5 — Lobby & Match Flow (Execution Guide)

> **Branch:** `feat/phase5-lobby`
> **Plan reference:** `PLAN.md` §6 Phase 5
> **Specs to update:** `specifications/0007-lobby-match-flow.md`
>
> This document is the shared context for any agent working on Phase 5.
> Read the whole thing before writing code.

---

## 1. Goal & Gate

**Goal:** Complete end-to-end user flow — open the browser, become a guest,
Quick Play into a match, see the lobby + countdown, play, see results, and play
again.

**Gate (from PLAN.md):** A new user can go from opening the browser to finishing
a match with zero documentation.

Per AGENTS.md, this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green.

---

## 2. Current State (on `main` after Phase 4)

- **API** (`apps/api/src/index.ts`): `/health`, `POST /auth/guest` issues a JWT
  with `{ username, guest: true }`. **No profile/settings routes.**
- **Game server** (`apps/game-server/src/index.ts`): defines `tdm` room, **no
  `auth()` configured**, so `client.auth` is always empty and the name fallback
  (`sessionId.slice(0,6)`) is always used.
- **Room** (`TeamDeathmatchRoom.ts`): phase is `waiting | in-progress | ended`,
  auto-starts on first join, `handleShoot` guards only `in-progress`.
- **Web client**: `Home` is a static "PLAY (Connect)" button; `App` toggles
  `home | game`; `GameSocket.connect()` does a bare `joinOrCreate("tdm")` with no
  auth token. `GamePage` already renders HUD, Scoreboard (Tab), MatchEnd.

---

## 3. Known Gaps (Phase 5 work)

1. No guest-login UI; no username entry; token not passed to the server.
2. Game server does not verify the JWT → server identity/name not trusted.
3. No warmup/countdown phase; room starts `in-progress` immediately.
4. No lobby overlay, loading screen, or pause menu.
5. No backend-profile settings (sensitivity/volume/crosshair color).
6. Routing is a bare 2-state toggle.

---

## 4. Phase 5 Steps (in order)

### Step 5.1 — Server: JWT verification
- Add `jsonwebtoken` dep to `apps/game-server`.
- `gameServer.auth(verifyFn)` in `index.ts`: verify `token` with `JWT_SECRET`,
  return `{ username, sub }` (payload) or reject.
- Verify the game-server still falls back to a fake identity when `JWT_SECRET`
  is unset (dev/tests) — decode is optional; integration tests currently join
  without a token.

### Step 5.2 — Server: warmup + countdown phase
- Extend `MatchStateSchema.phase` union with `"warmup"`; add `countdown` number
  field.
- `onJoin`: transition `waiting → warmup`; if `playerCount >= warmupPlayers`,
  start a countdown timer (`warmupSeconds`, default 3) with a `"countdown"` sync;
  at zero → `in-progress` + broadcast `"countdown-start"`/GO marker.
- Guard `handleShoot`: only `in-progress` (already) — also block during warmup.
- Room options: `warmupPlayers` (default 2), `warmupSeconds` (default 3) so the
  integration test can set `warmupPlayers: 1` for a fast deterministic start.

### Step 5.3 — Client: guest login
- `Home` (React): username input (default random), "Play" → `POST /auth/guest`
  via `fetch` using `VITE_API_URL` → returns `{ token, username }`, stored
  (localStorage) and passed to `GameSocket`.
- `GameSocket.connect(token)`: pass token as the Colyseus `authToken`, read name
  from the verified identity.

### Step 5.4 — Client: lobby + countdown overlay
- `GamePage`/new `Lobby` overlay: render when `phase === "warmup"` (map, mode,
  players grouped by team, "waiting for players…"), then the big countdown
  number from `countdown`/`countdown` snapshot (`3 2 1 GO`).

### Step 5.5 — Client: loading screen
- Transient overlay on join: map name + rotating tip; hidden when first snapshot
  and spawn state is ready.

### Step 5.6 — Client: pause menu
- ESC toggles a pause overlay (Resume / Settings / Leave). Only when match is in
  play. Leave → Home.

### Step 5.7 — Client/API: settings (backend profile)
- API: `GET /profile/settings`, `PUT /profile/settings`, JWT-guarded
  (`preHandler` verify), stored per `sub`. Keys: `sensitivity`, `volume`,
  `crosshairColor`.
- Client: settings context loads on login; Pause → Settings edits and PUTs;
  engine applies sensitivity + crosshair color; audio master applies volume.

### Step 5.8 — Client: routing
- `App` state machine: `home` → `game`; game flow drives Lobby → Countdown →
  Game → Results → Home (Play Again and Leave both route correctly).

### Step 5.9 — Gate verification
- `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration`.
- Extend/add integration test: join with `warmupPlayers: 1`, assert phase goes
  `warmup` → `in-progress` after countdown, and combat unlocks.
- Manual/Playwright smoke: login → lobby → countdown → play → results → again.

---

## 5. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Lobby autostart | Warmup until player-count threshold, then 3‑2‑1‑GO | No manual ready; still authoritative and testable |
| Quick Play | Single `joinOrCreate("tdm")` | 1 map/1 mode MVP; simplest flow |
| Identity | Verify JWT server-side via Colyseus `auth()` | Trusted name/identity, anti-cheat aligned |
| Settings | Backend profile keyed by JWT `sub`, via API | User's explicit choice; survives refresh across sessions |
| Routing | State field in `App`, no router lib | Fits current 2-screen app, lowest overhead |
| Loading screen | Transient overlay until first snapshot | Feels responsive without blocking |

---

## 6. Files You Will Likely Touch

- `apps/api/src/index.ts` — profile settings routes (JWT-guarded)
- `apps/game-server/src/index.ts` — Colyseus `auth()`
- `apps/game-server/src/rooms/TeamDeathmatchRoom.ts` — warmup/countdown phase
- `packages/shared/src/protocol/state.ts` — `MatchPhase` + `countdown`
- `apps/web/src/game/networking/GameSocket.ts` — token + countdown snapshot
- `apps/web/src/game/GameEngine.ts` — `GameState.countdown`, settings application
- `apps/web/src/pages/Home.tsx`, `apps/web/src/app/App.tsx` — login + routing
- `apps/web/src/pages/GamePage.tsx` — lobby/countdown/loading/pause overlays
- new: `components/Lobby/Lobby.tsx`, `components/HUD/LoadingOverlay.tsx`, `components/HUD/PauseMenu.tsx`, `components/Settings/SettingsPanel.tsx`, `settings/` context
- integration test in `apps/web/scripts/` + `scripts/run-integration.cjs`

---

## 7. Gotchas / Things to Watch

- **Integration tests join with no token.** Keep a dev fallback so `auth`
  missing/`JWT_SECRET` unset still lets tests join (name = generated).
- **`auth` must return a plain object, never throw into the join path.** Return
  a rejected promise/undefined that Colyseus turns into a clean error.
- **`warmupPlayers` default 2** breaks the old "start on first join" behavior —
  set `warmupPlayers: 1` in tests, and keep `warmupSeconds` small for tests.
- **Do not let countdown run during `warmup` with fewer than threshold players.**
  Only start counting down once the room is full enough.
- **Client offline/sandbox (no server)** must still render defaults for
  `countdown`/`warmup` with no crash.
- **Keep `MatchState`/`MatchStateSchema`/`MatchSnapshot`/`GameState` in sync** for
  every new field (`countdown`, and phase union).
- **JWT secret must match** between API and game server for verification to pass.

---

## 8. Definition of Done

- [ ] Server verifies guest JWT and populates `client.auth.username`
- [ ] Room has `warmup` phase + countdown `3 2 1 GO` → `in-progress`
- [ ] `handleShoot` stays locked during warmup/countdown
- [ ] Room options `warmupPlayers`/`warmupSeconds` (testable)
- [ ] Home has guest login; token passed to `joinOrCreate`
- [ ] Lobby overlay shows players/teams/map + countdown number
- [ ] Loading screen (map + tips) on join
- [ ] ESC pause menu (Resume / Settings / Leave)
- [ ] API profile settings routes (JWT-guarded) + client settings panel
- [ ] Settings applied to engine (sensitivity, crosshair) + audio volume
- [ ] `App` routing: Home → Lobby → Game → Results → Home works
- [ ] Integration test asserts warmup → countdown → in-progress and combat unlocks
- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test:unit` / `pnpm test:integration` green
- [ ] Spec `0007-lobby-match-flow.md` updated to Implemented with changelog
- [ ] Merge `feat/phase5-lobby` → `main` via PR (squash), CI green
