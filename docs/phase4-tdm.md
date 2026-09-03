# Phase 4 — Team Deathmatch (Execution Guide)

> **Branch:** `feat/phase4-tdm`
> **Plan reference:** `PLAN.md` §6 Phase 4, §5 Networking Model
> **Specs to update:** `specifications/0006-team-deathmatch.md`
>
> This document is the shared context for any agent working on Phase 4.
> Read the whole thing before writing code.

---

## 1. Goal & Gate

**Goal:** Complete Team Deathmatch match flow — teams, scoring, timer, win
condition, and a proper match-end state.

**Gate (from PLAN.md):** Match starts, plays for configured duration, ends
correctly. Scores are accurate.

Per AGENTS.md, this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green.

---

## 2. Current State (on `main` after Phase 3)

Much of Phase 4 is already implemented by Phases 2–3:

### Server (`apps/game-server/src/rooms/TeamDeathmatchRoom.ts`)
- `PlayerStateSchema` / `MatchStateSchema` with `kills`, `deaths`, `blueScore`,
  `redScore`, `timeRemaining`, `phase`.
- 60 Hz tick; auto-start on first join (`waiting → in-progress`); `endMatch()`
  on timer expiry that sets `phase = "ended"` and broadcasts `"match-ended"`
  with `{ blueScore, redScore }`.
- `handleShoot` applies damage, kills, deaths, and increments team score.
  **No win-by-kill-limit check. No winner field.**

### Shared (`packages/shared`)
- `src/protocol/state.ts` — `MatchState`, `PlayerState`, `Team`, `MatchPhase`.
- `src/constants.ts` — `KILL_LIMIT = 50`, `MATCH_DURATION = 600`.
- `src/protocol/input.ts` — combat events (`HitEvent`/`KillEvent`/`DamageEvent`).

### Web client (`apps/web`)
- `GameSocket.ts` — `MatchSnapshot` (phase, timeRemaining, blueScore, redScore,
  players), combat listeners.
- `GameEngine.ts` — `GameState` only exposes health/ammo/reloading/reloadProgress/
  crosshairVisible. **No phase/score/timer/players surfaced to React.**
- `GamePage.tsx` — render HUD; no scoreboard, no match-end screen.
- `HUD.tsx` — health, ammo, crosshair, hit marker, damage indicator, kill feed.

---

## 3. Known Gaps (Phase 4 work)

1. Server never ends the match when a team reaches `KILL_LIMIT`.
2. No `winner` on server state or in the `"match-ended"` broadcast.
3. `handleShoot` doesn't guard against the ended phase (race condition).
4. Client React layer has no match state (phase/score/timer/players/winner).
5. No scoreboard UI; no match-end screen; timer and team scores not displayed.

---

## 4. Phase 4 Steps (in order)

### Step 4.1 — Server: winner + win-by-kill-limit
- Add `winner: "blue" | "red" | ""` to `MatchStateSchema` + `MatchState`.
- In `handleShoot`, after incrementing the team score, if
  `blueScore >= KILL_LIMIT || redScore >= KILL_LIMIT` call `endMatch()`.
- Guard `handleShoot` with `if (this.phase !== "in-progress") return;`.

### Step 4.2 — Server: endMatch computes + broadcasts winner
- `endMatch()` sets `state.winner` (higher score; `""` on tie) and broadcasts
  `"match-ended"` with `{ winner, blueScore, redScore }`.

### Step 4.3 — Client: surface match state
- `GameSocket.MatchSnapshot`: add `winner`.
- `GameEngine.GameState`: add `phase`, `timeRemaining`, `blueScore`, `redScore`,
  `winner`, `myId`, `myTeam`, `players` (id/name/team/kills/deaths/alive).
- Cache snapshot match fields in `GameEngine` and merge into `emitState` (with
  sensible offline defaults).

