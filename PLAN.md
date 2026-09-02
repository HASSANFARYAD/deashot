# Deadshot-like Browser FPS — Development Plan

> Server-authoritative browser FPS. MVP: 8 players shooting each other at stable 60 FPS with acceptable latency.

---

## Table of Contents

1. [MVP Scope](#1-mvp-scope)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Networking Model](#5-networking-model)
6. [Development Phases](#6-development-phases)
7. [Phase Gates](#7-phase-gates)
8. [Performance Targets](#8-performance-targets)
9. [Asset Strategy](#9-asset-strategy)
10. [Anti-Cheat Principles](#10-anti-cheat-principles)

---

## 1. MVP Scope

### Build in v0.1

- 1 map (3-lane symmetrical)
- 1 game mode: Team Deathmatch
- 2 teams
- 1 weapon: assault rifle (hitscan)
- 8-player maximum
- WASD movement + mouse look
- Shooting + reload
- Health system
- Head/body hit detection
- Death + respawn
- Score tracking
- 5–10 minute matches
- Basic lobby
- Basic scoreboard
- Guest login

### Do not build yet

- Skins, shop, XP, ranked, clans, friends
- Voice chat, mobile controls, battle pass
- 10 weapons, 10 maps
- Matchmaking queue (use direct room join for MVP)
- Account system beyond guest

---

## 2. Tech Stack

| Component             | Technology              |
| --------------------- | ----------------------- |
| 3D Engine             | Three.js                |
| Language              | TypeScript (everywhere) |
| Physics               | Rapier.js               |
| Client                | React + Three.js        |
| Networking            | WebSocket (ws)          |
| Multiplayer Framework | Colyseus                |
| Game Server           | Node.js                 |
| API                   | Fastify                 |
| Database              | PostgreSQL              |
| Cache                 | Redis                   |
| Authentication        | JWT (guest initially)   |
| Build                 | Vite                    |
| 3D Assets             | Blender → GLTF          |
| Deployment            | Docker                  |
| Reverse Proxy         | Nginx / Cloudflare      |
| Monitoring            | Sentry                  |
| Package Manager       | pnpm                    |
| Monorepo Tool         | Turborepo               |

---

## 3. Architecture

```
                         INTERNET
                            │
                    ┌───────▼───────┐
                    │    Cloudflare │
                    └───────┬───────┘
                            │
                ┌───────────▼───────────┐
                │       API Server      │
                │      Fastify/Node     │
                └───────────┬───────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        PostgreSQL        Redis       Game Servers
                                      (Colyseus)
                                      │
                                      │ WebSocket
                                      │
                       ┌──────────────▼──────────────┐
                       │          BROWSER             │
                       │                              │
                       │  React (UI layer)            │
                       │  ├── Lobby                   │
                       │  ├── HUD                     │
                       │  └── Scoreboard              │
                       │                              │
                       │  Three.js (rendering layer)  │
                       │  ├── Renderer                │
                       │  ├── World                   │
                       │  ├── Camera                  │
                       │  ├── Weapons                 │
                       │  └── Players                 │
                       │                              │
                       │  Game Engine (logic layer)   │
                       │  ├── Input                   │
                       │  ├── Movement                │
                       │  ├── Prediction              │
                       │  └── Interpolation           │
                       └──────────────────────────────┘
```

### Responsibility split

**React owns:**
- Menu, lobby, HUD, scoreboard, settings, loading screens

**Three.js owns:**
- World, camera, players, weapons, particles, lighting, animation

**Game engine owns:**
- Input, movement, shooting, client prediction, interpolation, state reconciliation

**Server owns:**
- All authoritative state: position, velocity, health, ammo, weapon, fire rate, reload, team, alive, kills, deaths, score, match timer

---

## 4. Monorepo Structure

```
deashot/
│
├── apps/
│   │
│   ├── web/                          # React + Three.js client
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── App.tsx
│   │   │   │   └── routes.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Home/
│   │   │   │   ├── Lobby/
│   │   │   │   ├── Game/
│   │   │   │   └── Results/
│   │   │   ├── components/
│   │   │   │   ├── HUD/
│   │   │   │   ├── Crosshair/
│   │   │   │   ├── HealthBar/
│   │   │   │   ├── KillFeed/
│   │   │   │   ├── Scoreboard/
│   │   │   │   └── Lobby/
│   │   │   ├── game/
│   │   │   │   ├── Game.ts
│   │   │   │   ├── GameLoop.ts
│   │   │   │   ├── GameState.ts
│   │   │   │   ├── camera/
│   │   │   │   │   └── FPSCamera.ts
│   │   │   │   ├── input/
│   │   │   │   │   ├── KeyboardInput.ts
│   │   │   │   │   └── MouseInput.ts
│   │   │   │   ├── player/
│   │   │   │   │   ├── LocalPlayer.ts
│   │   │   │   │   ├── RemotePlayer.ts
│   │   │   │   │   └── PlayerController.ts
│   │   │   │   ├── weapons/
│   │   │   │   │   ├── Weapon.ts
│   │   │   │   │   └── AssaultRifle.ts
│   │   │   │   ├── world/
│   │   │   │   │   ├── Map.ts
│   │   │   │   │   ├── SpawnPoint.ts
│   │   │   │   │   └── CollisionWorld.ts
│   │   │   │   ├── effects/
│   │   │   │   │   ├── MuzzleFlash.ts
│   │   │   │   │   ├── BulletImpact.ts
│   │   │   │   │   └── BloodEffect.ts
│   │   │   │   └── networking/
│   │   │   │       ├── GameSocket.ts
│   │   │   │       ├── ClientPrediction.ts
│   │   │   │       └── Interpolation.ts
│   │   │   ├── assets/
│   │   │   │   ├── maps/
│   │   │   │   ├── weapons/
│   │   │   │   ├── characters/
│   │   │   │   └── sounds/
│   │   │   └── main.tsx
│   │   └── package.json
│   │
│   ├── api/                          # Fastify REST API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   └── game-server/                  # Colyseus game server
│       ├── src/
│       │   ├── rooms/
│       │   │   └── TeamDeathmatchRoom.ts
│       │   ├── simulation/
│       │   │   ├── GameSimulation.ts
│       │   │   ├── PlayerSimulation.ts
│       │   │   ├── WeaponSimulation.ts
│       │   │   └── CombatSimulation.ts
│       │   ├── physics/
│       │   │   ├── PhysicsWorld.ts
│       │   │   └── HitDetection.ts
│       │   ├── matchmaking/
│       │   │   └── Matchmaker.ts
│       │   └── server.ts
│       └── package.json
│
├── packages/
│   ├── shared/                       # Shared types, constants, protocol
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   ├── weapons/
│   │   │   └── protocol/
│   │   └── package.json
│   ├── game-config/                  # Weapon stats, map config, tuning
│   │   └── src/
│   └── math/                         # Shared math utilities
│       └── src/
│
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── docker-compose.yml
│
├── assets/
│   ├── source/                       # Blender files
│   └── processed/                    # GLTF exports
│
├── docs/
│   ├── architecture.md
│   ├── networking.md
│   └── game-design.md
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 5. Networking Model

### Client sends input, not position

```typescript
// Client sends this every tick
interface PlayerInput {
  sequence: number;
  tick: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  yaw: number;
  pitch: number;
  shoot: boolean;
  reload: boolean;
}
```

### Server simulates and broadcasts state

```
Client ──INPUT──► Server ──STATE SNAPSHOT──► All Clients
```

### Server tick loop (60 Hz)

```
┌──────────────────┐
│   Read Inputs    │
└───────┬──────────┘
        ▼
┌──────────────────┐
│     Movement     │
└───────┬──────────┘
        ▼
┌──────────────────┐
│     Physics      │
└───────┬──────────┘
        ▼
┌──────────────────┐
│     Combat       │
└───────┬──────────┘
        ▼
┌──────────────────┐
│   Update State   │
└───────┬──────────┘
        ▼
┌──────────────────┐
│    Broadcast     │
└──────────────────┘
```

### Client prediction

```
Keyboard ──► Local simulation ──► Immediate movement (responsive)
       └──► Server ──► Authoritative state ──► Reconcile if wrong
```

On server disagreement: correct position, replay unacknowledged inputs.

### Remote player interpolation

Render between snapshots A and B with linear interpolation. Never snap to latest position directly.

### Shooting (hitscan)

```
Mouse click
    │
    ▼
Client: ray from camera, instant muzzle flash, send SHOOT event
    │
    ▼
Server: validate → raycast → hit? → damage → death? → score → broadcast
```

Server validates: weapon fire rate, player alive, ammo available, shot possible.

---

## 6. Development Phases

### Phase 0 — Foundation

**Goal:** Project boots. Browser connects to server over WebSocket.

**Steps:**

- [ ] Initialize pnpm monorepo with `pnpm-workspace.yaml`
- [ ] Configure Turborepo (`turbo.json`)
- [ ] Create `packages/shared` with TypeScript config
- [ ] Define shared protocol types (PlayerInput, PlayerState, MatchState)
- [ ] Define shared constants (tick rate, max players, movement speed)
- [ ] Define weapon config data (assault rifle stats)
- [ ] Create `apps/web` with Vite + React + TypeScript
- [ ] Verify Three.js renders a blank scene in the browser
- [ ] Create `apps/game-server` with Colyseus + Node.js
- [ ] Create `apps/api` with Fastify
- [ ] Set up Docker Compose (PostgreSQL + Redis + game-server)
- [ ] Verify WebSocket connection: browser connects to Colyseus room
- [ ] Two browser tabs connect to the same room and see each other's session ID

**Deliverable:** Two browser tabs connect to the same Colyseus room.

---

### Phase 1 — FPS Sandbox (Offline)

**Goal:** One player can move and shoot in a 3D world locally. No networking needed yet.

**Steps:**

- [ ] Three.js scene with renderer, camera, lighting
- [ ] Pointer lock API integration
- [ ] FPS camera (mouse look with yaw/pitch)
- [ ] WASD movement with acceleration/deceleration
- [ ] Gravity and jumping
- [ ] Basic collision detection (Rapier or simple AABB)
- [ ] Simple ground plane + walls (placeholder geometry)
- [ ] Load basic map (GLTF or procedural boxes)
- [ ] Weapon model visible in first person
- [ ] Crosshair overlay (React component)
- [ ] Shooting: raycast from camera center
- [ ] Muzzle flash effect on shoot
- [ ] Bullet impact particle on hit surface
- [ ] Ammo system (30 round magazine)
- [ ] Reload animation + timer
- [ ] HUD: health bar, ammo counter
- [ ] Game loop running at 60 FPS with `requestAnimationFrame`

**Deliverable:** A playable offline FPS sandbox. WASD, mouse look, shoot, reload, health display.

**Gate:** Stable 60 FPS. Movement feels responsive. Shooting feels correct.

---

### Phase 2 — Multiplayer Movement

**Goal:** Multiple players connect, move around the same map, and see each other smoothly.

**Steps:**

- [ ] Colyseus room with game state schema (positions, rotations)
- [ ] Server tick loop at 60 Hz
- [ ] Client sends input every tick (forward, backward, left, right, jump, yaw, pitch)
- [ ] Server processes input, updates position authoritatively
- [ ] Server broadcasts state snapshots to all clients
- [ ] Client renders remote players from server state
- [ ] Remote player interpolation (smooth between snapshots)
- [ ] Client prediction for local player movement
- [ ] Server reconciliation: correct local player when server disagrees
- [ ] Handle player join (spawn at team spawn point)
- [ ] Handle player disconnect (remove from room)
- [ ] Camera rotation sent to server but rendered locally
- [ ] Spawn points: team A (top), team B (bottom)
- [ ] Test with 2 players → 4 players → 8 players

**Deliverable:** 8 players connect, move around the map, see each other smoothly, no rubberbanding.

**Gate:** 8 concurrent players with smooth movement. No visible desync. Client prediction feels instant.

---

### Phase 3 — Combat

**Goal:** Players can shoot each other, deal damage, die, and respawn. All server-authoritative.

**Steps:**

- [ ] Weapon state on server (ammo, fire rate, reload timer, last fire time)
- [ ] Client sends shoot event with timestamp + camera direction
- [ ] Server validates: alive? fire rate ok? ammo available?
- [ ] Server performs hitscan raycast against all players
- [ ] Hit detection: body hit = weapon damage, head hit = damage × headMultiplier
- [ ] Server applies damage, updates health
- [ ] Server broadcasts damage event to all clients
- [ ] Client shows hit marker on successful hit
- [ ] Client shows damage indicator (direction of incoming damage)
- [ ] Death: health reaches 0
- [ ] Server marks player as dead, broadcasts death event
- [ ] Kill feed: "PlayerA killed PlayerB (headshot)"
- [ ] Respawn timer (3-5 seconds)
- [ ] Respawn at team spawn point with full health and ammo
- [ ] Weapon config data-driven (damage, fire rate, magazine, reload time, spread, headMultiplier)

**Deliverable:** Two players can shoot each other, see hit markers, take damage, die, respawn. All server-authoritative.

**Gate:** No client-side damage calculation. Server validates everything. Feels responsive despite network latency.

---

### Phase 4 — Team Deathmatch

**Goal:** Full TDM game loop with teams, scoring, match timer, and win condition.

**Steps:**

- [ ] Team assignment on join (auto-balance: blue vs red)
- [ ] Team-colored player models or indicators
- [ ] Score tracking: team kills
- [ ] Scoreboard UI (React): player name, kills, deaths, ping, team
- [ ] Match timer (5-10 minutes configurable)
- [ ] Win condition: first to 50 kills OR timer expires (highest score wins)
- [ ] Match end: freeze input, show final scoreboard
- [ ] Match state transitions: Waiting → Warmup → InProgress → Ended
- [ ] Kill event includes killer, victim, weapon, headshot flag
- [ ] Friendly fire: off (don't damage teammates)
- [ ] Kill attribution (assist system is optional, skip for now)

**Deliverable:** Complete TDM match flow. 8 players, 2 teams, scoring, timer, win condition.

**Gate:** Match starts, plays for configured duration, ends correctly. Scores are accurate.

---

### Phase 5 — Lobby & Match Flow

**Goal:** End-to-end user flow from browser load to match results.

**Steps:**

- [ ] Home page (React): "Play" button
- [ ] Guest login: generate random username, JWT token
- [ ] Create/join room UI (list of available rooms or "Quick Play")
- [ ] Match lobby: show connected players, team assignment, ready check
- [ ] Countdown: 3, 2, 1, GO
- [ ] Loading screen with map name and tips
- [ ] In-game HUD: health, ammo, score, timer, kill feed, crosshair
- [ ] Pause menu (ESC): resume, settings, leave match
- [ ] Match end screen: final scores, MVP highlight, "Play Again" button
- [ ] Basic settings: mouse sensitivity, volume, crosshair color
- [ ] Route navigation: Home → Lobby → Game → Results → Home

**Deliverable:** Complete user flow. Player clicks Play, joins match, plays, sees results, can play again.

**Gate:** A new user can go from opening the browser to finishing a match with zero documentation.

---

### Phase 6 — Polish & Feel

**Goal:** The game feels good to play. Not just functional, but enjoyable.

**Steps:**

- [ ] Weapon recoil pattern (visual + mechanical)
- [ ] Weapon bob while walking
- [ ] Camera shake on damage
- [ ] Footstep sounds (positional audio)
- [ ] Gunshot sounds
- [ ] Hit sound (satisfying feedback)
- [ ] Death sound
- [ ] Ambient map sounds
- [ ] Muzzle flash improvements (dynamic light)
- [ ] Bullet tracer visual (optional, for feel)
- [ ] Blood/hit particle on body hit
- [ ] Wall impact dust on miss
- [ ] Improved player model (capsule → low-poly humanoid)
- [ ] Map improvements (better geometry, textures, lighting)
- [ ] Smooth camera transitions (spawn, death, respawn)
- [ ] Damage direction indicator (red arc)
- [ ] Kill cam or death spectate (optional)
- [ ] Better crosshair (dynamic spread indicator)
- [ ] Performance profiling and optimization pass

**Deliverable:** Game feels responsive, looks decent, sounds give feedback.

**Gate:** Playtest session. Does it feel good? Is 60 FPS maintained? Any feel issues?

---

### Phase 7 — Infrastructure & Deployment

**Goal:** Deploy to production. Accessible via public URL.

**Steps:**

- [ ] Dockerfile for web (Nginx serving static build)
- [ ] Dockerfile for game-server (Node.js)
- [ ] Dockerfile for API (Node.js)
- [ ] Docker Compose: web + game-server + API + PostgreSQL + Redis
- [ ] Nginx reverse proxy config
- [ ] SSL/TLS via Cloudflare or Let's Encrypt
- [ ] Environment variable management
- [ ] Database migrations (Prisma or Drizzle)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Sentry error tracking integration
- [ ] Basic monitoring (health checks, uptime)
- [ ] Load testing: 8, 16, 24 concurrent players
- [ ] Deploy to VPS or cloud provider

**Deliverable:** Game accessible at a public URL. Multiple players can connect from different machines.

**Gate:** 8 players from different machines connect and play a full match without crashes.

---

## 7. Phase Gates

**Rule: Do not start the next phase until the current phase passes its gate.**

| Phase | Gate Criteria |
|-------|---------------|
| 0 — Foundation | Two browser tabs connect to same Colyseus room |
| 1 — FPS Sandbox | Stable 60 FPS, responsive movement, correct shooting |
| 2 — Multiplayer | 8 players, smooth interpolation, no desync |
| 3 — Combat | Server-authoritative damage, hit detection, death, respawn |
| 4 — TDM | Full match lifecycle with scoring and win condition |
| 5 — Lobby | Zero-doc user flow from browser open to match end |
| 6 — Polish | Playtest passes, feels good, performance holds |
| 7 — Deployment | Public URL, 8 players from different machines |

---

## 8. Performance Targets

### Client

- 60 FPS target (< 16.6ms frame time)
- Memory: < 512MB browser tab
- Assets: < 50MB initial load

### Network

- Input send rate: 30–60 Hz
- Server simulation: 60 Hz
- State broadcast: 20–30 Hz
- Target latency: < 100ms round-trip

### Server

- 8 players per room
- 60 Hz tick without dropped frames
- Memory: < 256MB per game room
- Horizontal scaling: multiple game server instances

---

## 9. Asset Strategy

### MVP assets (low-poly, fast to produce)

- **Map:** Simple geometry (boxes, planes), baked lighting, GLTF
- **Characters:** Low-poly capsule or basic humanoid mesh
- **Weapon:** Simple rifle model, GLTF
- **Materials:** Flat or slightly textured, no PBR for MVP
- **Sounds:** Royalty-free placeholders

### Pipeline

```
Blender (model)
    ↓
Export GLTF
    ↓
Optimize (gltf-transform)
    ↓
Load in Three.js (GLTFLoader)
```

Performance > graphical fidelity for MVP.

---

## 10. Anti-Cheat Principles

### Server-authoritative rules (always)

- Never trust client for: damage, health, position, ammo, fire rate, kills
- Server validates every action before applying it
- Server is the single source of truth for all game state

### Client-side protections (design now, implement later)

- Input validation (rate limiting, bounds checking)
- Movement anomaly detection (speed hacks, teleport)
- Fire rate validation (impossible shoot frequency)
- Position sanity checks (out of bounds, through walls)
- Packet validation (malformed input rejection)

---

## 11. Weapon Configuration (Data-Driven)

```typescript
// packages/game-config/src/weapons.ts
interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  headMultiplier: number;
  fireRate: number;        // rounds per minute
  magazineSize: number;
  reloadTime: number;      // seconds
  range: number;           // meters
  spread: number;          // radians
  recoil: {
    vertical: number;
    horizontal: number;
  };
}

const ASSAULT_RIFLE: WeaponConfig = {
  id: "ar",
  name: "Assault Rifle",
  damage: 25,
  headMultiplier: 2,
  fireRate: 600,
  magazineSize: 30,
  reloadTime: 2.1,
  range: 200,
  spread: 0.02,
  recoil: {
    vertical: 0.03,
    horizontal: 0.01,
  },
};
```

New weapons = new config entries + optional behavior hooks. Not new systems.

---

## 12. First Map Layout

```
             ┌───────────────────┐
             │                   │
             │     SPAWN A       │
             │       │           │
             │       ▼           │
       ┌─────┴───────────────────┴─────┐
       │                               │
       │       CENTRAL AREA            │
       │                               │
       │    ┌────────┐  ┌────────┐     │
       │    │ COVER  │  │ COVER  │     │
       │    └────────┘  └────────┘     │
       │                               │
       └─────┬───────────────────┬─────┘
             │       ▲           │
             │       │           │
             │     SPAWN B       │
             │                   │
             └───────────────────┘

Three lanes: LEFT ─ CENTER ─ RIGHT
```

Symmetrical. Simple. Enough for 8-player TDM.

---

## 13. Database Schema (MVP)

```sql
-- Minimal tables for MVP
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE player_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  kills INT DEFAULT 0,
  deaths INT DEFAULT 0,
  matches INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map VARCHAR(64) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
```

No inventory, purchases, battle pass, or progression tables yet.

---

## 14. Key Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Rendering | Three.js (raw, not React Three Fiber) | Full control over render loop, performance |
| UI | React (outside canvas) | Fast iteration, familiar patterns |
| Networking | WebSocket via Colyseus | Room management, state sync, reconnection |
| Combat | Hitscan (not projectiles) | Simpler, no projectile physics, instant feedback |
| Physics | Rapier.js | Fast, Rust-based WASM, good for collision |
| State | Colyseus Schema | Automatic sync, delta compression |
| Auth | JWT guest tokens | Minimal friction, upgrade to real accounts later |
| Database | PostgreSQL | Reliable, good for stats and match history |
| Cache | Redis | Matchmaking queue, sessions, room registry |

---

## What NOT to build

- ❌ Unity WebGL or Unreal (overkill)
- ❌ Firebase Realtime DB (wrong abstraction for game sim)
- ❌ REST for gameplay (use WebSocket)
- ❌ Client-authoritative combat (security hole)
- ❌ Matchmaking queue (use direct room join for MVP)
- ❌ Skins, shop, XP, ranked, clans (distractions)

---

*This plan is the single source of truth. Work through phases sequentially. Each phase gate must pass before proceeding.*
