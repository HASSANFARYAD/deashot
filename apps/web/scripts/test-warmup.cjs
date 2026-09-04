const { Client } = require("colyseus.js");

/**
 * Phase 5 lobby/warmup integration test.
 * Creates a TDM room with `warmupPlayers: 2` so the room must sit in `warmup`
 * until two players join, then run a 3-2-1-GO countdown before `in-progress`.
 * One client joins → asserts phase stays `warmup`. A second client joins →
 * asserts the room eventually transitions `warmup → in-progress` and that a
 * non-zero `countdown` was observed, confirming both the countdown and the
 * authoritative hold on combat are wired.
 *
 * Expects the game server listening on port 2567.
 * Exit 0 on pass, 1 on fail.
 */
const SERVER = "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function phaseOf(room) {
  return room.state ? room.state.phase : null;
}

function countdownOf(room) {
  return room.state ? room.state.countdown : 0;
}

async function run() {
  // A single client creates the room (one player present → still warmup).
  const clientA = new Client(SERVER);
  const roomA = await clientA.joinOrCreate("tdm", {
    warmupPlayers: 2,
    warmupSeconds: 3,
  });
  roomA.onMessage("countdown", () => {});
  roomA.onMessage("countdown-start", () => {});

  // Give the loop a tick; with only one player it must NOT leave warmup.
  await sleep(500);
  const soloPhase = phaseOf(roomA);
  if (soloPhase !== "warmup") {
    console.log(`[warmup-test] FAIL — expected phase=warmup with 1 player, got ${soloPhase}`);
    await roomA.leave();
    process.exit(1);
  }
  console.log(`[warmup-test] Single player held in warnup (phase=${soloPhase})`);

  // Second client joins the same room → hits the threshold → countdown starts.
  const clientB = new Client(SERVER);
  const roomB = await clientB.joinOrCreate("tdm", {
    warmupPlayers: 2,
    warmupSeconds: 3,
  });
  roomB.onMessage("countdown", () => {});
  roomB.onMessage("countdown-start", () => {});
  console.log("[warmup-test] B joined:", roomB.sessionId);

  // Watch for a countdown value and eventual in-progress transition.
  let sawCountdown = false;
  let reachedInProgress = false;
  for (let i = 0; i < 60; i++) {
    const c = countdownOf(roomA);
    const ph = phaseOf(roomA);
    if (c > 0) sawCountdown = true;
    if (ph === "in-progress") {
      reachedInProgress = true;
      break;
    }
    await sleep(100);
  }

  if (!reachedInProgress) {
    console.log(`[warmup-test] FAIL — never reached in-progress (phase=${phaseOf(roomA)})`);
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }
  if (!sawCountdown) {
    console.log("[warmup-test] FAIL — countdown never observed");
    await roomA.leave();
    await roomB.leave();
    process.exit(1);
  }

  console.log(
    `[warmup-test] PASS — warmup (${soloPhase}) → countdown (` +
      `${sawCountdown}) → in-progress (${phaseOf(roomA)})`
  );
  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

run().catch((err) => {
  console.error("[warmup-test] ERROR:", err.message || err);
  process.exit(1);
});
