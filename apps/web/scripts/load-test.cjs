const { Client } = require("colyseus.js");
const jwt = require("jsonwebtoken");

/**
 * Phase 7 load test.
 * Simulates N players joining a single TDM room over the real WebSocket, then
 * streams movement inputs for the test duration so the server-authoritative
 * simulation is actually loaded. Reports join latency, phase reached, and any
 * errors. Success = at least 2 players joined and nobody's connection errored.
 *
 * Usage:
 *   node scripts/load-test.cjs [--players 8] [--seconds 20] [--url ws://127.0.0.1:2567]
 *
 * With REQUIRE_AUTH on the target server (production posture), pass
 *   --jwt-secret <secret>
 * to sign guest tokens locally, matching what the API issues (JWT_SECRET is
 * shared by API and game server). Omit it for the local tokenless server.
 *
 * Exit 0 on pass, 1 on fail.
 */
const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const PLAYERS = Number(get("--players", "8"));
const SECONDS = Number(get("--seconds", "20"));
const SERVER = get("--url", "ws://127.0.0.1:2567");
const JWT_SECRET = get("--jwt-secret", "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(
    `[load] ${PLAYERS} players, ${SECONDS}s, ${SERVER}` + (JWT_SECRET ? " (authenticated)" : " (tokenless)")
  );

  const rooms = [];
  const connectTimes = [];
  const errors = [];

  for (let i = 0; i < PLAYERS; i++) {
    const client = new Client(SERVER);
    if (JWT_SECRET) {
      client.auth.token = jwt.sign(
        { username: `load${i}`, guest: true, sub: `guest-load-${i}` },
        JWT_SECRET,
        { expiresIn: "12h" }
      );
    }
    const t0 = Date.now();
    try {
      const room = await client.joinOrCreate("tdm", {});
      connectTimes.push(Date.now() - t0);
      room.onError((_code, msg) => errors.push(`player ${i} room error: ${msg}`));
      rooms.push(room);
    } catch (err) {
      errors.push(`player ${i} join failed: ${err.message}`);
    }
  }

  if (rooms.length < 2) {
    console.log("[load] RESULT: FAIL — fewer than 2 successful joins");
    console.log(errors.join("\n"));
    process.exit(1);
  }

  // Stream inputs until the run ends and report observed phases.
  const stopAt = Date.now() + SECONDS * 1000;
  const phases = new Map();
  let sequence = 0;
  while (Date.now() < stopAt) {
    for (const r of rooms) {
      r.send("input", {
        sequence,
        tick: 0,
        forward: true,
        backward: false,
        left: sequence % 2 === 0,
        right: sequence % 2 === 1,
        jump: sequence % 40 === 0,
        yaw: Math.random(),
        pitch: 0.1,
        shoot: false,
        reload: false,
      });
    }
    sequence++;
    await sleep(50);
  }

  for (const r of rooms) {
    if (r.state && r.state.phase) phases.set(r.state.phase, (phases.get(r.state.phase) || 0) + 1);
  }

  const avgConnect = Math.round(connectTimes.reduce((a, b) => a + b, 0) / connectTimes.length);
  console.log(`[load] joins: ${rooms.length}/${PLAYERS}, avg connect: ${avgConnect}ms`);
  console.log(`[load] phases observed: ${[...phases.entries()].map(([p, n]) => `${p}(${n})`).join(", ")}`);
  console.log("[load] errors:", errors.length ? errors.join(" | ") : "none");

  for (const r of rooms) r.leave();
  const ok = errors.length === 0;
  console.log("[load] RESULT:", ok ? "PASS" : "FAIL — see errors above");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[load] FATAL:", e.message);
  process.exit(1);
});