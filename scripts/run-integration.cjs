/**
 * Integration test runner.
 * Phase 1: starts the game server, runs the two-client Colyseus join test.
 * Phase 2: builds + serves the web app, runs the Playwright browser gate test.
 * Phase 3: server-authoritative combat test (damage, death, respawn via two
 *          Colyseus clients).
 * Phase 4: TDM match lifecycle test (win-by-kill-limit, match end, winner).
 * Phase 5: lobby/warmup test (warmup → countdown → in-progress).
 * Anti-cheat: server-side shot validation — spoofed aim and spoofed muzzle
 *          origin are rejected, honest fire still lands (audit P0-1).
 * Hardening: tokenless/forged joins rejected and client room options ignored
 *          when the test escape hatches are off (audit P0-4, P0-5); API
 *          usernames validated and guest login rate limited (P1-21, P1-22).
 * The browser gate test also starts the API (guest login) and the web preview.
 * Exit code = 0 if all phases pass, 1 otherwise.
 */
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER  = path.join(ROOT, "apps", "game-server", "dist", "index.js");
const API     = path.join(ROOT, "apps", "api", "dist", "index.js");
const COLYSEUS_TEST = path.join(ROOT, "apps", "web", "scripts", "test-colyseus.cjs");
const COMBAT_TEST   = path.join(ROOT, "apps", "web", "scripts", "test-combat.cjs");
const MATCH_END_TEST = path.join(ROOT, "apps", "web", "scripts", "test-match-end.cjs");
const WARMUP_TEST = path.join(ROOT, "apps", "web", "scripts", "test-warmup.cjs");
const SHOT_VALIDATION_TEST = path.join(ROOT, "apps", "web", "scripts", "test-shot-validation.cjs");
const AUTH_HARDENING_TEST = path.join(ROOT, "apps", "web", "scripts", "test-auth-hardening.cjs");
const API_HARDENING_TEST = path.join(ROOT, "apps", "web", "scripts", "test-api-hardening.cjs");
const BROWSER_TEST  = path.join(ROOT, "apps", "web", "scripts", "test-browser-gate.cjs");

const SERVER_PORT = 2567;
const API_PORT    = 4000;
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

/**
 * Refuse to start if something is already listening.
 *
 * `waitForPort` only proves *a* server answers, not that it is ours. A leaked
 * process from an earlier run therefore used to satisfy it, and the whole suite
 * would silently exercise a stale build — producing failures that look like
 * product bugs and are not reproducible.
 */
function assertPortFree(port, label) {
  return new Promise((resolve, reject) => {
    const probe = new net.Socket();
    probe.setTimeout(1000);
    const free = () => { probe.destroy(); resolve(); };
    probe.once("connect", () => {
      probe.destroy();
      reject(
        new Error(
          `Port ${port} is already in use, so the ${label} could not be started ` +
            `cleanly. A previous run probably leaked a process — stop it and retry.`
        )
      );
    });
    probe.once("timeout", free);
    probe.once("error", free);
    probe.connect(port, "127.0.0.1");
  });
}

/** Surface an early exit instead of letting waitForPort time out obscurely. */
function watchForEarlyExit(proc, label) {
  proc.once("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[integration] ${label} exited early with code ${code}`);
    }
  });
}

async function main() {
  let serverProc = null;
  let apiProc    = null;
  let webProc    = null;
  let failed     = false;

  try {
    // ===== Phase 1: Colyseus two-client join + movement sync =====
    console.log("[integration] Phase 1 — Colyseus two-client test");
    await assertPortFree(SERVER_PORT, "game server");
    serverProc = spawn(process.execPath, [SERVER], {
      cwd: path.join(ROOT, "apps", "game-server"),
      stdio: "ignore",
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        // These tests join with killLimit/warmup overrides and without a token.
        // Both are refused by default so a production deploy cannot be tuned or
        // entered by an anonymous client; the harness opts in explicitly.
        ALLOW_TEST_ROOM_OPTIONS: "1",
        REQUIRE_AUTH: "0",
        NODE_ENV: "test",
      },
    });
    watchForEarlyExit(serverProc, "game server");
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

    // ===== Phase 5: lobby/warmup test =====
    console.log("[integration] Phase 5 — warmup/countdown lobby test");
    execSync(`node "${WARMUP_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Phase 5 PASSED\n");

    // ===== Anti-cheat: server-side shot validation (audit P0-1) =====
    console.log("[integration] Anti-cheat — shot validation (spoofed aim/origin)");
    execSync(`node "${SHOT_VALIDATION_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Anti-cheat PASSED\n");

    // ===== Hardening: auth, room options, API input (P0-4, P0-5, P1-21/22) =====
    // Both start their own server on another port, because this one
    // deliberately runs with the test escape hatches enabled.
    console.log("[integration] Hardening — auth required, room options ignored");
    execSync(`node "${AUTH_HARDENING_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Hardening — API usernames validated, login rate limited");
    execSync(`node "${API_HARDENING_TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] Hardening PASSED\n");

    // ===== Phase 2: Playwright browser gate test =====
    console.log("[integration] Phase 2 — Playwright browser gate test");

    // The web app's guest login needs the API; start it on the default port.
    console.log(`[integration] Starting API on port ${API_PORT}...`);
    await assertPortFree(API_PORT, "API");
    apiProc = spawn(process.execPath, [API], {
      cwd: path.join(ROOT, "apps", "api"),
      stdio: "ignore",
      env: { ...process.env, PORT: String(API_PORT) },
    });
    watchForEarlyExit(apiProc, "API");
    await waitForPort(API_PORT);
    console.log("[integration] API ready on port " + API_PORT);

    // Ensure the web app is built.
    console.log("[integration] Building web app...");
    execSync("pnpm --filter web build", { cwd: ROOT, stdio: "inherit" });

    // Start a static file server for the built web app.
    console.log(`[integration] Starting web preview on port ${WEB_PORT}...`);
    await assertPortFree(WEB_PORT, "web preview");
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
    killProc(apiProc, "API");
    killProc(serverProc, "game server");
  }

  process.exitCode = failed ? 1 : 0;
}

main();
