# 0003 — Networking Protocol

**Status:** Implemented | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

The networking model is server-authoritative with client-side prediction.
The client sends inputs to the server; the server simulates and broadcasts
state snapshots to all clients. Clients interpolate between authoritative
snapshots and reconcile predicted state.

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

## Server state: MatchState

Defined using `@colyseus/schema` in `packages/shared/src/protocol/state.ts`.

### MatchState

| Field | Type | Description |
|---|---|---|
| id | `string` | Room ID |
| mode | `string` | Always `"tdm"` for MVP |
| map | `string` | Always `"arena"` for MVP |
| phase | `MatchPhase` | `waiting` \| `in-progress` \| `finished` |
| timeRemaining | `number` | Seconds left in match |
| blueScore | `number` | Blue team total kills |
| redScore | `number` | Red team total kills |
| players | `MapSchema<PlayerState>` | Keyed by session ID |

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

Snapshots are sent at `SERVER_SNAPSHOT_RATE` (20 Hz). Each broadcast contains
the full `MatchState` (all player positions, scores, time remaining). Clients
overwrite their local state with the authoritative snapshot and then re-apply
any unacknowledged inputs for prediction.

## Message types

| Name | Direction | Payload | Notes |
|---|---|---|---|
| `"input"` | Client → Server | `PlayerInput` | 30 Hz, reliable |
| `"respawn"` | Client → Server | `{}` | Request respawn after death |
| `"match-ended"` | Server → Clients | `{ winner: Team, blueScore, redScore }` | End-of-match broadcast |

## Constants

| Constant | Value | Source |
|---|---|---|
| `SERVER_TICK_RATE` | 60 Hz | `packages/shared/src/constants.ts` |
| `CLIENT_INPUT_RATE` | 30 Hz | `packages/shared/src/constants.ts` |
| `SERVER_SNAPSHOT_RATE` | 20 Hz | `packages/shared/src/constants.ts` |

## Future phases

- **Phase 2:** Client prediction (apply own inputs locally, reconcile on next snapshot)
- **Phase 3:** Interpolation for remote players (smooth movement between snapshots)
- **Phase 4:** Lag compensation (rewind server state for hit validation)

---

**Changelog**

- v1.0 — Initial spec (Phase 0 + 1 protocol baseline)