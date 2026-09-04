/**
 * Phase 2 browser gate test.
 *
 * Verifies (via Playwright) that:
 *   1. Two browser tabs can join the same Colyseus room.
 *   2. Each tab sees the other player's mesh.
 *   3. Movement in one tab is reflected in the other.
 *
 * Expects the game server to already be listening on port 2567 and
 * the web app to be served on the port given by --port (default 4173).
 *
 * Exit 0 on pass, 1 on fail.
 */
const { chromium } = require("playwright");

const PORT = Number(process.argv.find((_, i, a) => a[i - 1] === "--port") || 4173);
const APP_URL = `http://localhost:${PORT}`;
const MAX_WAIT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wait until __deashotEngine exists on window AND isConnected() is true. */
async function waitForEngine(page) {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const ok = await page
      .evaluate(() => {
        const e = window.__deashotEngine;
        return !!e && e.isConnected();
      })
      .catch(() => false);
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

async function getEngineInfo(page) {
  return page
    .evaluate(() => {
      const e = window.__deashotEngine;
      return e
        ? { local: e.getLocalPosition(), remote: e.getRemotePlayers() }
        : null;
    })
    .catch(() => null);
}

/** Find the remote player entry in `remotes` closest to `pos`. */
function closestEntry(remotes, pos) {
  let best = null;
  let bestDist = Infinity;
  for (const r of remotes) {
    const d =
      Math.abs(r.x - pos.x) +
      Math.abs(r.y - pos.y) +
      Math.abs(r.z - pos.z);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return { entry: best, dist: bestDist };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();

  console.log("[browser-test] Opening both tabs...");
  await pageA.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await pageB.goto(APP_URL, { waitUntil: "domcontentloaded" });

  // Click PLAY on both.
  await pageA.click("text=PLAY");
  await pageB.click("text=PLAY");

  // ---------- Phase 1: both connect ----------
  console.log("[browser-test] Waiting for both to connect...");
  const aConnected = await waitForEngine(pageA);
  const bConnected = await waitForEngine(pageB);
  if (!aConnected || !bConnected) {
    console.log(
      `[browser-test] FAIL — A connected: ${aConnected}, B connected: ${bConnected}`
    );
    await browser.close();
    process.exit(1);
  }
  console.log("[browser-test] Both connected.");

  // ---------- Phase 2: both see each other ----------
  let aInfo = await getEngineInfo(pageA);
  let bInfo = await getEngineInfo(pageB);
  const aRemote = aInfo?.remote?.length ?? 0;
  const bRemote = bInfo?.remote?.length ?? 0;

  console.log(
    `[browser-test] Remotes: A sees ${aRemote}, B sees ${bRemote}`
  );

  if (aRemote < 1 || bRemote < 1) {
    console.log("[browser-test] FAIL — not all players visible");
    await browser.close();
    process.exit(1);
  }
  console.log("[browser-test] Both see each other.");

  // ---------- Phase 3: movement syncs ----------
  // Identify B's entry in A's remote list (by closest to B's known position).
  const bStart = bInfo.local;
  const aRemotesBefore = aInfo.remote;
  const { entry: aViewOfBBefore } = closestEntry(aRemotesBefore, bStart);

  if (!aViewOfBBefore) {
    console.log("[browser-test] FAIL — A has no matching remote for B");
    await browser.close();
    process.exit(1);
  }

  console.log(
    `[browser-test] B start: (${bStart.x.toFixed(2)}, ${bStart.z.toFixed(2)}) | A view of B before: (${aViewOfBBefore.x.toFixed(2)}, ${aViewOfBBefore.z.toFixed(2)}) dist=${closestEntry(aRemotesBefore, bStart).dist.toFixed(2)}`
  );

  // Press W in page B for 2 seconds to move forward.
  await pageB.keyboard.down("KeyW");
  await sleep(2000);
  await pageB.keyboard.up("KeyW");

  // Wait for server to broadcast the change.
  await sleep(600);

  const bAfter = (await getEngineInfo(pageB))?.local;
  const aRemotesAfter = (await getEngineInfo(pageA))?.remote;
  const { entry: aViewOfBAfter } = closestEntry(aRemotesAfter, bStart);

  if (!bAfter || !aViewOfBAfter) {
    console.log("[browser-test] FAIL — lost remote entry after movement");
    await browser.close();
    process.exit(1);
  }

  const dx = Math.abs(aViewOfBAfter.x - aViewOfBBefore.x);
  const dz = Math.abs(aViewOfBAfter.z - aViewOfBBefore.z);
  const moved = dx + dz > 0.5;

  console.log(
    `[browser-test] B after: (${bAfter.x.toFixed(2)}, ${bAfter.z.toFixed(2)}) | A view of B after: (${aViewOfBAfter.x.toFixed(2)}, ${aViewOfBAfter.z.toFixed(2)}) | moved (${dx.toFixed(2)}, ${dz.toFixed(2)})`
  );

  if (moved) {
    console.log(
      `[browser-test] PASS — two players connected, see each other, movement syncs`
    );
  } else {
    console.log(`[browser-test] FAIL — movement did not sync`);
  }

  await browser.close();
  process.exit(moved ? 0 : 1);
}

main().catch((err) => {
  console.error("[browser-test] ERROR:", err.message || err);
  process.exit(1);
});