### Step 4.4 — Client: Scoreboard UI
- New `Scoreboard.tsx` component (grouped by team, name/kills/deaths, team
  scores + timer). Toggle with `Tab`.

### Step 4.5 — Client: Match-end screen
- New `MatchEnd.tsx` overlay when `phase === "ended"`: winner, final scores,
  final scoreboard, "Play Again" (remount) + "Back to Home".

### Step 4.6 — Client: HUD timer + team score
- Add a compact top-center match bar showing `timeRemaining`, `blueScore`,
  `redScore`.

### Step 4.7 — Gate verification
- `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration`.
- Extend an integration test to force a match end (win-by-kill-limit or timer)
  and assert `phase === "ended"` + a `winner`.
- Manual/Playwright: play a match, verify scoreboard + timer + match-end screen.

---

## 5. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Win by kill limit | Server-side check in `handleShoot` | Scores are authoritative; ends instantly |
| Winner field | `winner` on `MatchStateSchema` synced + in `"match-ended"` | Client end screen needs no extra request |
| Freeze on end | `onTick` early-returns + `handleShoot` phase guard | No damage/kills after match end |
| Scoreboard open | Hold `Tab` (FPS convention) | Standard, non-intrusive |
| Match end UI | Overlay from local `phase === "ended"` | Driven by authoritative snapshot |
| Play Again | Remount `GamePage` (new room join) | Reuses the full flow |

---

## 6. Files You Will Likely Touch

- `packages/shared/src/protocol/state.ts` — `MatchState.winner`
- `apps/game-server/src/rooms/TeamDeathmatchRoom.ts` — winner schema, kill-limit,
  endMatch winner + broadcast, phase guard
- `apps/web/src/game/networking/GameSocket.ts` — `MatchSnapshot.winner`
- `apps/web/src/game/GameEngine.ts` — extend `GameState`, surface match state
- `apps/web/src/pages/GamePage.tsx` — scoreboard toggle, match-end overlay,
  pass match state to HUD
- `apps/web/src/components/HUD/Scoreboard.tsx` — NEW
- `apps/web/src/components/HUD/MatchEnd.tsx` — NEW
- `apps/web/src/components/HUD/HUD.tsx` — match bar (timer + score)
- integration test (`scripts/run-integration.cjs` / colyseus test)

---

## 7. Gotchas / Things to Watch

- **Shared `MatchState` and the server `MatchStateSchema` must stay in sync.**
  Adding `winner` to the schema requires adding it to the shared interface and
  to the client snapshot reader.
- **`emitState` also runs offline** (single-player sandbox). Provide default
  values for all new `GameState` fields, and hide scoreboard/match-end when
  there's no active server match (or `offline`).
- **Do not compute/display scores from local state.** Always read
  `blueScore`/`redScore`/`kills`/`deaths`/`winner` from the server snapshot.
- **Remount for "Play Again"** — GamePage holds the socket/engine; restart by
  keying the component in `App`.
- **`MatchPhase` stays 3-state** (`waiting → in-progress → ended`). Warmup and
  countdown are Phase 5 — do not add them here.

---

## 8. Definition of Done

- [ ] Server ends match when a team hits `KILL_LIMIT` (win by kill limit)
- [ ] Server sets `winner` on state and in `"match-ended"` broadcast
- [ ] `handleShoot` guards the ended phase
- [ ] `MatchState.winner` + `MatchSnapshot.winner` present
- [ ] `GameState` surfaces phase/time/scores/winner/players/myId/myTeam to React
- [ ] Scoreboard UI (Tab) lists players by team with kills/deaths + team scores
- [ ] Match-end overlay shows winner, final scores, final scoreboard, Play Again
- [ ] HUD shows live timer + team scores
- [ ] Integration test asserts a match ends with a winner
- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test:unit` / `pnpm test:integration` green
- [ ] Spec `0006-team-deathmatch.md` updated to Implemented with changelog
- [ ] Merge `feat/phase4-tdm` → `main` via PR (squash), CI green
