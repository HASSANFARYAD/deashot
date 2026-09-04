# 0007 — Lobby & Match Flow (End-to-End User Journey)

**Status:** Implemented | **Version:** 1.2 | **Owner:** @HASSANFARYAD

## Overview

Phase 5 wires the full browser → match → results journey together so a brand-new
user (no documentation) can open the game, become a guest, join a match, play,
see results, and play again. It builds directly on Phase 4's authoritative match
lifecycle and Phase 3's combat.

## Goals & Gate

**Goal:** Complete user flow — Home → Guest Login → Quick Play → Lobby →
Countdown → Game → Results → Home — with a warmup/countdown, a lobby showing
connected players and teams, a loading screen, and a match flow a stranger can
follow unaided.

**Gate (from PLAN.md):** A new user can go from opening the browser to finishing
a match with zero documentation.

## Design decisions (confirmed)

| Decision | Choice |
|---|---|
| Lobby flow | Auto-lobby + countdown: join → see players/teams → auto 3‑2‑1‑GO when threshold met; no manual ready |
| Room selection | Quick Play only: one "Play" button → `joinOrCreate("tdm")` |
| Settings storage | Backend profile keyed to the guest JWT identity (via the API) |

## What already exists (from Phases 0–4)

| Item | State |
|---|---|
| `/auth/guest` API (issues JWT with username) | Done |
| `client.auth?.username` read for player name | Partial — game server does not verify the JWT, so `client.auth` is always empty |
| Quick Play join (`joinOrCreate("tdm")`) | Done |
| Match state `waiting/in-progress/ended`, timer, scores, winner | Done |
| Team assignment, kill feed, crosshair, health, ammo, HUD | Done |
| Scoreboard (Tab), MatchEnd screen with Play Again | Done |

## What Phase 5 adds

### 1. Guest login (client)
- Home page: optional username input (defaults to a generated name), "Play" →
  calls `POST /auth/guest` → stores `{ token, username }` locally → joins the room
  with the JWT as the Colyseus `authToken`.
- The JWT establishes the player's identity (stable `sub`/profile id + username).

### 2. Server JWT verification
- Game server configures Colyseus `auth(token, req)` to verify the JWT with the
  same `JWT_SECRET` used by the API and returns `{ username, sub }` so
  `client.auth` is populated. Invalid/missing tokens are rejected with a clear
  error and do not join.

#### Enforcement (v1.2)

v1.1 shipped this only for *invalid* tokens. A client that sent **no** token was
handed a generated guest identity, so the gate above was effectively opt-in and
anyone could join under any name. Missing tokens are now rejected whenever
`REQUIRE_AUTH` is set, which defaults on when `NODE_ENV=production`.

The generated identity remains available for `pnpm dev:server` and the
integration harness, which run without the API; both opt in explicitly.

Configuration is resolved once at boot in `apps/game-server/src/config.ts`:

| Variable | Default | Effect |
|---|---|---|
| `JWT_SECRET` | dev fallback outside production | Shared with the API. **Absent in production, both services refuse to start** rather than use the fallback, which is a literal published in this repository. |
| `REQUIRE_AUTH` | on in production | Reject clients that supply no token. |
| `ALLOW_TEST_ROOM_OPTIONS` | off, and always off in production | Honour `killLimit` / `duration` / `warmupPlayers` / `warmupSeconds` from the client's `joinOrCreate` payload. |

Guest tokens issued by `POST /auth/guest` now carry a 12-hour expiry; they were
previously valid forever.

The `ALLOW_TEST_ROOM_OPTIONS` gate matters because those overrides arrive in the
client's join payload: with it on in production, any browser console could open
a room with `killLimit: 1` and win a match with a single kill.

Regression test: `apps/web/scripts/test-auth-hardening.cjs` starts its own
server with the escape hatches off and asserts that tokenless and forged joins
are rejected, a valid token is trusted for the player's name, and a
client-supplied `duration` is ignored.

### 3. Warmup + countdown (server-authoritative)
- Add `warmup` to the match phase set: `waiting → warmup → in-progress → ended`.
- On join the room enters `warmup`; players may move/look but **not** shoot
  (`handleShoot` guards `warmup`).
