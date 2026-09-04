# 0003 — Networking Protocol

**Status:** Implemented | **Version:** 2.1 | **Owner:** @HASSANFARYAD

## Overview

The networking model is server-authoritative with client-side prediction.
The client sends inputs to the server; the server simulates and broadcasts
state snapshots to all clients. Clients interpolate between authoritative
snapshots for remote players and reconcile their own predicted state.

## Direction of data flow

```
Client ──input──▶ Server ──snapshot──▶ Clients
        (30 Hz)          (20 Hz)
```

## Client → Server: PlayerInput

Sent over a Colyseus room message (`"input"`) at `CLIENT_INPUT_RATE` (30 Hz).

```ts
interface PlayerInput {
  sequence: number;   // monotonic per-client counter
  tick: number;       // server tick this input targets
  forward: boolean;   // W
  backward: boolean;  // S
  left: boolean;      // A
  right: boolean;     // D
  jump: boolean;      // Space
  yaw: number;        // horizontal rotation (radians)
  pitch: number;      // vertical rotation (radians, clamped ±PI/2)
  shoot: boolean;     // left mouse held
  reload: boolean;    // R key
}
```

Defined in `packages/shared/src/protocol/input.ts`. This is a plain TypeScript
interface — the JSON wire format is the object serialized directly.

### Server-side input sanitisation (v2.1)

The interface describes what a cooperative client sends; the server assumes
none of it. On arrival every field is coerced to its declared type, and the
rotation fields are additionally constrained:

| Field | Constraint |
|---|---|
| `forward` … `reload` | Coerced to boolean. |
| `yaw` | Non-finite → `0`, otherwise wrapped to `[-PI, PI]` via `normalizeAngle`. |
| `pitch` | Non-finite → `0`, otherwise clamped to `±PITCH_LIMIT`. |

Two notes on why this is stricter than it looks. `pitch` was documented as
"clamped ±PI/2" from v1.0 but the clamp existed only on the client, so a
modified client could aim outside the camera's reachable range. And the guard
must use `Number.isFinite`, not the global `isFinite`, which coerces its
argument — `isFinite("5")` is `true`, so a string reached a numeric schema
field. A lint rule now blocks the global repo-wide.

The accepted `yaw`/`pitch` are what shot validation checks fired directions
against (see 0005), so sanitising here is what makes that cone meaningful.

## Server state: MatchState

Defined using `@colyseus/schema` in `packages/shared/src/protocol/state.ts`.

### MatchState

| Field | Type | Description |
|---|---|---|
| id | `string` | Room ID |
| mode | `string` | Always `"tdm"` for MVP |
| map | `string` | Always `"arena"` for MVP |
| phase | `MatchPhase` | `waiting` \| `in-progress` \| `ended` |
| timeRemaining | `number` | Seconds left in match |
| blueScore | `number` | Blue team total kills |
| redScore | `number` | Red team total kills |
| players | `MapSchema<PlayerState>` | Keyed by session ID |

> The canonical `MatchState` schema is defined on the server in
> `apps/game-server/src/rooms/TeamDeathmatchRoom.ts` (`MatchStateSchema`).
> `packages/shared/src/protocol/state.ts` mirrors it as a plain interface
> (`MatchState`) for typing client code.

### PlayerState

| Field | Type | Description |
|---|---|---|
| id | `string` | Colyseus session ID |
| name | `string` | Player display name |
| team | `Team` | `"blue"` \| `"red"` |
| x, y, z | `number` | World position |
| yaw, pitch | `number` | Camera orientation |
| health | `number` | Current HP (0–100) |
| maxHealth | `number` | Always 100 |
| alive | `boolean` | False when dead, awaiting respawn |
| kills | `number` | Personal kill count |
| deaths | `number` | Personal death count |

## Server → Client: snapshot broadcast

Snapshots are broadcast via the Colyseus schema state (matching
`SERVER_SNAPSHOT_RATE` = 20 Hz; the client additionally polls the schema at 50 Hz
for interpolation density). All player positions, scores, and time
remaining sync through the schema.

### Client prediction (local player)

The client runs the same movement simulation locally so input feels instant
(`PlayerController.update`). It sends `PlayerInput` at 30 Hz. On each incoming
snapshot it compares the server-authoritative position to its predicted
position; if the error exceeds `RECONCILE_TOLERANCE` (0.5 m), it snaps the
local player to the authoritative position (reconciliation).

### Remote player interpolation

Remote players are not directly snapped. Each remote player keeps a small ring
buffer of (time, position) samples. Each frame the client picks the two samples
bracketing a render time (buffered ~1 snapshot interval behind now) and lerps
between them. This removes the discrete snapshot "steps". See
`apps/web/src/game/systems/RemotePlayers.ts`.

## Message types

| Name | Direction | Payload | Notes |
|---|---|---|---|
| `"input"` | Client → Server | `PlayerInput` | 30 Hz, reliable |
| `"respawn"` | Client → Server | `{}` | Request respawn after death (server also auto-respawns) |
| `"match-ended"` | Server → Clients | `{ blueScore, redScore }` | End-of-match broadcast |

## Constants

| Constant | Value | Source |
|---|---|---|
| `SERVER_TICK_RATE` | 60 Hz | `packages/shared/src/constants.ts` |
| `CLIENT_INPUT_RATE` | 30 Hz | `packages/shared/src/constants.ts` |
| `SERVER_SNAPSHOT_RATE` | 20 Hz | `packages/shared/src/constants.ts` |

## Implemented behaviour (Phase 2)

- Server simulates camera-relative movement (forward follows `yaw`), matching
  the client prediction convention.
- Server clamps positions to `MAP_BOUNDS.halfExtent` (±48) so authority matches
  the renderer.
- Team auto-assignment and spawns come from `MAP_SPAWNS` in
  `packages/game-config` (single source of truth; resolved the old ±20 vs ±30
  mismatch).

## Future phases

- **Phase 3:** Lag compensation (rewind server state for hit validation)
- **Later:** Full replays of unacknowledged inputs instead of snap-to-tolerance

---

**Changelog**

- v2.1 — Server-side input sanitisation (audit P1-20): `yaw` normalized,
  `pitch` clamped to `PITCH_LIMIT`, both guarded with `Number.isFinite`.
  `normalizeAngle` no longer loops, so a non-finite yaw can't hang the tick.
- v2.0 — Phase 2: implemented client prediction + reconciliation, remote player
  interpolation, camera-relative server movement, unified map/spawn config;
  corrected `MatchPhase` (`ended` not `finished`), documented client polling.
- v1.0 — Initial spec (Phase 0 + 1 protocol baseline)