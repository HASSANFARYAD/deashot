# 0006 — Team Deathmatch (Match Lifecycle)

**Status:** Implemented | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

Phase 4 completes the Team Deathmatch match loop on top of the Phase 2
(multiplayer movement) and Phase 3 (combat) foundations. The match must start,
play for its configured duration, and end correctly, with accurate team and
player scores surfaced to the client. The server remains authoritative for all
match lifecycle decisions.

## Goals & Gate

**Goal:** A full TDM match: two teams, live team scoring, a match timer, a clear
win condition (first to the kill limit, or highest score when time expires), and
a match-end state that freezes play and shows results.

**Gate (from PLAN.md):** Match starts, plays for configured duration, ends
correctly. Scores are accurate.

## What already exists (from Phases 2–3)

| Item | State |
|---|---|
| Team auto-assignment on join (`blue`/`red` balance) | Done |
| Team-colored remote player models | Done (`RemotePlayers.ts`) |
| Team kill score tracking (`blueScore`/`redScore`) | Done |
| Match timer (`timeRemaining`, `MATCH_DURATION = 600`) | Done |
| Match end on timer expiry (`endMatch`) | Done (partial — no winner info) |
| Kill event includes killer/victim/weapon/headshot flag | Done |
| Friendly fire disabled | Done |
| State transitions `waiting → in-progress → ended` | Done |

## What Phase 4 adds

### 1. Win by kill limit
- After a kill increments a team score, if `blueScore >= KILL_LIMIT` (50) or
  `redScore >= KILL_LIMIT`, the match ends immediately with that team as winner.
- If time expires first, the team with the higher score wins; a tie has no
  winner (`null`).

### 2. Winner in server state + `match-ended` broadcast
- Add `winner: "blue" | "red" | ""` to `MatchStateSchema` (synced via snapshot)
  and to the shared `MatchState` interface.
- `endMatch()` computes the winner and broadcasts `"match-ended"` with
  `{ winner, blueScore, redScore }` so clients can render the end screen without
  polling.

### 3. Freeze play on match end
- The server already stops simulation when `phase === "ended"`. Add a guard in
  `handleShoot` so no damage/kills register after the match ends (defense in
  depth against a shot message racing the phase change).

### 4. Client match state for React
- `GameState` (emitted by `GameEngine.emitState`) is extended with:
  `phase`, `timeRemaining`, `blueScore`, `redScore`, `winner`, `myId`, `myTeam`,
  and a `players` array (each: `id`, `name`, `team`, `kills`, `deaths`, `alive`).
- These are cached from the server snapshot in `GameEngine` (`serverMatch`)
  and merged into `emitState`, so the React HUD can render live scores, the
  timer, a scoreboard, and the match-end screen.

### 5. Scoreboard UI (React)
- A new `Scoreboard` HUD component lists players grouped by team (name, kills,
  deaths) plus the team scores and remaining time. Toggled by holding `Tab`
  (common FPS convention).

### 6. Match end screen (React)
- A new `MatchEnd` overlay appears when `phase === "ended"`: shows the winning
  team (or "Draw"), the final team scores, the final scoreboard, and a
  "Play Again" button (rejoins a fresh match) plus a "Back to Home" button.

## Out of scope (Phase 4 → later)

- Warmup/countdown ("3, 2, 1, GO") and lobby flow → Phase 5.
- Scoreboard ping column; player name entry; handles/guesst login → Phase 5.
- Assists / kill attribution → explicitly optional, skipped.
- MVP highlight on the results screen → polish Phase 6.

## Message / schema changes

| Item | Change |
|---|---|
| `MatchStateSchema.winner` | New `@type("string")` field (`"blue"`/`"red"`/`""`) |
| `MatchState.winner` (shared interface) | New field `winner: Team \| null` |
| `"match-ended"` payload | `{ winner, blueScore, redScore }` |

## Anti-cheat consideration

All scoring and match decisions stay server-side. The client only *reads*
`blueScore`/`redScore`/`winner`/`kills`/`deaths` from authority — it never sends
or mutates scores. The win-by-kill-limit check runs in the same server tick that
applies the kill, so scores cannot drift from the displayed result.

---

**Changelog**

- v1.0 — Implemented Phase 4: win-by-kill-limit (`KILL_LIMIT`), `winner` on
  `MatchStateSchema` and in the `"match-ended"` broadcast, `handleShoot` phase
  guard, match-freeze on end, client match-state surface (`GameState` gains
  phase/time/scores/winner/players/myId/myTeam/connected), scoreboard UI
  (hold Tab), match-end overlay (winner, final scores, Play Again), and a
  live timer + team-score HUD bar. Adds `test-match-end.cjs` integration test
  and per-room `killLimit`/`duration` option overrides for fast, deterministic
  match-lifecycle testing.
