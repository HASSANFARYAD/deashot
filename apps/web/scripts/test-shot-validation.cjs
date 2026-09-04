const { Client } = require("colyseus.js");

/**
 * Shot-validation regression test (audit P0-1).
 *
 * The server used to raycast from the origin the client put in the "shoot"
 * message and never checked it against the shooter's real position or facing.
 * A modified client could therefore place the ray beside any enemy's head and
 * land a guaranteed hit from anywhere on the map.
 *
 * Three cases, all fired by A at B:
 *
 *   1. AIM SPOOF     — A reports it is facing away, then fires a ray at B from
 *                      an origin next to B. Must do no damage.
 *   2. ORIGIN SPOOF  — A reports a facing that matches the direction it fires,
 *                      but spoofs the origin next to B. From A's real position
 *                      that direction misses B by ~4 m, so a server that
 *                      reconstructs the origin must do no damage.
 *   3. HONEST SHOT   — A faces B and fires truthfully. Must do damage, proving
 *                      validation did not simply break shooting.
 *
 * Expects the game server listening on port 2567.
 * Exit 0 on pass, 1 on fail.
 */
const SERVER = "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Eye height and fire interval must match packages/game-config. */
const EYE_HEIGHT = 1.6;
const FIRE_INTERVAL_MS = 110; // 600 RPM = 100 ms, plus margin.

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

/**
 * Yaw that produces the given horizontal direction under the project's camera
 * convention: look = (-sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)).
 */
function yawForDirection(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function fail(msg) {
  console.log(`[shot-validation] FAIL — ${msg}`);
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

/** Send `input` so the server records this facing, then fire `count` shots. */
async function fireBurst(room, { yaw, pitch, origin, dir, count }) {
  room.send("input", {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    yaw,
    pitch,
    shoot: false,
    reload: false,
  });
  // Let at least one 60 Hz tick apply the new facing before firing.
  await sleep(120);

  for (let i = 0; i < count; i++) {
    room.send("shoot", {
      ox: origin[0],
      oy: origin[1],
      oz: origin[2],
      dx: dir[0],
      dy: dir[1],
      dz: dir[2],
    });
    await sleep(FIRE_INTERVAL_MS);
  }
  await sleep(250);
}

async function run() {
  const clientA = new Client(SERVER);
  const clientB = new Client(SERVER);
  console.log("[shot-validation] Connecting two clients...");
  const roomA = await clientA.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
    _spawnA: { x: -5, y: 0, z: 25 },
    _spawnB: { x: 5, y: 0, z: 25 },
  });
  const roomB = await clientB.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
    _spawnA: { x: -5, y: 0, z: 25 },
    _spawnB: { x: 5, y: 0, z: 25 },
  });

  for (const room of [roomA, roomB]) {
    for (const type of ["hit", "damage", "kill"]) {
      room.onMessage(type, () => {});
    }
  }

  await sleep(500);

  const aSid = roomA.sessionId;
  const found = await waitFor(() => {
    const players = allPlayers(roomA);
    const self = players[aSid];
    if (!self) return null;
    const enemyTeam = self.team === "blue" ? "red" : "blue";
    for (const [sid, player] of Object.entries(players)) {
      if (player.team === enemyTeam) return { self, enemySid: sid, enemy: player };
    }
    return null;
  });
  if (!found) fail("could not find self and an enemy in the synced state");

  const { self, enemySid } = found;
  const inProgress = await waitFor(() => roomA.state.phase === "in-progress");
  if (!inProgress) fail(`room never reached in-progress (phase=${roomA.state.phase})`);

  const shooter = allPlayers(roomA)[aSid];
  const victim = allPlayers(roomA)[enemySid];
  console.log(
    `[shot-validation] A ${self.team} at (${shooter.x.toFixed(1)}, ${shooter.z.toFixed(1)}) | ` +
      `B ${victim.team} at (${victim.x.toFixed(1)}, ${victim.z.toFixed(1)}) hp=${victim.health}`
  );

  const healthOf = () => allPlayers(roomA)[enemySid]?.health;
  if (healthOf() !== 100) fail(`victim did not start at full health (${healthOf()})`);

  // Direction from A's real eye position straight at B's upper body.
  const toB = [victim.x - shooter.x, 0, victim.z - shooter.z];
  const toBLen = Math.hypot(toB[0], toB[2]);
  const atB = [toB[0] / toBLen, 0, toB[2] / toBLen];

  // An origin the cheat would claim: 1 m in front of B, at eye height.
  const beside = [
    victim.x - atB[0] * 1.0,
    EYE_HEIGHT,
    victim.z - atB[2] * 1.0,
  ];

  // ---- Case 1: aim spoof -------------------------------------------------
  // A reports facing the opposite way, then fires a ray at B anyway.
  console.log("[shot-validation] Case 1 — aim spoof (reported facing is 180 deg off)");
  await fireBurst(roomA, {
    yaw: yawForDirection(-atB[0], -atB[2]),
    pitch: 0,
    origin: beside,
    dir: atB,
    count: 5,
  });
  if (healthOf() !== 100) {
    fail(`aim-spoofed shots dealt damage (victim hp=${healthOf()}, expected 100)`);
  }
  console.log("[shot-validation]   OK — no damage (hp=100)");

  // ---- Case 2: origin spoof ---------------------------------------------
  // Facing matches the fired direction, so the aim check passes, but that
  // direction is angled ~5.7 deg off B. Over the ~40 m between A and B it
  // misses by about 4 m; from the spoofed origin 1 m out it would hit.
  console.log("[shot-validation] Case 2 — origin spoof (ray teleported next to victim)");
  const skewLen = Math.hypot(1, 0.1);
  const skewed = [
    (atB[0] - atB[2] * 0.1) / skewLen,
    0,
    (atB[2] + atB[0] * 0.1) / skewLen,
  ];
  await fireBurst(roomA, {
    yaw: yawForDirection(skewed[0], skewed[2]),
    pitch: 0,
    origin: beside,
    dir: skewed,
    count: 5,
  });
  if (healthOf() !== 100) {
    fail(`origin-spoofed shots dealt damage (victim hp=${healthOf()}, expected 100)`);
  }
  console.log("[shot-validation]   OK — no damage (hp=100)");

  // ---- Case 3: honest shot ----------------------------------------------
  console.log("[shot-validation] Case 3 — honest shot (must still deal damage)");
  await fireBurst(roomA, {
    yaw: yawForDirection(atB[0], atB[2]),
    pitch: 0,
    origin: [shooter.x, shooter.y + EYE_HEIGHT, shooter.z],
    dir: atB,
    count: 3,
  });
  const afterHonest = healthOf();
  if (!(afterHonest < 100)) {
    fail(`honest shots dealt no damage (victim hp=${afterHonest}) — validation is too strict`);
  }
  console.log(`[shot-validation]   OK — victim took damage (hp=${afterHonest})`);

  console.log(
    "[shot-validation] PASS — spoofed aim and spoofed origin rejected, honest fire lands"
  );
  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

run().catch((err) => {
  console.error("[shot-validation] ERROR", err);
  process.exit(1);
});
