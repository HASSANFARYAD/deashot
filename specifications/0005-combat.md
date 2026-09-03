# 0005 — Combat (Server-Authoritative)

**Status:** Implemented | **Version:** 1.0 | **Owner:** @HASSANFARYAD

## Overview

Phase 3 introduces server-authoritative combat. The server owns all weapon
state (ammo, fire rate, reload, last fire time), validates every shot, performs
hitscan raycasts against player capsules, applies damage, detects kills and
headshots, and drives death + respawn. The client only *reports* shots and
*renders* feedback (tracers, hit markers, damage indicators, kill feed) — it
never computes damage. This matches the server-authoritative rule: **never
trust the client for damage, health, ammo, fire rate, or kills.**

## Goals & Gate

**Goal:** Two players can shoot each other, see hit markers, take damage, die,
and respawn. All damage is server-authoritative.

**Gate (from PLAN.md):** No client-side damage calculation. Server validates
everything. Feels responsive despite network latency.

## Combat flow

```
Mouse fire
    │
    ▼
Client: weapon state drives local fire-rate/ammo *display*; sends "shoot"
        event (muzzle origin + direction) to the server
    │
    ▼
Server: validate (alive? fire-rate ok? ammo available? not reloading?)
        → deduct ammo → hitscan raycast against alive enemy capsules
        → head vs body → apply damage → death? → score → broadcast events
    │
    ▼
Clients: hit marker (shooter), damage indicator (victim), kill feed (all)
```

The client's local `Weapon` class already enforces fire rate, ammo, and reload
for *offline feel and display*; the server re-validates the same rules
authoritatively and broadcasts authoritative ammo/health in the snapshot.

## Client → Server: "shoot" event

Sent via Colyseus room message `"shoot"` on each trigger pull. Origin and
direction are in world space; the server normalizes the direction.

```ts
interface ShootEvent {
  ox: number; oy: number; oz: number;  // muzzle origin (world)
  dx: number; dy: number; dz: number;  // shot direction, normalized by server
}
```

Defined in `packages/shared/src/protocol/input.ts`.

> **Response vs. event:** each `"shoot"` message is an event, not a held
> boolean. The server's fire-rate check (`60 / fireRate` sec) prevents
> over-firing even if the client spams the socket.

## Weapon state (server-authoritative)

New fields added to `PlayerStateSchema` so authorized ammo/reload sync to all
clients via the snapshot:

| Field | Type | Description |
|---|---|---|
| `ammo` | `number` | Rounds left in magazine |
| `reloading` | `boolean` | True while reload timer runs |

Server also keeps per-player non-synced sim fields `lastFireTime` and
`reloadTimer` (in `SimPlayer`).

Rules enforced on the server:
- **Fire rate:** `now - lastFireTime >= 60 / fireRate` (600 RPM → 0.1 s).
- **Ammo:** refuse when `ammo <= 0`.
- **Reload:** refuse while `reloadTimer > 0`; auto-reload when empty; reloads
  refill to `magazineSize` after `reloadTime` (2.1 s).
- **Alive:** dead players cannot shoot.

## Hitscan raycast

On a valid shot, the server raycasts from the muzzle origin along the shot
direction against every **alive enemy** player (friendly fire is off). Each
player is modelled as a vertical capsule:

- center `(x, y + PLAYER_HEIGHT / 2, z)`
- radius `PLAYER_RADIUS`
- height `PLAYER_HEIGHT`

Ray-vs-infinite-cylinder intersection, then Y-bounds check (reject hits outside
`y` … `y + PLAYER_HEIGHT`). The closest valid hit wins.

**Head vs body:** a hit above 85% of the capsule height
(`y + PLAYER_HEIGHT * 0.85`) counts as a headshot.

## Damage & death

- Damage = `stats.damage` (25) for body, `stats.damage * stats.headMultiplier`
  (25 × 2 = 50) for head.
- Applied to the victim's `health` (clamped at 0).
- On `health <= 0`: mark dead, set `respawnAt = now + RESPAWN_DELAY` (3 s),
  increment killer `kills` / victim `deaths`, update team score, broadcast a
  `"kill"` event.
- Dead players are skipped by the movement/input path; auto-respawn at their
  team spawn with full health and ammo once `respawnAt` passes.

## Server → Client events

Broadcast as Colyseus room messages (defined in
`packages/shared/src/protocol/input.ts`):

| Name | Direction | Payload | Purpose |
|---|---|---|---|
| `"hit"` | Server → all | `{ attackerId, victimId, damage, headshot, newHealth }` | Hit marker for shooter + ammo/health sync |
| `"damage"` | Server → all | `{ targetId, attackerId, attackerName, amount, headshot, newHealth }` | Damage indicator on victim |
| `"kill"` | Server → all | `{ killerId, killerName, killerTeam, victimId, victimName, victimTeam, headshot, weaponId }` | Kill feed |

The authoritative `health`/`ammo`/`reloading` also flow through the normal
snapshot (`PlayerStateSchema`) for reconciliation and HUD display.

## Anti-cheat (this phase)

- Server validates fire rate, ammo, reload, alive on every shot.
- Client never sends damage values — it only reports a shot.
- No lag compensation this phase (noted as a future phase in 0003).

## Out of scope (Phase 3)

- Scoreboard, kill attribution/assists, match lifecycle → Phase 4.
- Recoil spread applied server-side (visual only this phase) → polish.
- Lag compensation / rewind hit validation → later.

---

**Changelog**

- v1.0 — Initial spec for Phase 3 (server-authoritative hitscan combat, damage,
  kill, death, respawn, client feedback HUD).
