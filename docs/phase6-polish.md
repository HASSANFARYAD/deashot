# Phase 6 — Polish & Feel (Execution Guide)

> **Branch:** `feat/phase6-polish`
> **Plan reference:** `PLAN.md` §6 Phase 6, §8 Performance Targets
> **Specs to update:** continue existing specs as needed (see [Specs table](#appendix-specs-and-keys-to-update)); no new spec required unless a behaviour/interface change is made.
> **Gate:** Playtest — does it feel good? Is 60 FPS maintained with 8 players?

This document is the shared context for any agent working on Phase 6.
Read the whole thing before writing code. It tells you **what** to build,
**where** each change lives, and **how** (step by step) to implement and verify it.

---

## 1. Goal & Gate

**Goal:** The game feels good to play — not just functional, but enjoyable.
Responsive feedback, sound, satisfying combat feel, and a solid frame rate.

**Gate (from PLAN.md):** Playtest session. Does it feel good? Is 60 FPS
maintained? Any feel issues? Deliverable: "Game feels responsive, looks decent,
sounds give feedback."

Per AGENTS.md this is a `feat/` branch, merged to `main` via PR only when the
gate passes and CI is green. `main` is branch-protected: PR-only, CI required,
no direct push / force-push / deletion.

---

## 2. Current State (what already exists on `main`)

This is the real, verified state — do not assume anything else exists.

### Shared packages
- **`packages/game-config`** — the single source of truth for tuning.
  - `src/map.ts` — `MAP_BOUNDS`, `MAP_SPAWNS`, `AABBCollider`, `MAP_COLLIDERS` (15 AABBs).
  - `src/collision.ts` — `raycastAABB()`, `resolveAABB()` (shared client+server).
  - `src/player.ts` — `PLAYER_MAX_HEALTH=100`, `PLAYER_HEIGHT=1.8`, `PLAYER_RADIUS=0.4`,
    `PLAYER_SPEED`, `PLAYER_AIM_SPEED_FACTOR` (0.65), `PLAYER_ACCELERATION`,
    `PLAYER_FRICTION`, `PLAYER_JUMP_VELOCITY`, `GRAVITY`, `EYE_HEIGHT=1.6`, `PITCH_LIMIT`.
  - `src/weapons.ts` — `ASSAULT_RIFLE.stats`: damage 25, headMultiplier 2, fireRate 600,
    magazineSize 30, reloadTime 2.1, range 200, spread 0.02.
  - `src/combat.ts` — `SHOT_AIM_TOLERANCE`, `SHOT_ORIGIN_TOLERANCE`, etc.
- **`packages/shared`** — `src/constants.ts` (`SERVER_SNAPSHOT_RATE`, `CLIENT_INPUT_RATE`, ...),
  `src/protocol/*` (input + state types). Nothing audio/feel-specific exists yet.

### Web client (`apps/web`) — files you will touch
- `src/game/systems/Effects.ts` — particle pool (muzzle flash, bullet impact +
  sparks, tracer). Each effect is a `Particle` and fades over lifetime.
- `src/game/systems/Weapon.ts` — client hitscan for offline feel/display. Has
  muzzle flash timer, simple `recoilOffset`, ADS lerp, bob is **not** implemented.
  `raycast()` tests ground + all `MAP_COLLIDERS`.
- `src/game/systems/PlayerController.ts` — local player physics (AABB via
  `CollisionWorld.resolve`). **No camera shake / footstep logic.**
- `src/game/systems/FPSCamera.ts` — FPS camera. Base FOV 75, AIM FOV 45, FOV lerp.
  **No recoil kick, no head-bob, no shake.**
- `src/game/systems/RemotePlayers.ts` — renders remote players as colored boxes
  with a health bar, interpolated from snapshots. **No hit-flash / damage flash.**
- `src/game/systems/InputManager.ts` — keyboard/mouse state.
- `src/game/GameEngine.ts` — game loop (`loop()`), wiring. Effects update here.
- `src/game/Game.ts` + `src/pages/GamePage.tsx` — React wiring. Already has
  `hitMarker`, `damageIndicator`, `killFeed` React state driven by
  `onHit` / `onDamage` / `onKill` socket callbacks.
- `src/components/HUD/*.tsx` — `HUD`, `Crosshair` (static), `HitMarker` (X overlay),
  `DamageIndicator` (full-screen red border flash + centered "-N HEADSHOT" text),
  `KillFeed`, `HealthBar`, `AmmoDisplay`, `Scoreboard`, `PauseMenu`, `Lobby`.

### Server (`apps/game-server`)
- `src/rooms/TeamDeathmatchRoom.ts` — authoritative simulation: movement, combat,
  spawns, TDM scoring, warmup/countdown. Emits `hit`, `damage`, `kill`, `match-ended`
  messages. **Audio/shake cannot live here** (no client rendering) — all feel
  feedback originates on the client from these events.
- `src/config.ts` — env flag parsing (`ALLOW_TEST_ROOM_OPTIONS`, `REQUIRE_AUTH`, ...).

---

## 3. Key architectural facts you must respect

1. **Server-authoritative combat.** The server decides damage/death. The client
   **never** calculates damage. All feel feedback is *triggered by server events*
   (`onHit` = I landed a hit, `onDamage` = I got hit, `onKill` = someone died).
2. **Audio has no server component.** Sounds play on the client. Volume/pan can
   use remote player world positions from `RemotePlayers`.
3. **Tuning constants belong in `packages/game-config`** (per AGENTS.md), NOT
   hardcoded in `apps/web`. New data-driven values (recoil pattern, shake
   magnitude, sound volumes, spread) go in a new `packages/game-config/src/feel.ts`
   and are exported from its `src/index.ts`.
4. **2-space indent, no semicolons** (enforced by editor; keep consistent). No
   `any` unless unavoidable + documented. No global `isFinite`/`isNaN` — use
   `Number.isFinite`/`Number.isNaN`.
5. **Do not add real assets without approval** (AGENTS.md asset policy). Use
   generated/procedural geometry and Web Audio API (synthesized or royalty-free
   files committed locally — no external URLs).
6. **The Effects system is a particle pool.** Every effect is pushed onto
   `this.particles` with a lifetime and removed when it expires. Reuse it for new
   one-shot visuals (blood, dust, impact sparks).

---

## 4. Recommended implementation order (how to sequence work)

Work in small, independent, verifiable slices — one branch each or logical
commits on the Phase 6 branch. Each slice ends with the full toolchain green
(typecheck, build, unit, lint, integration) and a manual smoke check. Strongly
recommended order (highest feel-impact per effort first):

1. **Slice A — Combat feedback visuals** (hit marker on enemy, blood on body hit,
   wall dust on miss, damage direction arc). Already partially present; complete
   + fix the gaps.
2. **Slice B — Camera/weapon feel** (camera kick/recoil, weapon bob while
   walking, dynamic crosshair spread). All client-side in `FPSCamera`/`Weapon`.
3. **Slice C — Audio** (gunshot, boom/impact, footstep, hit, death, ambient;
   positional pan for remote sounds).
4. **Slice D — Visual polish** (muzzle flash dynamic light improvement, damage
   flash on remote player models).
5. **Slice E — Performance profiling pass** (confirm 60 FPS @ 8 players; fix any
   regressions; document results). **Do this throughout, gate at the end.**

Each slice below is fully specified. Do NOT skip Slice E — it is the gate.

---

## 5. Slice A — Combat Feedback Visuals

### 5.1 Hit marker on landing a hit (mostly exists — verify)
- **Where:** `apps/web/src/pages/GamePage.tsx` `handleHit` + `HitMarker.tsx`.
- Already wired: `onHit` sets `hitMarker` active for 150ms, `HitMarker` renders X
  (white body / red headshot). **Verify it works; nothing to build unless broken.**
- Optional improvement: add a small "hit confirmation" flash/damage number at the
  crosshair (like a weak "hitmarker sound" cue is audio — Slice C).

### 5.2 Blood/hit particle on body hit
- **Problem:** you can *only* see hit markers on your own UI; there is no visible
  effect **on the enemy** when you hit them.
- **Where:** `apps/web/src/game/systems/Effects.ts` (add a `bloodImpact()` method)
  and `apps/web/src/game/systems/RemotePlayers.ts` (a `hitFlash()` method) and
  `apps/web/src/game/GameEngine.ts` (`wireSocket`).
- **How:**
  1. In `Effects.ts` add `bloodImpact(point, normal)` — spawn several red
     particles (reuse the spark pattern but color `0xaa1122`, longer lifetime ~0.4s).
  2. In `RemotePlayers.ts` add a method to flash a hit rim or briefly tint the
     body material red on the target group. Keep a `hitFlashUntil` timestamp on the
     entry; set body material emissive high for ~150–200ms. It must be
     per-entry (multiple hit targets).
  3. In `GameEngine.ts` `wireSocket`, extend `callbacks.onHit`:
     - Already forwards to `this.callbacks.onHit`.
     - Add: if `event.victimId` is a **remote** player, call `this.remote.hitFlash(event.victimId)`
       and `this.effects.bloodImpact` at that remote player's position. If you
       want a fly-in blood particle at the hit point you need the remote player's
       world position (available via `this.remote` internal mesh position).
  4. Because damage numbers + blood need to be visible even when you did NOT fire,
     the `onDamage` path (you get shot) stays UI-only; the `onHit` path (you shot)
     drives the 3D blood on the target.

### 5.3 Wall dust on miss
- **Problem:** hitting a wall already spawns orange impact sparks in
  `Effects.bulletImpact` (called from `Weapon.update` `onHit`). A **miss** (ray
  passes through to far point) calls `_onMiss` which currently does nothing.
- **Where:** `apps/web/src/game/systems/Weapon.ts` `update()` — the `_onMiss`
  callback at the `else` branch (~line 169). `apps/web/src/game/GameEngine.ts` — the
  `() => {}` miss callback passed to `weapon.update` (~line 328).
- **How:** in `GameEngine.ts`, make the miss callback call
  `this.effects.bulletImpact(farPoint, upNormal)` (reuse existing impact/dust) — or
  add a lighter `wallDust()` variant. Use ground-normal `(0,1,0)` since hitscan
  misses typically point at the far sky/ground. Keep it subtle.

### 5.4 Damage direction indicator (red arc pointing at attacker)
- **Problem:** current `DamageIndicator` is a full-screen red border flash with no
  directional information. You can't tell *where* the shot came from.
- **Where:** `apps/web/src/components/HUD/DamageIndicator.tsx` + `GamePage.tsx` +
  `apps/web/src/game/GameEngine.ts` (supply attacker direction).
- **How:**
  1. The server `damage` event (`ServerDamageEvent` in `GameSocket.ts`) already
     carries `attackerId` but **not** attacker position. You have two options:
     - **(A, recommended — no server change):** look up the attacker's world
       position from `RemotePlayers`/snapshot in `GameEngine` when `onDamage`
       fires, compute bearing from the local camera yaw, and pass an angle (0–360°,
       0 = in front) into the React state via the existing `onDamage` callback.
     - (B) Add attacker position to the server damage message — requires a spec +
       server change; only if you truly need server-truth of position.
  2. In `GameEngine.ts` `wireSocket` `callbacks.onDamage`, compute the relative
     bearing: `angle = atan2(attacker.x - self.x, attacker.z - self.z) - cameraYaw`,
     normalize to [0, 2π). Store it on the damage event you forward (extend
     `ServerDamageEvent` with an optional `bearing?: number` field on the client
     side only — do not add to the wire protocol unless you do option B).
  3. In `GamePage.tsx`, add `bearing` to `damageIndicator` React state.
  4. In `DamageIndicator.tsx`, render an SVG arc/arrow positioned by `bearing`
     (rotate a wedge or a set of arrows around the crosshair center pointing toward
     the attacker), plus keep the amount text. Remove or soften the full-screen
     border flash.

### 5.5 Verify Slice A
- `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test:unit`,
  `pnpm test:integration` all green.
- Manual: `pnpm dev:web` (offline) + shoot wall (dust), shoot nothing (miss), and
  with two online players verify the enemy flashes red + blood appears when hit,
  and the direction arc points at the shooter.

---

## 6. Slice B — Camera & Weapon Feel

### 6.1 Camera kick / recoil screen shake
- **Problem:** `Weapon.recoilOffset` only nudges the gun model; the camera does
  not kick and there is no damage shake.
- **Where:** `apps/web/src/game/systems/FPSCamera.ts` (add kick/shake state +
  methods), `apps/web/src/game/systems/Weapon.ts` (call a camera callback on
  fire), `apps/web/src/game/systems/PlayerController.ts` (minor), `GameEngine.ts`
  (wire + apply), `GameEngine.ts` `onDamage` (shake on getting hit).
- **How:**
  1. Add recoil constants to `packages/game-config/src/feel.ts` (see Appendix):
     e.g. `RECOIL_PITCH = 0.008`, `RECOIL_YAW = 0.003`, `SHAKE_DAMAGE = 0.06`,
     `SHAKE_FIRE = 0.015`.
  2. `FPSCamera`: add private `recoilYaw/pitch` and `shake` state with a decay
     each `update()`. Add `addKick(pitch, yaw)` and `addShake(amount)` public
     methods. Apply them to the camera rotation after the mouse look in
     `update()`, decaying toward 0 (multiply by `Math.exp(-dt * k)`).
  3. `Weapon.update()`: when firing (`input.shoot && canFire`), call a new
     optional camera-kick callback parameter, or have `Weapon` return the kick in
     the shoot event. Cleanest: add a `onKick?: (pitch, yaw) => void` param and
     call it with `RECOIL_PITCH/RECOIL_YAW`. Also remove the model-only
     `recoilOffset` if fully replaced by camera kick (keep a tiny model nudge for
     visual).
  4. `GameEngine.ts`: pass `onKick` from `Weapon.update` to
     `this.camera.addKick(...)`. In `callbacks.onDamage`, call
     `this.camera.addShake(SHAKE_DAMAGE)`.
- **Tuning note:** keep kick small so aiming stays usable; test at 600 RPM.

### 6.2 Weapon bob while walking
- **Problem:** gun is static at rest except ADS/recoil.
- **Where:** `apps/web/src/game/systems/Weapon.ts` (in `update()`), driven by
  `PlayerController` velocity.
- **How:**
  1. In `Weapon.update()`, add a `moveState` input (forward speed + grounded
     boolean) to the signature (or read from `PlayerController` via a getter).
  2. Compute a bob phase from cumulative distance walked: `bobPhase += hSpeed * dt * BOB_FREQ`.
  3. Apply modelled bob: `group.position.x = baseX + sin(bobPhase) * BOB_AMP`,
     `group.position.y = baseY + abs(cos(bobPhase)) * BOB_AMP`. Only bob when
     grounded + moving. Suppress while ADS.
  4. Add `BOB_FREQ`/`BOB_AMP` to `feel.ts`.

### 6.3 Dynamic crosshair spread
- **Problem:** `Crosshair` is a static shape.
- **Where:** `apps/web/src/components/HUD/Crosshair.tsx` + `GamePage.tsx` + a
  spread value from `Weapon`/`PlayerController`.
- **How:**
  1. Expose a `getSpread()` on `Weapon` → combination of `stats.spread`, current
     movement speed, ADS factor, and whether firing.
  2. Include `spread` in the `GameState` emitted by `GameEngine.emitState`
     (from `weapon.getState()`).
  3. `Crosshair.tsx` accepts a `spread` prop and expands the gap between the four
     tick marks proportional to it (CSS transform on each arm, or SVG).
  4. `HUD` passes `spread` through.

### 6.4 Verify Slice B
- Same toolchain + manual. Fire: camera pitches up and recovers. Walk: gun bobs.
  Aim (ADS): bob suppressed + crosshair tightens. Get shot: camera shakes.

---

## 7. Slice C — Audio

### 7.1 Audio system design
- **Where:** new `apps/web/src/game/systems/AudioManager.ts` + wire in
  `GameEngine.ts` + `GamePage.tsx` (mute/settings) + `packages/game-config/src/feel.ts`.
- **How:**
  1. Create a singleton `AudioManager` wrapping the **Web Audio API**.
     - Lazily create `AudioContext` on first user gesture (pointer lock click) to
       satisfy autoplay policies.
     - Own one master gain, plus buses (SFX, ambient). Provide `play(name, opts)`
       where `opts` includes `volume`, `rate`, `pan` (StereoPannerNode: -1..1).
  2. **Sounds available now:** synthesize short envelopes (Web Audio oscillators +
       noise buffers) for gunshot, hit, impact, footstep, death, headshot, reload.
       Do NOT import external sound files without approval (AGENTS.md).
  3. Hook points in `GameEngine.ts`:
     - `Weapon.update` fire path → `gunshot` (via `onKick`/shoot callback).
     - `Effects.bulletImpact` → `impact` (dust/wall). Add a hook or call audio in
       the same place `bulletImpact` is invoked.
     - `callbacks.onHit` → `hit` sound (short, satisfying).
     - `callbacks.onDamage` → `damage`/`hit` (player hurt) + headshot variant.
     - `callbacks.onKill` → `death`/`kill`.
     - reload start/complete → `reload` (in `Weapon`).
     - footstep → in `PlayerController.update` when grounded + moving, throttled
       by `FOOTSTEP_INTERVAL`.
  4. **Positional pan** for remote sounds (optional): compute `(remotePlayerWorldX - localX)`
     and feed `StereoPanner.pan`. Wire via `RemotePlayers` positions.
- **Volume/settings:** add a master volume to `ProfileSettings` (PauseMenu already
  exists — see `apps/web/src/settings/api.ts` + `PauseMenu.tsx`) and pass it into
  `AudioManager`. Add a mute toggle if desired.

### 7.2 Verify Slice C
- Toolchain green. Manual: shoot (gunshot), footsteps while moving, hit marker
  sound, damage sound on screen flash, kill sound on killfeed. Use two online
  tabs to confirm remote gunshots pan.

---

## 8. Slice D — Visual Polish

### 8.1 Better muzzle flash (dynamic light)
- **Where:** `apps/web/src/game/systems/Effects.ts` + `Weapon.ts`.
- **How:**
  1. `Weapon` already has a `muzzlePoint` `THREE.PointLight` added to the gun
     group; it pulses intensity on fire. Improve:
     - Add a reusable flash **sprite/quad** facing the camera at the muzzle plus
       a brief light spike (intensity 0→HIGH→0 over ~40–80ms). Keep it cheap.
     - Reuse the particle pool so the flash is parented correctly and fades.
- **Tuning:** flash duration ~0.05s, light intensity tune so it's visible but not
  blinding at 600 RPM.

### 8.2 Damage flash on remote player models
- **Where:** `apps/web/src/game/systems/RemotePlayers.ts` (add hit-flash
  handling) — already described in 5.2. Expand: when any remote player takes
  damage, briefly tint their body toward red. Drive it from `callbacks.onDamage`
  when `targetId` is a remote player (server already sends per-victim damage).
- **How:** add a `hitFlash(sessionId, amount)` used by both your own hit (5.2) and
  incoming damage on others. Body material `emissive` intensity spikes then decays
  in `updateFrame`.

### 8.3 Verify Slice D
- Toolchain + manual: muzzle flash looks lively; remote players flash red when
  damaged by anyone.

---

## 9. Slice E — Performance Profiling & 60 FPS Gate

- **Where:** `apps/web/src/game/GameEngine.ts` (FPS counter already exists in
  `loop()` via `this.fps`), plus a debug overlay/toggle.
- **How:**
  1. Confirm the existing FPS counter (`GameEngine.getFPS()`) is accurate and
     reachable for profiling (it is exposed on `window.__deashotEngine`).
  2. Add a lightweight on-screen FPS readout (dev only) to measure during a real
     8-player match. Throttle DOM writes (don't re-render React every frame — use a
     250ms interval or a single `requestAnimationFrame`-driven div).
  3. Profile hotspots: draw calls, particle counts (`Effects.update`), remote
     player count, shadow map cost. Keep particle pool bounded (cap total
     particles, e.g. 200–400). Reduce `antialias`/pixel ratio if needed.
  4. **Gate check:** sustain 60 FPS (< 16.6ms frame time) with 8 players, no
     long hitches. Memory < 512MB, no unbounded growth (leaks: ensure
     `dispose()` removes all particles/timers/audio nodes).
- **Regression watch:** every preceding slice must not regress FPS. Profile after
  each slice if a change is heavy (audio, particles).

---

## 10. What NOT to do (scope guardrails)

- ❌ No client-side damage calculation — keep server authoritative.
- ❌ No real art assets / external URLs without explicit approval (AGENTS.md).
  Procedural geometry + Web Audio only for `main`.
- ❌ No physics engine swap (e.g. Rapier) — AABB in `packages/game-config` is
  already the source of truth and the server uses it. Don't introduce a divergent
  client physics.
- ❌ Don't put tuning constants in `apps/web` — they belong in
  `packages/game-config/src/feel.ts` (exported).
- ❌ Don't forget the AGENTS.md spec-first rule: if you change behaviour or a
  wire/interface, update the matching spec + changelog in the same PR.
- ❌ Don't modify `TeamDeathmatchRoom.ts` for feel features — it only sends the
  events (`hit`/`damage`/`kill`) the client already receives. Add server code only
  if a *behavioural* change is required (e.g. new event field), and then update
  `specifications/0005-combat.md`.

---

## 11. Verification checklist (run before merge)

For a web change, the manual smoke checklist (AGENTS.md) must pass, plus:

- [ ] Hit marker shows on landing a hit (headshot = red).
- [ ] Blood particles appear on the enemy when you hit them.
- [ ] Wall dust appears when you shoot a wall; far-point "miss" doesn't crash.
- [ ] Damage direction arc points at the shooter when you take damage.
- [ ] Camera kicks up on fire and recovers; camera shakes on taking damage.
- [ ] Weapon bobs while walking (suppressed when ADS/grounded-still).
- [ ] Dynamic crosshair spread tightens when ADS, widens when moving/firing.
- [ ] Sounds: gunshot, hit, damage, kill, footstep, reload all audible; no
      autoplay-block errors in console; remote shots pan.
- [ ] Muzzle flash light reads well at 600 RPM; remote players flash red on damage.
- [ ] 60 FPS sustained @ 8 players (Slice E gate).
- [ ] `pnpm lint` → 0 errors (warnings only for pre-existing `any`), `pnpm typecheck`,
      `pnpm build`, `pnpm test:unit`, `pnpm test:integration` all green.

---

## Appendix: Specs and keys to update

- **`packages/game-config/src/feel.ts`** (NEW) — export all Phase 6 tuning:
  `RECOIL_PITCH`, `RECOIL_YAW`, `SHAKE_FIRE`, `SHAKE_DAMAGE`, `BOB_FREQ`,
  `BOB_AMP`, `FOOTSTEP_INTERVAL`, `HIT_FLASH_DURATION`, `BLOOD_PARTICLE_COUNT`,
  `MUZZLE_FLASH_DURATION`, audio volumes/lifetimes. Add unit tests in
  `packages/game-config/src/config.test.ts` (or a `feel.test.ts`) validating the
  values are finite + sane ranges, per the unit-test table in AGENTS.md.
- **`packages/game-config/src/index.ts`** — add `export * from "./feel"`.
- **`specifications/0005-combat.md`** — if you add a `bearing`/position field to
  the `damage` wire message or change any combat feel on the server, bump the spec
  version + changelog. The hit/damage/kill events already exist; most of Slice A–D
  is client-only and needs **no** spec change.
- **`PLAN.md`** — tick off Phase 6 steps as they land (optional but recommended).

## Appendix: Exact file map (what lives where)

| Concern | File(s) |
|---|---|
| Feel tuning constants | `packages/game-config/src/feel.ts` (new) |
| Export feel constants | `packages/game-config/src/index.ts` |
| Muzzle flash / impact / blood / dust particles | `apps/web/src/game/systems/Effects.ts` |
| Weapon raycast, recoil callback, bob, spread | `apps/web/src/game/systems/Weapon.ts` |
| Camera kick / shake / FOV | `apps/web/src/game/systems/FPSCamera.ts` |
| Local player motion (footstep trigger) | `apps/web/src/game/systems/PlayerController.ts` |
| Remote player hit-flash + positions | `apps/web/src/game/systems/RemotePlayers.ts` |
| Audio context + playback | `apps/web/src/game/systems/AudioManager.ts` (new) |
| Game loop wiring (effects, camera, audio, events) | `apps/web/src/game/GameEngine.ts` |
| Socket event types (client-only bearing) | `apps/web/src/game/networking/GameSocket.ts` |
| UI state for hit/damage/spread | `apps/web/src/pages/GamePage.tsx` |
| HUD composition | `apps/web/src/components/HUD/HUD.tsx` |
| Hit marker overlay | `apps/web/src/components/HUD/HitMarker.tsx` |
| Damage direction arc | `apps/web/src/components/HUD/DamageIndicator.tsx` |
| Dynamic crosshair | `apps/web/src/components/HUD/Crosshair.tsx` |
| Volume settings UI | `apps/web/src/pages/GamePage.tsx`, `apps/web/src/components/HUD/PauseMenu.tsx`, `apps/web/src/settings/api.ts` |

*This guide is the shared context for Phase 6. Read it fully before coding, follow
the slices in order, and verify each slice against the checklist.*
