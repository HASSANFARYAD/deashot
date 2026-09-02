/**
 * Integration test runner.
 * Starts the game server, runs the two-client Colyseus join test, then exits.
 * Exit code = 0 if the test passes, 1 otherwise.
 */
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "apps", "game-server", "dist", "index.js");
const TEST   = path.join(ROOT, "apps", "web", "scripts", "test-colyseus.cjs");
const PORT   = 2567;

function waitForPort(port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error("Server timed out"));
        setTimeout(check, 200);
      });
      s.connect(port, "127.0.0.1");
    };
    check();
  });
}

async function main() {
  console.log("[integration] Starting game server...");
  const server = spawn(process.execPath, [SERVER], {
    cwd: path.join(ROOT, "apps", "game-server"),
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT) },
  });

  try {
    await waitForPort(PORT);
    console.log("[integration] Server listening on port " + PORT);
    console.log("[integration] Running two-client Colyseus join test...");
    execSync(`node "${TEST}"`, { cwd: ROOT, stdio: "inherit" });
    console.log("[integration] PASSED");
  } catch (err) {
    console.error("[integration] FAILED:", err.message || err);
    process.exitCode = 1;
  } finally {
    console.log("[integration] Shutting down server (pid " + server.pid + ")...");
    server.kill("SIGTERM");
    server.unref();
  }
}

main();