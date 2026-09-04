const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Client } = require("colyseus.js");

/**
 * Auth and room-option hardening test (audit P0-4, P0-5).
 *
 * Unlike the other harnesses this one starts its *own* game server, because
 * the shared integration server deliberately runs with the test escape hatches
 * enabled. Here they are off, which is the production posture:
 *
 *   1. TOKENLESS JOIN  — rejected when REQUIRE_AUTH=1. Previously the server
 *                        minted a guest identity for any tokenless client, so
 *                        the JWT gate was effectively opt-in.
 *   2. FORGED TOKEN    — a token signed with the wrong secret is rejected.
 *   3. VALID TOKEN     — a properly signed token joins and its username is
 *                        server-trusted.
 *   4. ROOM OPTIONS    — `duration` sent in the join payload is ignored when
 *                        ALLOW_TEST_ROOM_OPTIONS is off. Previously any client
 *                        could pass `killLimit: 1` and win with a single kill.
 *
 * Exit 0 on pass, 1 on fail.
 */
const PORT = 2568;
const SERVER_ENTRY = path.join(
  __dirname, "..", "..", "..", "apps", "game-server", "dist", "index.js"
);
const SECRET = "test-secret-not-the-dev-fallback";
const MATCH_DURATION = 600; // packages/shared/src/constants.ts

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForPort(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error(`port ${port} timed out`));
        setTimeout(check, 200);
      });
      s.connect(port, "127.0.0.1");
    };
    check();
  });
}

let serverProc = null;
function shutdown() {
  if (serverProc && !serverProc.killed) serverProc.kill("SIGTERM");
}

function fail(msg) {
  console.log(`[auth-hardening] FAIL — ${msg}`);
  shutdown();
  process.exit(1);
}

async function run() {
  console.log(`[auth-hardening] Starting a hardened game server on :${PORT}...`);
  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: SECRET,
      REQUIRE_AUTH: "1",
      // Deliberately absent: ALLOW_TEST_ROOM_OPTIONS.
      ALLOW_TEST_ROOM_OPTIONS: "0",
      NODE_ENV: "test",
    },
  });
  await waitForPort(PORT);
  console.log("[auth-hardening] Server up.");

  const url = `ws://localhost:${PORT}`;

  // ---- Case 1: tokenless join is rejected --------------------------------
  console.log("[auth-hardening] Case 1 — join with no token");
  const anon = new Client(url);
  let anonJoined = false;
  try {
    await anon.joinOrCreate("tdm");
    anonJoined = true;
  } catch {
    // expected
  }
  if (anonJoined) fail("a client with no token was allowed to join");
  console.log("[auth-hardening]   OK — rejected");

  // ---- Case 2: token signed with the wrong secret is rejected ------------
  console.log("[auth-hardening] Case 2 — join with a forged token");
  const forged = new Client(url);
  forged.auth.token = jwt.sign(
    { username: "impostor", sub: "guest-forged" },
    "some-other-secret"
  );
  let forgedJoined = false;
  try {
    await forged.joinOrCreate("tdm");
    forgedJoined = true;
  } catch {
    // expected
  }
  if (forgedJoined) fail("a token signed with the wrong secret was accepted");
  console.log("[auth-hardening]   OK — rejected");

  // ---- Case 3: a valid token joins, identity is server-trusted -----------
  console.log("[auth-hardening] Case 3 — join with a valid token");
  const good = new Client(url);
  good.auth.token = jwt.sign(
    { username: "legit_player", sub: "guest-123", guest: true },
    SECRET
  );
  let room;
  try {
    room = await good.joinOrCreate("tdm", { duration: 5 });
  } catch (err) {
    fail(`a validly signed token was rejected: ${err && err.message}`);
  }
  for (const type of ["countdown", "countdown-start", "hit", "damage", "kill"]) {
    room.onMessage(type, () => {});
  }
  await sleep(600);

  const self = room.state.players.get(room.sessionId);
  if (!self) fail("joined but no player state was created");
  if (self.name !== "legit_player") {
    fail(`username not taken from the verified token (got "${self.name}")`);
  }
  console.log(`[auth-hardening]   OK — joined as "${self.name}"`);

  // ---- Case 4: client-supplied room tuning is ignored --------------------
  console.log("[auth-hardening] Case 4 — client-supplied `duration` must be ignored");
  const remaining = room.state.timeRemaining;
  if (remaining <= 10) {
    fail(
      `client override applied: timeRemaining=${remaining}, expected ~${MATCH_DURATION}`
    );
  }
  console.log(
    `[auth-hardening]   OK — timeRemaining=${remaining.toFixed(0)} (override ignored)`
  );

  console.log(
    "[auth-hardening] PASS — tokenless and forged joins rejected, valid token trusted, room options ignored"
  );
  await room.leave();
  shutdown();
  await sleep(200);
  process.exit(0);
}

run().catch((err) => {
  console.error("[auth-hardening] ERROR", err);
  shutdown();
  process.exit(1);
});
