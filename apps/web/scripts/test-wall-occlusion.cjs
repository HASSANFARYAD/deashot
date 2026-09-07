const { Client } = require("colyseus.js");

/**
 * Wall-occlusion regression test (audit P0-2).
 *
 * The server used to raycast only against player capsules, so shots fired
 * through a wall or cover block still dealt damage. After the shared collision
 * module landed, `handleShoot` raycasts against `MAP_COLLIDERS` first and
 * treats the nearest wall/cover hit as a hard occluder — a player hit that
 * sits farther than that wall is discarded.
 *
 * Two scenarios, run as separate rooms (spawn overrides are per-room):
 *
 *   1. BLOCKED    — A (blue) at (-5,0,0), B (red) at (5,0,0). The central
 *                   cover block spans x in [-2, 2], z in [-2, 2], y in [0, 2],
 *                   so the ray from A's eye to B's torso passes straight
 *                   through it. Shooting exactly at B must deal 0 damage.
 *   2. CLEAR LOS  — A (blue) at (-5,0,30), B (red) at (5,0,30). No collider
 *                   sits in that lane, so the same honest shot must land and
 *                   deal damage. This proves wall occlusion did not simply
 *                   break shooting (mirrors the anti-cheat "honest shot"
 *                   control).
 *
 * Both rooms aim honestly at the target (yaw/pitch reported to the server),
 * so only the presence of the blocking geometry differs between cases.
 *
 * Expects the game server listening on port 2567 with the test escape hatches
 * on (spawn overrides gated by ALLOW_TEST_ROOM_OPTIONS).
 * Exit 0 on pass, 1 on fail.
 */
const SERVER = "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EYE_HEIGHT = 1.6;
const FIRE_INTERVAL_MS = 110;

function allPlayers(room) {
  const out = {};
  const state = room.state;
  if (state && state.players) {
    for (const [sid, p] of state.players) {
      out[sid] = p;
    }
  }
  return out;
}

function fail(msg) {
  console.log(`[wall-occlusion] FAIL — ${msg}`);
  process.exit(1);
}

async function waitFor(predicate, attempts = 60, delay = 100) {
  for (let i = 0; i < attempts; i++) {
    const value = predicate();
    if (value) return value;
    await sleep(delay);
  }
  return null;
}

/**
 * Join both clients with the given spawn overrides; return { roomA, roomB,
 * aSid, enemySid } once the room is in-progress and both players are visible.
 */
async function joinScenario(spawnA, spawnB) {
  const clientA = new Client(SERVER);
  const clientB = new Client(SERVER);
  const roomA = await clientA.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
    _spawnA: spawnA,
    _spawnB: spawnB,
  });
  const roomB = await clientB.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
    _spawnA: spawnA,
    _spawnB: spawnB,
  });

  for (const room of [roomA, roomB]) {
    for (const type of ["hit", "damage", "kill"]) {
      room.onMessage(type, () => {});
    }
  }

  await sleep(500);

  const aSid = roomA.sessionId;
  const found = await waitFor(() => {
    const p = allPlayers(roomA);
    const self = p[aSid];
    if (!self) return null;
    const enemyTeam = self.team === "blue" ? "red" : "blue";
    for (const [sid, player] of Object.entries(p)) {
      if (player.team === enemyTeam) return { self, enemySid: sid };
    }
    return null;
  });
  if (!found) {
    roomA.leave();
    roomB.leave();
    fail("could not find self and an enemy in the synced state");
  }

  const inProgress = await waitFor(() => roomA.state.phase === "in-progress");
  if (!inProgress) {
    roomA.leave();
    roomB.leave();
    fail(`room never reached in-progress (phase=${roomA.state.phase})`);
  }

  return { roomA, roomB, aSid, enemySid: found.enemySid };
}

/**
 * Face B honestly, then fire `count` shots at B. Returns B's health afterward.
 * The muzzle origin and direction are reported truthfully; the server
 * reconstructs its own origin from authoritative state.
 */
