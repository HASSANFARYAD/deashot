import { createServer, type Server as HttpServer } from "node:http";
import * as Sentry from "@sentry/node";
import { Server, RedisPresence } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TeamDeathmatchRoom } from "./rooms/TeamDeathmatchRoom";
import { logStartupConfig } from "./config";

const port = Number(process.env.PORT || 2567);
const REDIS_URL = process.env.REDIS_URL;
const SENTRY_DSN = process.env.SENTRY_DSN;

// Opt-in error reporting: only active when SENTRY_DSN is configured.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
  });
  Sentry.setTag("service", "game-server");
}

// Resolve configuration before listening: a production deploy missing
// JWT_SECRET throws here rather than accepting forged tokens later.
logStartupConfig();

const httpServer: HttpServer = createServer((req, res) => {
  // Basic liveness probe for Compose healthchecks / uptime monitors.
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

// Optional Redis-backed presence when REDIS_URL is set (multi-instance). The
// default in-memory presence works fine for a single game-server instance.
let presence: RedisPresence | undefined;
if (REDIS_URL) {
  presence = new RedisPresence(REDIS_URL);
}

const gameServer = new Server({
  presence,
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("tdm", TeamDeathmatchRoom);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Deashot game server listening on ws://0.0.0.0:${port}`);
});

// Capture uncaught errors in Sentry, then rethrow so the process still dies
// loudly (a long-running match server must not swallow fatal state corruption).
process.on("uncaughtException", (err) => {
  if (SENTRY_DSN) Sentry.captureException(err);
  throw err;
});
process.on("unhandledRejection", (reason) => {
  if (SENTRY_DSN) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
