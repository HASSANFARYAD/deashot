import { Client, Room } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { MAX_PLAYERS, MATCH_DURATION } from "@deashot/shared";
import {
  PLAYER_MAX_HEALTH,
  PLAYER_SPEED,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_JUMP_VELOCITY,
  GRAVITY,
} from "@deashot/game-config";

/** Syncable player state schema sent to all clients. */
export class PlayerStateSchema extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") team: "blue" | "red" = "blue";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") yaw: number = 0;
  @type("number") pitch: number = 0;
  @type("number") health: number = PLAYER_MAX_HEALTH;
  @type("number") maxHealth: number = PLAYER_MAX_HEALTH;
  @type("boolean") alive: boolean = true;
  @type("number") kills: number = 0;
  @type("number") deaths: number = 0;
}

/** Syncable match state schema. */
export class MatchStateSchema extends Schema {
  @type("string") id: string = "";
  @type("string") mode: string = "tdm";
  @type("string") map: string = "arena";
  @type("string") phase: "waiting" | "in-progress" | "ended" = "waiting";
  @type("number") timeRemaining: number = MATCH_DURATION;
  @type("number") blueScore: number = 0;
  @type("number") redScore: number = 0;
  @type({ map: PlayerStateSchema }) players = new MapSchema<PlayerStateSchema>();
}

/** Non-synced per-player simulation state. */
interface SimPlayer {
  velX: number;
  velY: number;
  velZ: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAt: number;
  yaw: number;
  pitch: number;
}

interface PendingInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  yaw: number;
  pitch: number;
  shoot: boolean;
  reload: boolean;
}

const SPAWNS = {
  blue: [
    { x: -20, y: 0, z: 0 },
    { x: -20, y: 0, z: 5 },
    { x: -20, y: 0, z: -5 },
    { x: -20, y: 0, z: 10 },
  ],
  red: [
    { x: 20, y: 0, z: 0 },
    { x: 20, y: 0, z: 5 },
    { x: 20, y: 0, z: -5 },
    { x: 20, y: 0, z: -10 },
  ],
};

export class TeamDeathmatchRoom extends Room<MatchStateSchema> {
  maxClients = MAX_PLAYERS;

  private sim = new Map<string, SimPlayer>();
  private inputs = new Map<string, PendingInput>();
  private timeRemaining = MATCH_DURATION;
  private phase: "waiting" | "in-progress" | "ended" = "waiting";

  onCreate(_options: any) {
    this.setState(new MatchStateSchema());
    this.state.id = `tdm-${this.roomId}`;

    this.setSimulationInterval((dt) => this.onTick(dt), 1000 / 60);

    this.onMessage("input", (client, input: any) => {
      if (!input || typeof input !== "object") return;
      this.inputs.set(client.sessionId, {
        forward: !!input.forward,
        backward: !!input.backward,
        left: !!input.left,
        right: !!input.right,
        jump: !!input.jump,
        yaw: isFinite(input.yaw) ? input.yaw : 0,
        pitch: isFinite(input.pitch) ? input.pitch : 0,
        shoot: !!input.shoot,
        reload: !!input.reload,
      });
    });
  }

  onJoin(client: Client) {
    const name = (client as any).auth?.username || client.sessionId.slice(0, 6);
    const blueCount = this.playerCountOf("blue");
    const redCount = this.playerCountOf("red");
    const team: "blue" | "red" = blueCount <= redCount ? "blue" : "red";
    const spawn = SPAWNS[team][blueCount % SPAWNS[team].length];

    const p = new PlayerStateSchema();
    p.id = client.sessionId;
    p.name = name;
    p.team = team;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.health = PLAYER_MAX_HEALTH;
    p.alive = true;
    this.state.players.set(client.sessionId, p);

    this.sim.set(client.sessionId, {
      velX: 0,
      velY: 0,
      velZ: 0,
      alive: true,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      yaw: 0,
      pitch: 0,
    });

    // Auto-start when enough players join (MVP: start on first join for testing).
    if (this.state.phase === "waiting") {
      this.state.phase = "in-progress";
      this.phase = "in-progress";
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.sim.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
  }

  onDispose() {
    this.sim.clear();
    this.inputs.clear();
  }

  private playerCountOf(team: "blue" | "red"): number {
    let n = 0;
    for (const p of this.state.players.values()) {
      if (p.team === team) n++;
    }
    return n;
  }

  private onTick(dt: number) {
    if (this.phase === "ended") return;

    if (this.phase === "in-progress") {
      this.timeRemaining -= dt / 1000;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.endMatch();
        return;
      }
      this.state.timeRemaining = this.timeRemaining;
    }

    const h = 1 / 60;
    for (const [id, p] of this.state.players) {
      const s = this.sim.get(id);
      if (!s) continue;
      const input = this.inputs.get(id);

      // Rotation always applies even while dead.
      if (input) {
        s.yaw = input.yaw;
        s.pitch = input.pitch;
        p.yaw = input.yaw;
        p.pitch = input.pitch;
      }

      if (!p.alive) {
        // Respawn dead players.
        if (s.respawnAt > 0 && Date.now() / 1000 >= s.respawnAt) {
          s.alive = true;
          p.alive = true;
          p.health = PLAYER_MAX_HEALTH;
          const spawn = SPAWNS[p.team as "blue" | "red"][s.deaths % (SPAWNS[p.team as "blue" | "red"].length)];
          p.x = spawn.x;
          p.y = spawn.y;
          p.z = spawn.z;
          s.velX = 0;
          s.velY = 0;
          s.velZ = 0;
        }
        continue;
      }

      if (!input) continue;

      // Movement (MVP world: axial, gravity along Y, ignores facing).
      let moveX = 0;
      let moveZ = 0;
      if (input.forward) moveZ -= 1;
      if (input.backward) moveZ += 1;
      if (input.left) moveX -= 1;
      if (input.right) moveX += 1;

      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0) {
        moveX /= len;
        moveZ /= len;
        s.velX += moveX * PLAYER_ACCELERATION * h;
        s.velZ += moveZ * PLAYER_ACCELERATION * h;
      }

      const friction = PLAYER_FRICTION * h;
      s.velX *= Math.max(0, 1 - friction);
      s.velZ *= Math.max(0, 1 - friction);

      const hSpeed = Math.sqrt(s.velX * s.velX + s.velZ * s.velZ);
      if (hSpeed > PLAYER_SPEED) {
        s.velX = (s.velX / hSpeed) * PLAYER_SPEED;
        s.velZ = (s.velZ / hSpeed) * PLAYER_SPEED;
      }

      if (input.jump && p.y <= 0.01) {
        s.velY = PLAYER_JUMP_VELOCITY;
      }
      s.velY += GRAVITY * h;

      p.x += s.velX * h;
      p.y += s.velY * h;
      p.z += s.velZ * h;

      if (p.y < 0) {
        p.y = 0;
        s.velY = 0;
      }
    }
  }

  private endMatch() {
    this.phase = "ended";
    this.state.phase = "ended";
    this.broadcast("match-ended", {
      blueScore: this.state.blueScore,
      redScore: this.state.redScore,
    });
  }
}
