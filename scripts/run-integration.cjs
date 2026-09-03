/**
 * Integration test runner.
 * Phase 1: starts the game server, runs the two-client Colyseus join test.
 * Phase 2: builds + serves the web app, runs the Playwright browser gate test.
 * Phase 3: server-authoritative combat test (damage, death, respawn via two
 *          Colyseus clients).
 * Phase 4: TDM match lifecycle test (win-by-kill-limit, match end, winner).
 * Exit code = 0 if all phases pass, 1 otherwise.
 */
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER  = path.join(ROOT, "apps", "game-server", "dist", "index.js");
const COLYSEUS_TEST = path.join(ROOT, "apps", "web", "scripts", "test-colyseus.cjs");
const COMBAT_TEST   = path.join(ROOT, "apps", "web", "scripts", "test-combat.cjs");
const MATCH_END_TEST = path.join(ROOT, "apps", "web", "scripts", "test-match-end.cjs");
const BROWSER_TEST  = path.join(ROOT, "apps", "web", "scripts", "test-browser-gate.cjs");
const WEB_DIST = path.join(ROOT, "apps", "web", "dist", "index.html");

const SERVER_PORT = 2567;
const WEB_PORT    = 4173;

function waitForPort(port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Port ${port} timed out`));
        setTimeout(check, 200);
      });
      s.connect(port, "127.0.0.1");
    };
    check();
  });
}

function killProc(proc, label) {
  if (!proc || proc.killed) return;
  console.log(`[integration] Stopping ${label} (pid ${proc.pid})...`);
  proc.kill("SIGTERM");
  proc.unref();
}

async function main() {
  let serverProc = null;
  let webProc    = null;
  let failed     = false;

  try {
    // ===== Phase 1: Colyseus two-client join + movement sync =====
    console.log("[integration] Phase 1 — Colyseus two-client test");
    serverProc = spawn(process.execPath, [SERVER], {
      cwd: path.join(ROOT, "apps", "game-server"),
      stdio: "ignore",
      env: { ...process.env, PORT: String(SERVER_PORT) },
    });
    await waitForPort(SERVER_PORT);
    console.log("[integration] Game server listening on port " + SERVER_PORT);
    console.log("[integration] Running two-client Colyseus join test...");
    execSync(`node "${COLYSEUS_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Phase 1 PASSED\n");

    // ===== Phase 3: server-authoritative combat test =====
    console.log("[integration] Phase 3 — combat test (damage/death/respawn)");
    execSync(`node "${COMBAT_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Phase 3 PASSED\n");

    // ===== Phase 4: TDM match lifecycle test =====
    console.log("[integration] Phase 4 — TDM match lifecycle test (win/end)");
    execSync(`node "${MATCH_END_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Phase 4 PASSED\n");

    // ===== Phase 2: Playwright browser gate test =====
    console.log("[integration] Phase 2 — Playwright browser gate test");

    // Ensure the web app is built.
    console.log("[integration] Building web app...");
    execSync("pnpm --filter web build", { cwd: ROOT, stdio: "inherit" });

    // Start a static file server for the built web app.
    console.log(`[integration] Starting web preview on port ${WEB_PORT}...`);
    const staticServer = path.join(ROOT, "scripts", "static-server.cjs");
    webProc = spawn(process.execPath, [staticServer, String(WEB_PORT)], {
      cwd: ROOT,
      stdio: "ignore",
    });
    await waitForPort(WEB_PORT);
    console.log("[integration] Web preview ready on port " + WEB_PORT);

    console.log("[integration] Running Playwright browser gate test...");
    execSync(
      `node "${BROWSER_TEST}" --port ${WEB_PORT}`,
      { cwd: ROOT, stdio: "inherit" }
    );
    console.log("[integration] Phase 2 PASSED\n");

    console.log("[integration] ALL TESTS PASSED");
  } catch (err) {
    console.error("[integration] FAILED:", err.message || err);
    failed = true;
  } finally {
    killProc(webProc, "web preview");
    killProc(serverProc, "game server");
  }

  process.exitCode = failed ? 1 : 0;
}

main();
