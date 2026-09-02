# 0001 — Game Design

**Status:** Implemented | **Version:** 1.1 | **Owner:** @HASSANFARYAD

## Overview

Deashot is a server-authoritative browser FPS in the style of Deadshot.io.
The end goal is a competitive 8-player Team Deathmatch experience that runs
at 60 FPS with fair, server-authoritative gameplay.

## End goal

- 8 players, 2 teams of 4 (blue / red)
- 1 arena map with 3 lanes, cover objects, and clear spawn areas
- 1 assault rifle (hitscan, 30-round magazine, 600 RPM)
- Score is displayed live; first to 50 kills or highest score at 10 minutes wins
- Leaderboard persisted server-side; player identity via guest tokens

## Match rules

- **Mode:** Team Deathmatch
- **Duration:** 600 seconds (`MATCH_DURATION` in `packages/shared/src/constants.ts`)
- **Win condition:** first team to `KILL_LIMIT` (50) wins; if time expires, highest score wins
- **Spawning:** team-specific spawn points; respawn after a 3-second delay (`RESPAWN_DELAY`)
- **Match phases:** `waiting` → `in-progress` → `ended`; auto-starts when enough players join

## Weapon: Assault Rifle

| Stat | Value | Source |
|---|---|---|
| Damage | 25 | `ASSAULT_RIFLE.stats.damage` |
| Headshot multiplier | 2x | `ASSAULT_RIFLE.stats.headMultiplier` |
| Fire rate | 600 RPM | `ASSAULT_RIFLE.stats.fireRate` |
| Magazine size | 30 | `ASSAULT_RIFLE.stats.magazineSize` |
| Reload time | 2.1 s | `ASSAULT_RIFLE.stats.reloadTime` |
| Range | 200 m | `ASSAULT_RIFLE.stats.range` |
| Spread | 0.02 rad | `ASSAULT_RIFLE.stats.spread` |

Headshots are detected by dot product > 0.85 between the shot ray and the vector
from the hit point to the victim's head bone position (server-side).

## Player physics

| Constant | Value | Source |
|---|---|---|
| Move speed | 6.5 m/s | `PLAYER_SPEED` |
| Aim speed factor | 65% | `PLAYER_AIM_SPEED_FACTOR` |
| Jump velocity | 4.8 m/s | `PLAYER_JUMP_VELOCITY` |
| Gravity | –14 m/s² | `GRAVITY` |
| Player height | 1.8 m | `PLAYER_HEIGHT` |
| Player radius | 0.4 m | `PLAYER_RADIUS` |
| Eye height | 1.6 m | `EYE_HEIGHT` |
| Max health | 100 HP | `PLAYER_MAX_HEALTH` |

## Input model

Client sends a `PlayerInput` snapshot each tick (30 Hz) containing: movement buttons,
camera yaw/pitch, shoot and reload flags. Server processes inputs in simulation order.
Client and server both apply physics from the same inputs for deterministic prediction.

## Non-goals (v1)

- No vehicles, abilities, or grenades in v1
- No matchmaking queue; players join a public lobby directly
- No voice chat or real-time text chat in v1
- No paid cosmetics

---

**Changelog**

- v1.1 — Phase 2: corrected match end phase name (`ended`, not `finished`)
- v1.0 — Initial spec (Phase 0 planning)