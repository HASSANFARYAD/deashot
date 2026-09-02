const { Client } = require("colyseus.js");

async function run() {
  const clientA = new Client("ws://localhost:2567");
  console.log("[test] Connecting client A...");
  const roomA = await clientA.joinOrCreate("tdm");
  console.log("[test] Client A joined room:", roomA.id, "session:", roomA.sessionId);

  const clientB = new Client("ws://localhost:2567");
  console.log("[test] Connecting client B...");
  const roomB = await clientB.joinOrCreate("tdm");
  console.log("[test] Client B joined room:", roomB.id, "session:", roomB.sessionId);

  const sameRoom = roomA.id === roomB.id;
  console.log("[test] Both clients in same room:", sameRoom ? "YES" : "NO");

  // Send an input from A and verify state syncs.
  roomA.send("input", {
    sequence: 1,
    tick: 0,
    forward: true,
    backward: false,
    left: false,
    right: false,
    jump: false,
    yaw: 0.5,
    pitch: 0.1,
    shoot: false,
    reload: false,
  });

  await new Promise((r) => setTimeout(r, 600));

  const stateA = roomA.state;
  const playerCount = stateA.players ? Object.keys(stateA.players).length : 0;
  console.log("[test] Player count in room:", playerCount);
  console.log("[test] Phase:", stateA.phase);

  const success = sameRoom && playerCount >= 2;
  console.log("[test] RESULT:", success ? "PASS - two clients joined same room" : "FAIL");

  await roomA.leave();
  await roomB.leave();
  process.exit(success ? 0 : 1);
}

run().catch((err) => {
  console.error("[test] ERROR:", err.message || err);
  process.exit(1);
});