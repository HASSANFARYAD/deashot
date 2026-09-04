const { Client } = require("colyseus.js");

/**
 * Phase 3 combat integration test.
 * Two Colyseus clients join the same room (auto-balanced to opposite teams:
 * first joiner = blue spawn x=-20, second = red spawn x=+20).
 * Client A fires hitscan shots directly at Client B's player capsule and we
 * assert B's health decreases (server-authoritative damage). Then we keep
 * firing until B dies and assert B goes alive=false then respawns alive=true.
 *
 * Expects the game server listening on port 2567.
 * Exit 0 on pass, 1 on fail.
 */
const SERVER = "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function getPlayer(room, sid) {
  return sid ? allPlayers(room)[sid] : null;
}

function phaseOf(room) {
  return room.state ? room.state.phase : null;
}

async function run() {
  const clientA = new Client(SERVER);
  const clientB = new Client(SERVER);
  console.log("[combat-test] Connecting two clients...");
  const roomA = await clientA.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
  });
  const roomB = await clientB.joinOrCreate("tdm", {
    warmupPlayers: 1,
    warmupSeconds: 1,
  });
  console.log("[combat-test] A:", roomA.sessionId, "| B:", roomB.sessionId);

  // Register noop handlers for combat broadcasts so colyseus.js logs nothing.
  for (const room of [roomA, roomB]) {
    for (const type of ["hit", "damage", "kill"]) {
      room.onMessage(type, () => {});
    }
  }

  // Allow server to auto-balance teams + settle state.
  await sleep(500);

  // Identify which team A ended up on from the synced state.
  const aSid = roomA.sessionId;
  let myTeam = null;
  let enemySid = null;
  for (let i = 0; i < 50; i++) {
    const p = allPlayers(roomA);
    const self = p[aSid];
    if (self) {
      myTeam = self.team;
      const enemyTeam = myTeam === "blue" ? "red" : "blue";
      for (const [sid, player] of Object.entries(p)) {
        if (player.team === enemyTeam) {
          enemySid = sid;
          break;
        }
      }
      if (enemySid) break;
    }
    await sleep(100);
  }
  if (!myTeam || !enemySid) {
    console.log(`[combat-test] FAIL — could not find self/enemy (team=${myTeam} enemy=${enemySid})`);
    process.exit(1);
  }
  const enemyTeam = myTeam === "blue" ? "red" : "blue";

  // Wait until both A and an enemy player are present in the synced state.
  let shooter = null;
  let victimStart = null;
  for (let i = 0; i < 50; i++) {
    const p = allPlayers(roomA);
    if (p[aSid] && p[enemySid]) {
      shooter = p[aSid];
      victimStart = p[enemySid];
      break;
    }
    await sleep(100);
  }
  if (!shooter || !victimStart) {
    console.log("[combat-test] FAIL — shooter or victim state missing");
    process.exit(1);
  }

  // Wait for the match to leave warmup/countdown and become playable.
  for (let i = 0; i < 50; i++) {
    if (phaseOf(roomA) === "in-progress") break;
    await sleep(100);
  }
  if (phaseOf(roomA) !== "in-progress") {
    console.log(
      `[combat-test] FAIL — room never reached in-progress (phase=${phaseOf(roomA)})`
    );
    process.exit(1);
  }

  // Build a muzzle origin at A's eye height and a direction toward the
  // victim's capsule center (y + PLAYER_HEIGHT/2 = 0.9).
  const ox = shooter.x;
  const oy = shooter.y + 1.6;
  const oz = shooter.z;

  const tx = victimStart.x;
  const ty = victimStart.y + 0.9;
  const tz = victimStart.z;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;

  console.log(
    `[combat-test] Shooter at (${ox.toFixed(2)}, ${oy.toFixed(2)}, ${oz.toFixed(2)}) | Victim at (${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}) | team=${myTeam} vs ${enemyTeam}`
  );

  // The server only accepts shots whose direction matches the yaw/pitch it last
  // received from this client (spec 0005 v1.1), so report the facing a real
  // client would be sending at 30 Hz while aiming here.
  const dirLen = Math.hypot(dx, dy, dz);
  const faceTarget = async () => {
    roomA.send("input", {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.asin(dy / dirLen),
      shoot: false,
      reload: false,
    });
    // Let at least one 60 Hz tick apply it.
    await sleep(120);
  };
  await faceTarget();

  // Check victim's starting health.
  const startHealth = victimStart.health;
  console.log(`[combat-test] Victim start health: ${startHealth}`);

  // Fire N shots (within fire rate ~600 RPM -> 0.1s apart) toward the victim.
  const SHOTS = 6;
  for (let i = 0; i < SHOTS; i++) {
    roomA.send("shoot", { ox, oy, oz, dx, dy, dz });
    await sleep(120);
  }

  // Allow server to process + broadcast.
  await sleep(600);

  const victimAfter = getPlayer(roomA, enemySid);
  const afterHealth = victimAfter ? victimAfter.health : startHealth;
  console.log(`[combat-test] Victim health after ${SHOTS} shots: ${afterHealth}`);

  const damaged = afterHealth < startHealth;
  if (!damaged) {
    console.log("[combat-test] FAIL — victim health did not decrease (no hit)");
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }

  console.log("[combat-test] PASS — server-authoritative damage applied");

  // -------- Death + respawn --------
  // If not already dead, keep firing until the victim dies.
  await faceTarget();
  let loops = 0;
  while (loops < 30) {
    const victimNow = getPlayer(roomA, enemySid);
    if (victimNow && victimNow.alive === false) break;
    roomA.send("shoot", { ox, oy, oz, dx, dy, dz });
    await sleep(120);
    loops++;
  }

  const dead = getPlayer(roomA, enemySid);
  const isDead = dead && dead.alive === false;
  if (!isDead) {
    console.log("[combat-test] FAIL — victim never died after repeated shots");
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }
  console.log("[combat-test] PASS — victim died (alive=false)");

  // Wait for respawn (RESPAWN_DELAY = 3s).
  await sleep(3200);
  const respawned = getPlayer(roomA, enemySid);
  const isAlive = respawned && respawned.alive === true;
  if (!isAlive) {
    console.log("[combat-test] FAIL — victim did not respawn alive");
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }
  console.log(
    `[combat-test] PASS — victim respawned alive with health ${respawned.health}`
  );

  // Wait for the timed auto-respawn path even if the loop exited early.
  console.log("[combat-test] ALL PASS — damage, death, respawn verified");
  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

run().catch((err) => {
  console.error("[combat-test] ERROR:", err.message || err);
  process.exit(1);
});
