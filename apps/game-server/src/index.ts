import { Server } from "colyseus";
import { TeamDeathmatchRoom } from "./rooms/TeamDeathmatchRoom";
import { logStartupConfig } from "./config";

const port = Number(process.env.PORT || 2567);

// Resolve configuration before listening: a production deploy missing
// JWT_SECRET throws here rather than accepting forged tokens later.
logStartupConfig();

const gameServer = new Server();

gameServer.define("tdm", TeamDeathmatchRoom);

gameServer.listen(port).then(() => {
  console.log(`Deashot game server listening on ws://localhost:${port}`);
});
