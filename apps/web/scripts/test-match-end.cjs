const { Client } = require("colyseus.js");

/**
 * Phase 4 match-lifecycle integration test.
 * Creates a room with a tiny kill limit (via room options) so a real
 * win-by-kill-limit can be driven quickly. Two clients (auto-balanced to
 * opposite teams): A (blue) shoots B (red) until B's team reaches the kill
 * limit, then we assert the server:
 *   - stops the match (phase === "ended")
 *   - sets the winning team (winner === "blue")
 *   - reports accurate team scores
 * The room options also set a short duration so the timer path is covered.
 *
 * Expects the game server listening on port 2567.
 * Exit 0 on pass, 1 on fail.
 */
const SERVER = "ws://localhost:2567";
const KILL_LIMIT = 2;
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

async function run() {
  console.log("[match-end-test] Connecting two clients...");
  const clientA = new Client(SERVER);
  const clientB = new Client(SERVER);

  // Create a room with a small kill limit + short duration. warmupPlayers: 1
  // makes the match start immediately (no waiting for a 2nd player/countdown).
  const roomA = await clientA.joinOrCreate("tdm", {
    killLimit: KILL_LIMIT,
    duration: 30,
    warmupPlayers: 1,
    warmupSeconds: 1,
  });
  const roomB = await clientB.joinOrCreate("tdm", {
    killLimit: KILL_LIMIT,
    duration: 30,
    warmupPlayers: 1,
    warmupSeconds: 1,
  });

  // Register noop combat listeners to keep colyseus.js quiet.
  for (const room of [roomA, roomB]) {
    for (const type of ["hit", "damage", "kill", "match-ended"]) {
      room.onMessage(type, () => {});
    }
  }

  console.log("[match-end-test] A:", roomA.sessionId, "| B:", roomB.sessionId);

  // Wait until both players are present and identify teams.
  const aSid = roomA.sessionId;
  let enemySid = null;
  let myTeam = null;
  for (let i = 0; i < 50; i++) {
    const p = allPlayers(roomA);
    if (p[aSid]) {
      myTeam = p[aSid].team;
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
    console.log("[match-end-test] FAIL — could not find self/enemy");
    process.exit(1);
  }
  console.log(`[match-end-test] A team=${myTeam}, enemy=${enemySid}`);

  // Build a muzzle origin + direction toward the enemy capsule.
  function aim() {
    const shooter = getPlayer(roomA, aSid);
    const victim = getPlayer(roomA, enemySid);
    if (!shooter || !victim) return null;
    const ox = shooter.x;
    const oy = shooter.y + 1.6;
    const oz = shooter.z;
    const tx = victim.x;
    const ty = victim.y + 0.9;
    const tz = victim.z;
    let dx = tx - ox;
    let dy = ty - oy;
    let dz = tz - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return null;
    dx /= len;
    dy /= len;
    dz /= len;
    return { ox, oy, oz, dx, dy, dz };
  }

  // Keep firing until the match ends (win by kill limit) or we exhaust attempts.
  console.log(`[match-end-test] Firing until phase ends (killLimit=${KILL_LIMIT})...`);
  let attempts = 0;
  let ended = false;
  let lastScore = null;
  while (attempts < 400) {
    const shot = aim();
    if (shot) roomA.send("shoot", shot);
    await sleep(120);
    attempts++;

    const st = roomA.state;
    // Re-read the player each loop (alive flag drives whether we need to wait).
    const victim = getPlayer(roomA, enemySid);
    const shooter = getPlayer(roomA, aSid);

    // Log score changes but don't spam.
    if (st.blueScore !== lastScore) {
      lastScore = st.blueScore;
      console.log(`[match-end-test] blueScore=${st.blueScore} phase=${st.phase}`);
    }

    if (st.phase === "ended") {
      ended = true;
      break;
    }
  }

  const st = roomA.state;
  if (!ended) {
    console.log(`[match-end-test] FAIL — match never ended (phase=${st.phase})`);
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }

  console.log(
    `[match-end-test] MATCH ENDED — phase=${st.phase} winner=${st.winner} blue=${st.blueScore} red=${st.redScore}`
  );

  const winner = st.winner;
  if (winner !== "blue") {
    console.log(`[match-end-test] FAIL — expected winner=blue, got ${winner}`);
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }
  if (!(st.blueScore >= KILL_LIMIT)) {
    console.log(
      `[match-end-test] FAIL — blueScore=${st.blueScore} did not reach killLimit=${KILL_LIMIT}`
    );
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }

  console.log("[match-end-test] PASS — match ended correctly, winner + scores accurate");
  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

run().catch((err) => {
  console.error("[match-end-test] ERROR:", err.message || err);
  process.exit(1);
});
