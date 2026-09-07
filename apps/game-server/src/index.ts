import { createServer, type Server as HttpServer } from "node:http";
import { Server, RedisPresence } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TeamDeathmatchRoom } from "./rooms/TeamDeathmatchRoom";
import { logStartupConfig } from "./config";

const port = Number(process.env.PORT || 2567);
const REDIS_URL = process.env.REDIS_URL;

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
