import { Server } from "colyseus";
import { TeamDeathmatchRoom } from "./rooms/TeamDeathmatchRoom";

const port = Number(process.env.PORT || 2567);

const gameServer = new Server();

gameServer.define("tdm", TeamDeathmatchRoom);

gameServer.listen(port).then(() => {
  console.log(`Deashot game server listening on ws://localhost:${port}`);
});