async function shootAtV(room, aSid, enemySid, count) {
  const shootState = () => {
    const p = allPlayers(room);
    return { shooter: p[aSid], victim: p[enemySid] };
  };

  const { shooter, victim } = shootState();
  if (!shooter || !victim) return null;

  const ox = shooter.x;
  const oy = shooter.y + EYE_HEIGHT;
  const oz = shooter.z;
  const tx = victim.x;
  const ty = victim.y + 0.9; // capsule centre (PLAYER_HEIGHT / 2)
  const tz = victim.z;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const len = Math.hypot(dx, dy, dz);

  room.send("input", {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.asin(dy / len),
    shoot: false,
    reload: false,
  });
  // Let at least one 60 Hz tick apply the facing before firing.
  await sleep(120);

  for (let i = 0; i < count; i++) {
    room.send("shoot", { ox, oy, oz, dx: dx / len, dy: dy / len, dz: dz / len });
    await sleep(FIRE_INTERVAL_MS);
  }
  await sleep(300);

  const after = shootState();
  return after.victim ? after.victim.health : null;
}

async function run() {
  // ---- Scenario 1: blocked by the central cover block --------------------
  console.log("[wall-occlusion] Scenario 1 — central block occludes the line of sight");
  let { roomA, roomB, aSid, enemySid } = await joinScenario(
    { x: -5, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 }
  );

  let p = allPlayers(roomA);
  let shooter = p[aSid];
  let victim = p[enemySid];
  if (victim.health !== 100) {
    roomA.leave();
    roomB.leave();
    fail(`victim did not start at full health (${victim.health})`);
  }
  console.log(
    `[wall-occlusion]   A (${shooter.team}) at (${shooter.x.toFixed(1)}, ${shooter.z.toFixed(1)}) | ` +
      `B (${victim.team}) at (${victim.x.toFixed(1)}, ${victim.z.toFixed(1)}) hp=${victim.health}`
  );

  const blockedHealth = await shootAtV(roomA, aSid, enemySid, 5);
  if (blockedHealth !== 100) {
    roomA.leave();
    roomB.leave();
    fail(
      `shots fired through the central cover block dealt damage ` +
        `(victim hp=${blockedHealth}, expected 100)`
    );
  }
  console.log("[wall-occlusion]   OK — blocked shot dealt no damage (hp=100)");
  await roomA.leave();
  await roomB.leave();

  // ---- Scenario 2: clear lane control ------------------------------------
  console.log("[wall-occlusion] Scenario 2 — open lane (control, damage must land)");
  ({ roomA, roomB, aSid, enemySid } = await joinScenario(
    { x: -5, y: 0, z: 30 },
    { x: 5, y: 0, z: 30 }
  ));

  p = allPlayers(roomA);
  shooter = p[aSid];
  victim = p[enemySid];
  console.log(
    `[wall-occlusion]   A (${shooter.team}) at (${shooter.x.toFixed(1)}, ${shooter.z.toFixed(1)}) | ` +
      `B (${victim.team}) at (${victim.x.toFixed(1)}, ${victim.z.toFixed(1)}) hp=${victim.health}`
  );

  const clearHealth = await shootAtV(roomA, aSid, enemySid, 3);
  if (clearHealth === null || clearHealth >= 100) {
    roomA.leave();
    roomB.leave();
    fail(
      `honest shot down a clear lane dealt no damage ` +
        `(victim hp=${clearHealth}, expected < 100) — occlusion is too strict`
    );
  }
  console.log(`[wall-occlusion]   OK — clear-lane shot landed (hp=${clearHealth})`);
  await roomA.leave();
  await roomB.leave();

  console.log(
    "[wall-occlusion] PASS — wall/cover blocks shots, clear line-of-sight still deals damage"
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("[wall-occlusion] ERROR:", err.message || err);
  process.exit(1);
});