- When the joined player count reaches a threshold (2 by default, overridable via
  room options for deterministic tests), a 3‑second countdown begins
  (`countdown` field, 3 → 2 → 1 → GO). At zero the room transitions to
  `in-progress` and combat unlocks.
- A `warmup`/`countdown` flag is broadcast so the client can render the lobby
  overlay and the big 3‑2‑1‑GO counter.

### 4. Lobby overlay (client)
- While `warmup`/countdown, an overlay shows the map name, mode, current players
  grouped by team, and the countdown number / "GO". The Play Again path (Quick
  Play) returns the user here for the next match.

### 5. Loading screen (client)
- On joining, a transient loading overlay shows the map name plus one rotating
  gameplay tip while the engine/spawn warms up, then hands off to gameplay.

### 6. Pause menu (ESC)
- ESC opens a pause overlay with Resume, Settings, and Leave Match (returns to
  Home). Works only in a running match (not in warmup/ended).

### 7. Settings (backend profile)
- API adds `GET /profile/settings` and `PUT /profile/settings` guarded by the JWT
  (Fastify `preHandler` verify), storing sensitivity, master volume, and
  crosshair color per stable guest profile id.
- Client loads settings on login and saves changes; the engine consumes
  sensitivity/crosshair color and the audio master is applied to volume.

### 8. Routing (client)
- `App` gains an explicit state machine: `home → game` where the game flow
  itself walks Lobby → Countdown → Game → Results → Home (no router lib; a
  state field in App).

## Out of scope (Phase 5 → later)

- MVP highlight on the results screen → polish (Phase 6).
- Weapon recoil / audio assets / camera shake → Phase 6.
- Full accounts (email/password), persistent match history, room browser.
- Real leaderboard persistence (single in-match board only).

## Message / schema changes

| Item | Change |
|---|---|
| `MatchPhase` (shared) | Add `"warmup"` to the union |
| `MatchStateSchema.phase` | Add `"warmup"` to the union type |
| `MatchStateSchema.countdown` | New `@type("number")` field (seconds remaining, `0` when not counting) |
| `MatchSnapshot` / `GameState` | Add `countdown` (and `warmup` phase surfaces through `phase`) |
| Room options | `warmupPlayers` (default 2), `warmupSeconds` (default 3) overrides for tests |
| Server `auth` | JWT verification returns `{ username, sub }` |
| API | `GET/PUT /profile/settings` (JWT-guarded) |
| `"match-ended"` | unchanged |

## Anti-cheat consideration

Countdown/lobby timing is server-authoritative; a client cannot skip it. Combat
stays locked during `warmup`/countdown via the server `handleShoot` phase guard.
The player cannot fabricate score, team, or identity — name and profile come from
the verified JWT.

---

**Changelog**

- v1.2 — Enforced the auth gate v1.1 only described (audit P0-4, P0-5). Missing
  tokens are rejected under `REQUIRE_AUTH`; client-supplied room tuning is
  ignored unless `ALLOW_TEST_ROOM_OPTIONS` is set and never honoured in
  production; both services refuse to start in production without `JWT_SECRET`;
  guest tokens expire after 12h. `docker-compose.yml` no longer hardcodes the
  published dev secret and now passes it to the game server, which previously
  received none. Adds `test-auth-hardening.cjs`.
- v1.1 — Implemented Phase 5: static `onAuth` JWT verification in
  `TeamDeathmatchRoom`; `warmup` phase + `countdown` in `MatchStateSchema`;
  room options `warmupPlayers`/`warmupSeconds`; API `GET/PUT /profile/settings`;
  client `settings/api.ts` + `useProfileSettings`; Home/App routing, Lobby,
  Loading, Pause overlays; `test-warmup.cjs` integration test; combat/match-end
  tests updated to `warmupPlayers: 1`; integration runner starts the API for the
  browser gate test.
- v1.0 — Proposed Phase 5: end-to-end Home → Login → Quick Play → Lobby →
  Countdown → Game → Results flow; server JWT verification; warmup/countdown
  phase; lobby + loading + pause UI; backend-profile settings.
